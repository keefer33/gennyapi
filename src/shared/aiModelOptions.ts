/** Gateway model ids for AI assist (character design, etc.). */
export const AI_ASSIST_MODEL_VALUES = [
  'openai/gpt-5.6-luna',
  'anthropic/claude-opus-4.8',
  'xai/grok-4.6',
  'google/gemini-3.8-flash',
] as const;

export function pickRandomAiAssistModel(): string {
  const values = AI_ASSIST_MODEL_VALUES;
  const index = Math.floor(Math.random() * values.length);
  return values[index] ?? values[0];
}
