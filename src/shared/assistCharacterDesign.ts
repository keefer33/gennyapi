import { createGateway, generateText } from 'ai';
import { AppError } from '../app/error';
import { badRequest } from '../app/response';
import { pickRandomAiAssistModel } from './aiModelOptions';
import { getMimeType } from './fileUtils';

/** Aligns with genny `CHARACTER_GENDER_OPTIONS` / voice form. */
export const CHARACTER_DESIGN_GENDERS = ['male', 'female', 'neutral'] as const;

/** Aligns with genny `CHARACTER_AGE_OPTIONS`. */
export const CHARACTER_DESIGN_AGES = [
  'young',
  'young_adult',
  'early_middle_aged',
  'late_middle_aged',
  'senior',
] as const;

/** Aligns with genny `MAX_CHARACTER_DESCRIPTION_LENGTH`. */
export const CHARACTER_DESCRIPTION_MIN = 120;
export const CHARACTER_DESCRIPTION_MAX = 4000;

const MAX_NAME_LENGTH = 120;

const GENDER_LIST = CHARACTER_DESIGN_GENDERS.join(', ');
const AGE_LIST = CHARACTER_DESIGN_AGES.join(', ');

const SYSTEM_PROMPT = `You help users write rich visual character descriptions for AI image and video generation.

Character description (description field):
Write a vivid, concrete portrait a model can render. Cover as many applicable details as possible, woven into clear prose (not a bare bullet list unless the user already used one). Include when relevant:
- Apparent age or life stage and gender presentation
- Height and build (e.g. tall, petite, athletic, broad-shouldered)
- Skin tone and undertones (specific, respectful wording)
- Face shape and distinctive facial features
- Eye color, shape, and expression
- Hair color, length, texture, and style
- Ethnicity or cultural/regional appearance cues (respectful and specific; align with ethnicity metadata when set)
- Clothing or signature outfit (era, colors, fabrics)
- Posture, demeanor, and personality cues visible in appearance
- Accessories, scars, freckles, tattoos, glasses, jewelry, or other distinguishing marks
Avoid vague filler ("beautiful", "stunning") without concrete detail. Avoid contradictory traits. Do not include dialogue or backstory unless it directly affects visible appearance.
Length MUST be between ${CHARACTER_DESCRIPTION_MIN} and ${CHARACTER_DESCRIPTION_MAX} characters.

Metadata (always include every key in your JSON):
- name: short display name (2–5 words, max ${MAX_NAME_LENGTH} characters)
- gender: exactly one of ${GENDER_LIST}
- age: exactly one of ${AGE_LIST}
- ethnicity: a specific, respectful label for heritage or regional appearance (e.g. "East Asian", "Nigerian", "Irish", "Latina", "Indigenous Australian"); not a full sentence

If the user message lists a field as ALREADY SET, return that exact value unchanged for that field. If listed as NEEDS VALUE, invent a fitting value consistent with the description.

Respond with ONLY valid JSON, no markdown fences:
{"description":"...","name":"...","gender":"...","age":"...","ethnicity":"..."}`;

const REFERENCE_IMAGE_SYSTEM_APPEND = `

Reference image mode (when the user attached a reference photo):
The character will be created with an image edit model. The reference image supplies the base likeness; your description is the edit/generation prompt for new character look views.
- Study the attached image carefully before writing.
- Keep the description consistent with visible traits (face, hair, skin tone, apparent age, gender presentation, distinguishing marks).
- Expand with concrete details useful for generation: outfit, pose, expression, lighting, background, art style, and camera framing.
- Do not contradict clear visible traits in the reference image.
- Infer metadata (gender, age, ethnicity, name) from the image when the user has not already set those fields.`;

const VISION_ASSIST_MODELS = [
  'anthropic/claude-sonnet-4.6',
  'google/gemini-3.5-flash',
  'openai/gpt-5.4-mini',
] as const;

const MAX_REFERENCE_IMAGE_URL_LENGTH = 2000;

export type CharacterDesignAssistInput = {
  description?: string | null;
  name?: string | null;
  gender?: string | null;
  age?: string | null;
  ethnicity?: string | null;
  /** Optional reference image for create-character-new (image edit model). */
  referenceImageUrl?: string | null;
};

export type CharacterDesignAssistResult = {
  description: string;
  name: string;
  gender: string | null;
  age: string | null;
  ethnicity: string | null;
};

type ParsedAssistJson = {
  description: string;
  name?: string;
  gender?: string;
  age?: string;
  ethnicity?: string;
};

function trimField(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function clampText(text: string, min: number, max: number): string {
  const t = text.trim();
  if (t.length <= max && t.length >= min) return t;
  if (t.length > max) {
    const cut = t.slice(0, max);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > min ? cut.slice(0, lastSpace) : cut).trim();
  }
  return t;
}

