import { createGateway, generateText } from 'ai';
import { AppError } from '../app/error';
import { pickRandomAiAssistModel } from './aiModelOptions';

/** Aligns with genny `MAX_SPEECH_CHARS` / `SPEECH_SCRIPT_ASSIST_MAX_CHARS`. */
export const SPEECH_SCRIPT_MAX = 2000;
/** Minimum length for a useful spoken script. */
export const SPEECH_SCRIPT_MIN = 30;
export const MAX_SPEECH_TITLE_LENGTH = 120;

/**
 * Steering rules for AI assist (keep in sync with genny `buildSpeechSteeringAssistInstructions`).
 */
const STEERING_APPENDIX = `Inworld TTS steering rules:
- Delivery (once at the start): Pick Delivery to set how the whole line is performed — mood, pace, pitch, or style. Use a single English instruction in square brackets before your words. Replace it anytime; do not add a second delivery block later in the script.
Example: [say with deliberate pauses in a low voice] I have been waiting for this moment.
- Non-verbals (inline): Insert sounds anywhere in the script — laughs, sighs, breaths, and similar cues.
Example: I can't believe you did that [laugh] that is unbelievable.
- Pauses (inline): Use SSML break tags at the cursor. Each break can be up to 10 seconds. Up to 20 pause tags per script.
Example: Welcome back <break time="1s" /> let us get started.
- Emphasis: Capitalize a whole WORD for strong stress, or a syllable inside a word (e.g. absoLUTEly) for finer emphasis.
Example: That is NOT what I meant.
- Good habits: Keep delivery instructions simple and in English. Match the tone to what is being said. Avoid opposite directions in one tag (for example, very loud and whisper together).

Available non-verbal tags: [laugh], [breathe], [clear throat], [sigh], [cough], [yawn]
Delivery tag examples: [overwhelmed with excitement and barely able to contain yourself], [slow and hushed with every word weighted by grief], [say with force], [say with deliberate pauses], [say with a falling pitch], [very quiet], [say in a low tone], [whisper in a hushed style]
Pause tag examples: <break time="250ms" />, <break time="500ms" />, <break time="1s" />, <break time="1500ms" />, <break time="2s" />, <break time="3s" />, <break time="5s" />
Limits: at most 20 pause tags per script; each pause up to 10s.
Opening delivery tags must be lowercase English without trailing punctuation.`;

const SYSTEM_PROMPT = `You help users write speech scripts for Inworld text-to-speech with delivery steering, non-verbal sounds, pauses, and emphasis.

${STEERING_APPENDIX}

Script writing:
- Write natural spoken dialogue suited to the selected voice (name, description, gender, age, accent when provided).
- Vary content when generating random scripts — monologues, announcements, greetings, storytelling, customer support lines, etc.
- When enhancing, preserve the user's intent and improve delivery tags, pacing, non-verbals, and emphasis.
- Length MUST be between ${SPEECH_SCRIPT_MIN} and ${SPEECH_SCRIPT_MAX} characters.
- Include one opening delivery tag when it adds performance value.

Title (always include in JSON):
- Short label for the speech (2–6 words, max ${MAX_SPEECH_TITLE_LENGTH} characters).
- If the user message lists title as ALREADY SET, return that exact value unchanged.

Respond with ONLY valid JSON, no markdown fences:
{"text":"...","title":"..."}`;

export type SpeechScriptAssistInput = {
  text?: string | null;
  title?: string | null;
  voiceName?: string | null;
  voiceDescription?: string | null;
  gender?: string | null;
  age?: string | null;
  accent?: string | null;
  /** When true, ignore current script and invent a fresh random line for this voice. */
  random?: boolean;
};

export type SpeechScriptAssistResult = {
  text: string;
  title: string;
};

type ParsedAssistJson = {
  text: string;
  title?: string;
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

function parseAssistJson(raw: string): ParsedAssistJson | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const text = pickString(parsed, 'text', 'script', 'speech');
    if (!text) return null;
    return {
      text,
      title: pickString(parsed, 'title') || undefined,
    };
  } catch {
    return null;
  }
}

function buildUserMessage(input: SpeechScriptAssistInput): string {
  const text = trimField(input.text);
  const title = trimField(input.title);
  const voiceName = trimField(input.voiceName);
  const voiceDescription = trimField(input.voiceDescription);
  const gender = trimField(input.gender);
  const age = trimField(input.age);
  const accent = trimField(input.accent);
  const random = input.random === true;

  const voiceLines = [
    voiceName ? `Voice name: ${voiceName}` : null,
    voiceDescription ? `Voice description: ${voiceDescription}` : null,
    gender ? `Gender: ${gender}` : null,
    age ? `Age: ${age}` : null,
    accent ? `Accent: ${accent}` : null,
  ].filter(Boolean);

  const voiceBlock = voiceLines.length > 0 ? voiceLines.join('\n') : 'Voice: (not specified)';

  const titleStatus = title
    ? `title: ALREADY SET → "${title}"`
    : 'title: NEEDS VALUE (invent a short label that fits the script)';

  let mode: string;
  if (random) {
    mode = 'random';
  } else if (!text) {
    mode = 'generate';
  } else {
    mode = 'enhance';
  }

  const textBlock = text
    ? `Current script:\n${text}`
    : 'Current script: (empty — write a complete new script for this voice)';

  return `Mode: ${mode}
${voiceBlock}

${textBlock}

${titleStatus}

${random ? 'Ignore any current script. Invent a fresh, creative spoken line suited to this voice.' : 'Generate or improve the script using Inworld steering tags. For title NEEDS VALUE, invent a fitting short label.'}`;
}

export async function assistSpeechScript(
  input: SpeechScriptAssistInput
): Promise<SpeechScriptAssistResult> {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError('AI gateway is not configured', {
      statusCode: 503,
      code: 'service_unavailable',
      expose: true,
    });
  }

  const gateway = createGateway({ apiKey });
  const model = gateway(pickRandomAiAssistModel());
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
    throw new AppError('AI returned an invalid speech script response', {
      statusCode: 502,
      code: 'speech_script_assist_parse_failed',
      expose: true,
    });
  }

  const text = clampText(parsed.text, SPEECH_SCRIPT_MIN, SPEECH_SCRIPT_MAX);
  if (text.length < SPEECH_SCRIPT_MIN) {
    throw new AppError(
      `Generated script is too short (minimum ${SPEECH_SCRIPT_MIN} characters). Try again.`,
      {
        statusCode: 502,
        code: 'speech_script_assist_too_short',
        expose: true,
      }
    );
  }

  const inputTitle = trimField(input.title);
  const aiTitle = trimField(parsed.title).slice(0, MAX_SPEECH_TITLE_LENGTH);
  const title = inputTitle || aiTitle || 'Speech';

  return { text, title };
}
