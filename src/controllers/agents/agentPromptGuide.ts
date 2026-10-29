import { getGenModelById, getGenModelByModelId } from '../../database/gen_models';
import { promptGuideToolResultFromModel, resolvePromptGuideLookup } from '../../shared/promptGuide';

export async function getModelPromptGuideToolResult(input: {
  gen_model_id?: string;
  model_id?: string;
}): Promise<Record<string, unknown>> {
  const lookup = resolvePromptGuideLookup(input);
  if (lookup.kind === 'missing') {
    return {
      success: false,
      message: 'gen_model_id or model_id is required',
      source: 'none',
      prompt_guide: null,
    };
  }

  try {
    const model =
      lookup.kind === 'id' ? await getGenModelById(lookup.value) : await getGenModelByModelId(lookup.value);
    return promptGuideToolResultFromModel(model);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load prompt guide';
    return { success: false, message, source: 'none', prompt_guide: null };
  }
}
