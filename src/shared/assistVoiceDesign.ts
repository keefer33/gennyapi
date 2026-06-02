import { createGateway, generateText } from 'ai';
import { AppError } from '../app/error';
import {
  VOICE_DESIGN_ACCENTS,
  VOICE_DESIGN_AGES,
  VOICE_DESIGN_GENDERS,
} from './voiceDesignOptions';

export const VOICE_DESIGN_ASSIST_MODEL = 'anthropic/claude-opus-4.7';

/** Inworld design API limits (see designVoice route). */
export const VOICE_DESIGN_PROMPT_MIN = 30;
export const VOICE_DESIGN_PROMPT_MAX = 250;
/** ~5–15 seconds spoken in English per Inworld voice design guidance. */
export const VOICE_DESIGN_PREVIEW_MIN = 50;
export const VOICE_DESIGN_PREVIEW_MAX = 200;

const MAX_DEFAULT_NAME_LENGTH = 120;

const GENDER_LIST = VOICE_DESIGN_GENDERS.join(', ');
const AGE_LIST = VOICE_DESIGN_AGES.join(', ');
const ACCENT_SAMPLE = VOICE_DESIGN_ACCENTS.slice(0, 12).join(', ');

const SYSTEM_PROMPT = `You help users write Inworld Voice Design prompts. Follow Inworld voice design best practices:

Voice description (designPrompt):
- Be specific: gender, language/accent (name the city or region, e.g. "Boston accent"), age range, pitch, pace, timbre, tone, emotional quality.
- Structure: Distinctive qualities → Gender → Language/Accent → Age → Tone → Delivery style → Pacing → Additional qualities → End with "Perfect broadcast quality audio."
- Use specific age ranges when helpful (e.g. "mid-20s to early 30s", "late 60s to early 70s") rather than only "young" or "old".
- Place vocal texture words (raspy, breathy, nasal) in the middle; use "slight" or "natural" to avoid exaggeration.
- Avoid conflicting descriptors (e.g. fast-paced and slow deliberate).
- Length MUST be between ${VOICE_DESIGN_PROMPT_MIN} and ${VOICE_DESIGN_PROMPT_MAX} characters.

Preview script (previewText):
- Match the voice and use case (e.g. customer support tone for a support voice).
- For accented voices, use words/phrasing typical of that accent.
- English script length MUST be between ${VOICE_DESIGN_PREVIEW_MIN} and ${VOICE_DESIGN_PREVIEW_MAX} characters (~5–15 seconds when spoken).
- Write natural spoken dialogue, not stage directions.

Metadata (always include every key in your JSON):
- gender: exactly one of ${GENDER_LIST}
- age: exactly one of ${AGE_LIST}
- accent: a specific accent label consistent with the voice (examples: ${ACCENT_SAMPLE}, …)
- defaultName: short display name for the voice (2–5 words, max ${MAX_DEFAULT_NAME_LENGTH} characters)

If the user message lists a field as ALREADY SET, return that exact value unchanged for that field. If listed as NEEDS VALUE, invent a fitting value that matches the description and script.

Respond with ONLY valid JSON, no markdown fences:
{"designPrompt":"...","previewText":"...","gender":"...","age":"...","accent":"...","defaultName":"..."}`;

export type VoiceDesignAssistInput = {
  designPrompt?: string | null;
  previewText?: string | null;
  gender?: string | null;
  age?: string | null;
  accent?: string | null;
  defaultName?: string | null;
};

export type VoiceDesignAssistResult = {
  designPrompt: string;
  previewText: string;
  gender: string | null;
  age: string | null;
  accent: string | null;
  defaultName: string;
};

type ParsedAssistJson = {
  designPrompt: string;
  previewText: string;
  gender?: string;
  age?: string;
  accent?: string;
  defaultName?: string;
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
  if ((VOICE_DESIGN_GENDERS as readonly string[]).includes(g)) return g;
  return null;
}

function normalizeAge(value: string): string | null {
  const raw = value.trim().toLowerCase().replace(/\s+/g, '_');
  const direct = (VOICE_DESIGN_AGES as readonly string[]).find((a) => a === raw);
  if (direct) return direct;
  const aliases: Record<string, (typeof VOICE_DESIGN_AGES)[number]> = {
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

function normalizeAccent(value: string): string | null {
  const t = value.trim();
  if (!t) return null;
  const exact = (VOICE_DESIGN_ACCENTS as readonly string[]).find(
    (a) => a.toLowerCase() === t.toLowerCase()
  );
  if (exact) return exact;
  const partial = (VOICE_DESIGN_ACCENTS as readonly string[]).find(
    (a) =>
      a.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(a.toLowerCase())
  );
  return partial ?? t;
}

function parseAssistJson(raw: string): ParsedAssistJson | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const designPrompt = pickString(parsed, 'designPrompt', 'design_prompt');
    const previewText = pickString(parsed, 'previewText', 'preview_text');
    if (!designPrompt || !previewText) return null;
    return {
      designPrompt,
      previewText,
      gender: pickString(parsed, 'gender') || undefined,
      age: pickString(parsed, 'age', 'ageGroup', 'age_group') || undefined,
      accent: pickString(parsed, 'accent') || undefined,
      defaultName: pickString(parsed, 'defaultName', 'default_name', 'name') || undefined,
    };
  } catch {
    return null;
  }
}

