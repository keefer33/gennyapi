/** Gateway model ids for AI assist (character design, etc.). */
export const AI_ASSIST_MODEL_VALUES = [
  'openai/gpt-5.4-mini',
  'anthropic/claude-opus-4.8',
  'anthropic/claude-sonnet-4.6',
  'anthropic/claude-opus-4.6',
  'xai/grok-4.3',
  'google/gemini-3.5-flash',
  'google/gemini-3.1-flash-lite',
  'deepseek/deepseek-v4-flash',
  'deepseek/deepseek-v4-pro',
  'zai/glm-5.1',
  'minimax/minimax-m2.7-highspeed',
] as const;

export function pickRandomAiAssistModel(): string {
  const values = AI_ASSIST_MODEL_VALUES;
  const index = Math.floor(Math.random() * values.length);
  return values[index] ?? values[0];
}
