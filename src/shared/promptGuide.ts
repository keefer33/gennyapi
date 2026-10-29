export type PromptGuideSource = 'model' | 'brand' | 'none';

export type PromptGuideBrand = {
  prompt_guide?: string | null;
  name?: string | null;
  slug?: string | null;
};

export type PromptGuideFields = {
  id?: string | null;
  model_id?: string | null;
  model_name?: string | null;
  prompt_guide?: string | null;
  brand_name?: PromptGuideBrand | string | null;
};

export const PROMPT_GUIDE_MAX_INJECT_CHARS = 6000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function trimPromptGuide(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function brandPromptGuide(brandName: PromptGuideFields['brand_name']): string | null {
  if (!brandName || typeof brandName === 'string') return null;
  return trimPromptGuide(brandName.prompt_guide);
}

export function effectivePromptGuide(model: PromptGuideFields | null | undefined): string | null {
  if (!model) return null;
  return trimPromptGuide(model.prompt_guide) || brandPromptGuide(model.brand_name);
}

export function promptGuideSource(model: PromptGuideFields | null | undefined): PromptGuideSource {
  if (!model) return 'none';
  if (trimPromptGuide(model.prompt_guide)) return 'model';
  if (brandPromptGuide(model.brand_name)) return 'brand';
  return 'none';
}

export function truncatePromptGuide(
  guide: string | null | undefined,
  max = PROMPT_GUIDE_MAX_INJECT_CHARS
): string | null {
  const trimmed = trimPromptGuide(guide);
  if (!trimmed) return null;
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}\n\n[Guide truncated]`;
}

export function resolvePromptGuideLookup(input: {
  gen_model_id?: string | null;
  model_id?: string | null;
}): { kind: 'id'; value: string } | { kind: 'model_id'; value: string } | { kind: 'missing' } {
  const genModelId = typeof input.gen_model_id === 'string' ? input.gen_model_id.trim() : '';
  const modelId = typeof input.model_id === 'string' ? input.model_id.trim() : '';
  if (genModelId) return { kind: 'id', value: genModelId };
  if (modelId) return { kind: 'model_id', value: modelId };
  return { kind: 'missing' };
}

export function promptGuideToolResultFromModel(model: PromptGuideFields | null | undefined): Record<string, unknown> {
  if (!model) {
    return {
      success: false,
      message: 'Model not found',
      source: 'none',
      prompt_guide: null,
    };
  }

  const source = promptGuideSource(model);
  const brand =
    model.brand_name && typeof model.brand_name === 'object'
      ? { name: model.brand_name.name ?? null, slug: model.brand_name.slug ?? null }
      : { name: typeof model.brand_name === 'string' ? model.brand_name : null, slug: null };

  return {
    success: true,
    gen_model_id: model.id ?? null,
    model_id: model.model_id ?? null,
    model_name: model.model_name ?? null,
    brand,
    source,
    prompt_guide: effectivePromptGuide(model),
  };
}