function buildUserMessage(input: VoiceDesignAssistInput): string {
  const designPrompt = trimField(input.designPrompt);
  const previewText = trimField(input.previewText);
  const gender = trimField(input.gender);
  const age = trimField(input.age);
  const accent = trimField(input.accent);
  const defaultName = trimField(input.defaultName);

  const fieldStatus = (label: string, value: string) =>
    value ? `${label}: ALREADY SET → "${value}"` : `${label}: NEEDS VALUE`;

  const metadataBlock = [
    fieldStatus('gender', gender),
    fieldStatus('age', age),
    fieldStatus('accent', accent),
    fieldStatus('defaultName', defaultName),
  ].join('\n');

  const textBlock = [
    designPrompt ? `Current voice description:\n${designPrompt}` : 'Current voice description: (empty)',
    previewText ? `Current preview script:\n${previewText}` : 'Current preview script: (empty)',
  ].join('\n\n');

  const mode =
    !designPrompt && !previewText
      ? 'generate'
      : designPrompt && previewText
        ? 'enhance'
        : 'enhance_partial';

  return `Mode: ${mode}
${textBlock}

Metadata:
${metadataBlock}

Generate or improve designPrompt and previewText. For each metadata field marked NEEDS VALUE, invent a value that fits the voice. For ALREADY SET, echo the exact value in your JSON.`;
}

function mergeMetadata(
  input: VoiceDesignAssistInput,
  parsed: ParsedAssistJson
): Pick<VoiceDesignAssistResult, 'gender' | 'age' | 'accent' | 'defaultName'> {
  const inputGender = trimField(input.gender);
  const inputAge = trimField(input.age);
  const inputAccent = trimField(input.accent);
  const inputName = trimField(input.defaultName);

  const gender = inputGender
    ? normalizeGender(inputGender) ?? inputGender
    : normalizeGender(parsed.gender ?? '') ?? 'neutral';

  const age = inputAge
    ? normalizeAge(inputAge) ?? inputAge
    : normalizeAge(parsed.age ?? '') ?? 'young_adult';

  const accent = inputAccent
    ? normalizeAccent(inputAccent) ?? inputAccent
    : normalizeAccent(parsed.accent ?? '') ?? 'American';

  const aiName = trimField(parsed.defaultName).slice(0, MAX_DEFAULT_NAME_LENGTH);
  const defaultName = inputName || aiName || 'Custom voice';

  return { gender, age, accent, defaultName };
}

export async function assistVoiceDesign(
  input: VoiceDesignAssistInput
): Promise<VoiceDesignAssistResult> {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError('AI gateway is not configured', {
      statusCode: 503,
      code: 'service_unavailable',
      expose: true,
    });
  }

  const gateway = createGateway({ apiKey });
  const model = gateway(VOICE_DESIGN_ASSIST_MODEL);
  const userMessage = buildUserMessage(input);

  const result = await generateText({
    model,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    providerOptions: {
      gateway: { caching: 'auto' },
    },
  });

  const parsed = parseAssistJson(result.text ?? '');
  if (!parsed) {
    throw new AppError('AI returned an invalid voice design response', {
      statusCode: 502,
      code: 'voice_design_assist_parse_failed',
      expose: true,
    });
  }

  const designPrompt = clampText(parsed.designPrompt, VOICE_DESIGN_PROMPT_MIN, VOICE_DESIGN_PROMPT_MAX);
  const previewText = clampText(parsed.previewText, VOICE_DESIGN_PREVIEW_MIN, VOICE_DESIGN_PREVIEW_MAX);

  if (designPrompt.length < VOICE_DESIGN_PROMPT_MIN) {
    throw new AppError(
      `Generated description is too short (minimum ${VOICE_DESIGN_PROMPT_MIN} characters). Try again.`,
      {
        statusCode: 502,
        code: 'voice_design_assist_prompt_too_short',
        expose: true,
      }
    );
  }
  if (previewText.length < VOICE_DESIGN_PREVIEW_MIN) {
    throw new AppError(
      `Generated preview script is too short (minimum ${VOICE_DESIGN_PREVIEW_MIN} characters). Try again.`,
      {
        statusCode: 502,
        code: 'voice_design_assist_preview_too_short',
        expose: true,
      }
    );
  }

  const metadata = mergeMetadata(input, parsed);

  return {
    designPrompt,
    previewText,
    ...metadata,
  };
}
