export const INWORLD_GENDERS = new Set(['male', 'female', 'neutral']);

export function normalizeInworldGender(value: string | undefined): string | undefined {
  const g = value?.trim().toLowerCase();
  if (!g || !INWORLD_GENDERS.has(g)) return undefined;
  return g;
}
