import { GenModelRow } from '../../database/types';

type OpenaiApiSchema = {
  vendor_model_name?: string;
};

export async function runOpenaiModel(genModel: GenModelRow, _payload: unknown) {
  const apiSchema = (genModel.gen_models_apis_id?.api_schema as OpenaiApiSchema | null) ?? {};
  const vendorModelName =
    typeof apiSchema.vendor_model_name === 'string' ? apiSchema.vendor_model_name.trim() : '';

  // OpenAI image generation is handled by the webhook path; create a task-shaped placeholder here.
  return {
    id: `openai-image-${Date.now()}`,
    request_id: null,
    status: 'pending',
    deferred_to_webhook: true,
    model: vendorModelName,
  };
}