function pickString(parsed: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = parsed[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function normalizeGender(value: string): string | null {
  const g = value.trim().toLowerCase();
  if ((CHARACTER_DESIGN_GENDERS as readonly string[]).includes(g)) return g;
  return null;
}

function normalizeAge(value: string): string | null {
  const raw = value.trim().toLowerCase().replace(/\s+/g, '_');
  const direct = (CHARACTER_DESIGN_AGES as readonly string[]).find((a) => a === raw);
  if (direct) return direct;
  const aliases: Record<string, (typeof CHARACTER_DESIGN_AGES)[number]> = {
    young_adult: 'young_adult',
    'young-adult': 'young_adult',
    early_middle_age: 'early_middle_aged',
    early_middle_aged: 'early_middle_aged',
    late_middle_age: 'late_middle_aged',
    late_middle_aged: 'late_middle_aged',
    middle_aged: 'early_middle_aged',
    elderly: 'senior',
    old: 'senior',
  };
  return aliases[raw] ?? null;
}

function normalizeEthnicity(value: string): string | null {
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, 120);
}

function parseAssistJson(raw: string): ParsedAssistJson | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const description = pickString(parsed, 'description', 'characterDescription', 'character_description');
    if (!description) return null;
    return {
      description,
      name: pickString(parsed, 'name', 'defaultName', 'default_name') || undefined,
      gender: pickString(parsed, 'gender') || undefined,
      age: pickString(parsed, 'age', 'ageGroup', 'age_group') || undefined,
      ethnicity: pickString(parsed, 'ethnicity') || undefined,
    };
  } catch {
    return null;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeReferenceImageUrl(value: string | null | undefined): string | null {
  const trimmed = trimField(value);
  if (!trimmed) return null;
  if (trimmed.length > MAX_REFERENCE_IMAGE_URL_LENGTH) {
    throw badRequest('referenceImageUrl is too long');
  }
  if (!isHttpUrl(trimmed)) {
    throw badRequest('referenceImageUrl must be a valid http or https URL');
  }
  return trimmed;
}

function pickAiAssistModel(referenceImageUrl: string | null): string {
  if (!referenceImageUrl) return pickRandomAiAssistModel();
  const index = Math.floor(Math.random() * VISION_ASSIST_MODELS.length);
  return VISION_ASSIST_MODELS[index] ?? VISION_ASSIST_MODELS[0];
}

function buildUserMessage(input: CharacterDesignAssistInput, referenceImageUrl: string | null): string {
  const description = trimField(input.description);
  const name = trimField(input.name);
  const gender = trimField(input.gender);
  const age = trimField(input.age);
  const ethnicity = trimField(input.ethnicity);

  const fieldStatus = (label: string, value: string) =>
    value ? `${label}: ALREADY SET → "${value}"` : `${label}: NEEDS VALUE`;

  const metadataBlock = [
    fieldStatus('name', name),
    fieldStatus('gender', gender),
    fieldStatus('age', age),
    fieldStatus('ethnicity', ethnicity),
  ].join('\n');

  const textBlock = description
    ? `Current character description:\n${description}`
    : 'Current character description: (empty)';

  const mode = !description ? 'generate' : 'enhance';
  const referenceBlock = referenceImageUrl
    ? 'Reference image: ATTACHED — use the provided photo as the visual source of truth for likeness and visible traits.'
    : 'Reference image: NONE — text-only character design.';

  return `Mode: ${mode}
${referenceBlock}
${textBlock}

Metadata:
${metadataBlock}

Generate or improve the visual description. For each metadata field marked NEEDS VALUE, invent a value that matches the portrait. For ALREADY SET, echo the exact value in your JSON.`;
}

function mergeMetadata(
  input: CharacterDesignAssistInput,
  parsed: ParsedAssistJson
): Pick<CharacterDesignAssistResult, 'name' | 'gender' | 'age' | 'ethnicity'> {
  const inputGender = trimField(input.gender);
  const inputAge = trimField(input.age);
  const inputEthnicity = trimField(input.ethnicity);
  const inputName = trimField(input.name);

  const gender = inputGender
    ? normalizeGender(inputGender) ?? inputGender
    : normalizeGender(parsed.gender ?? '') ?? 'neutral';

  const age = inputAge
    ? normalizeAge(inputAge) ?? inputAge
    : normalizeAge(parsed.age ?? '') ?? 'young_adult';

  const ethnicity = inputEthnicity
    ? normalizeEthnicity(inputEthnicity)
    : normalizeEthnicity(parsed.ethnicity ?? '');

  const aiName = trimField(parsed.name).slice(0, MAX_NAME_LENGTH);
  const name = inputName || aiName || 'New character';

  return { name, gender, age, ethnicity };
}

export async function assistCharacterDesign(
  input: CharacterDesignAssistInput
): Promise<CharacterDesignAssistResult> {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError('AI gateway is not configured', {
      statusCode: 503,
      code: 'service_unavailable',
      expose: true,
    });
  }

  const referenceImageUrl = normalizeReferenceImageUrl(input.referenceImageUrl);
  const gateway = createGateway({ apiKey });
  const modelId = pickAiAssistModel(referenceImageUrl);
  const model = gateway(modelId);
  const userMessage = buildUserMessage(input, referenceImageUrl);
  const system = referenceImageUrl ? `${SYSTEM_PROMPT}${REFERENCE_IMAGE_SYSTEM_APPEND}` : SYSTEM_PROMPT;

  const userContent = referenceImageUrl
    ? [
        { type: 'text' as const, text: userMessage },
        {
          type: 'file' as const,
          data: referenceImageUrl,
          mediaType: getMimeType(referenceImageUrl),
        },
      ]
    : userMessage;

  const result = await generateText({
    model,
    system,
    messages: [{ role: 'user', content: userContent }],
  });

  const parsed = parseAssistJson(result.text ?? '');
  if (!parsed) {
    throw new AppError('AI returned an invalid character design response', {
      statusCode: 502,
      code: 'character_design_assist_parse_failed',
      expose: true,
    });
  }

  const description = clampText(parsed.description, CHARACTER_DESCRIPTION_MIN, CHARACTER_DESCRIPTION_MAX);

  if (description.length < CHARACTER_DESCRIPTION_MIN) {
    throw new AppError(
      `Generated description is too short (minimum ${CHARACTER_DESCRIPTION_MIN} characters). Try again.`,
      {
        statusCode: 502,
        code: 'character_design_assist_description_too_short',
        expose: true,
      }
    );
  }

  const metadata = mergeMetadata(input, parsed);

  return {
    description,
    ...metadata,
  };
}
