import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv({ path: resolve(__dirname, '../../gennyadmin/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';
const XAI_API_KEY = (process.env.XAI_API_KEY || process.env.VITE_XAI_API_KEY || '').trim();

const VENDOR = 'xai';
const BRAND_NAME = 'Xai';
const BRAND_SLUG = 'xai';
const XAI_BILLING_URL = 'https://docs.x.ai/developers/pricing';
const PRODUCT = 'grok-imagine-video-v1.5-lite';
const VENDOR_MODEL = 'grok-imagine-video-1.5-lite';

const SOURCE_MODELS = [
  'x-ai/grok-imagine-video-v1.5/text-to-video',
  'x-ai/grok-imagine-video-v1.5/image-to-video',
] as const;

type Json = Record<string, unknown>;

type SourceRow = {
  id: string;
  model_id: string;
  model_type: string | null;
  generation_type: string | null;
  sort_order: number | null;
  gen_models_apis_id: string | number | null;
  gen_models_apis:
    | {
        api_schema: Json | null;
        function_schema: Json | null;
        vendor_api: string | null;
      }
    | Array<{
        api_schema: Json | null;
        function_schema: Json | null;
        vendor_api: string | null;
      }>
    | null;
};

type CloneSpec = {
  source_model_id: (typeof SOURCE_MODELS)[number];
  model_id: string;
  model_name: string;
  model_description: string;
  tool_description: string;
  function_name: string;
  model_variant: string;
  sort_order_variant: number;
};

const LITE_PRICING: Json = {
  type: 'multiFields',
  cost: {
    field: 'resolution',
    values: {
      '480p': { type: 'multi', field: 'duration', cost: 0.02 },
      '720p': { type: 'multi', field: 'duration', cost: 0.03 },
      '1080p': { type: 'multi', field: 'duration', cost: 0.14 },
    },
  },
};

const CLONES: CloneSpec[] = [
  {
    source_model_id: 'x-ai/grok-imagine-video-v1.5/text-to-video',
    model_id: 'x-ai/grok-imagine-video-v1.5-lite/text-to-video',
    model_name: 'X Ai Grok Imagine Video V1 5 Lite Text To Video',
    model_description:
      'Grok Imagine Video 1.5 Lite text-to-video. Lower-cost clips at 480p, 720p, or upscaled 1080p, 1–15 seconds. No references, voices, or last frame.',
    tool_description:
      'Grok Imagine Video 1.5 Lite text-to-video. Required: prompt. Duration 1–15s. Resolutions 480p, 720p, 1080p (1080p is upscaled from 720p). No reference images or voices.',
    function_name: 'XAiGrokImagineVideoV15LiteTextToVideo',
    model_variant: 'text-to-video',
    sort_order_variant: 1,
  },
  {
    source_model_id: 'x-ai/grok-imagine-video-v1.5/image-to-video',
    model_id: 'x-ai/grok-imagine-video-v1.5-lite/image-to-video',
    model_name: 'X Ai Grok Imagine Video V1 5 Lite Image To Video',
    model_description:
      'Grok Imagine Video 1.5 Lite image-to-video. Animates a still at 480p, 720p, or upscaled 1080p, 1–15 seconds. No last frame, references, or voices.',
    tool_description:
      'Grok Imagine Video 1.5 Lite image-to-video. Required: prompt and image. Duration 1–15s. Resolutions 480p, 720p, 1080p (1080p is upscaled from 720p). Aspect ratio follows the still.',
    function_name: 'XAiGrokImagineVideoV15LiteImageToVideo',
    model_variant: 'image-to-video',
    sort_order_variant: 2,
  },
];

function throwIf(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function patchFunctionSchema(schema: Json, spec: CloneSpec): Json {
  const next = cloneJson(schema);
  next.name = spec.function_name;
  next.description = spec.tool_description;
  return next;
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: brand, error: brandError } = await supabase
    .from('brands')
    .select('name, slug')
    .or(`slug.eq.${BRAND_SLUG},name.eq.${BRAND_NAME}`)
    .maybeSingle();
  throwIf(brandError, 'brands fetch');
  if (!brand?.name) throw new Error('Xai brand is missing');

  const { data: existingVendor, error: vendorFetchError } = await supabase
    .from('vendor_apis')
    .select('id, vendor_name')
    .eq('vendor_name', VENDOR)
    .maybeSingle();
  throwIf(vendorFetchError, 'vendor_apis fetch');

  if (!existingVendor) {
    if (!XAI_API_KEY) {
      throw new Error('vendor_apis xai is missing. Add it on the Vendors page or set XAI_API_KEY');
    }
    const { error: vendorInsertError } = await supabase.from('vendor_apis').insert({
      vendor_name: VENDOR,
      api_key: XAI_API_KEY,
      url: XAI_BILLING_URL,
      config: {},
    });
    throwIf(vendorInsertError, 'vendor_apis insert');
    console.log('inserted vendor_apis xai');
  } else {
    console.log('vendor_apis xai exists');
  }

  const { data: sources, error: sourceError } = await supabase
    .from('gen_models')
    .select(
      'id, model_id, model_type, generation_type, sort_order, gen_models_apis_id, gen_models_apis:gen_models_apis!gen_models_gen_models_apis_id_fkey(api_schema, function_schema, vendor_api)'
    )
    .in('model_id', [...SOURCE_MODELS]);
  throwIf(sourceError, 'gen_models source fetch');

  const sourceById = new Map(((sources || []) as SourceRow[]).map(row => [row.model_id, row]));
  for (const modelId of SOURCE_MODELS) {
    if (!sourceById.has(modelId)) {
      throw new Error(`Missing source model ${modelId}. Seed Grok Imagine Video 1.5 first.`);
    }
  }

  for (const spec of CLONES) {
    const source = sourceById.get(spec.source_model_id);
    if (!source) throw new Error(`Missing source model ${spec.source_model_id}`);
    const sourceApi = Array.isArray(source.gen_models_apis)
      ? source.gen_models_apis[0]
      : source.gen_models_apis;
    if (!sourceApi?.function_schema || !sourceApi.api_schema) {
      throw new Error(`Source model ${spec.source_model_id} is missing gen_models_apis schemas`);
    }

    const apiSchema = cloneJson(sourceApi.api_schema);
    apiSchema.vendor_model_name = VENDOR_MODEL;

    const modelRow = {
      model_id: spec.model_id,
      model_name: spec.model_name,
      model_description: spec.model_description,
      model_type: source.model_type,
      generation_type: source.generation_type || 'video',
      model_product: PRODUCT,
      model_variant: spec.model_variant,
      brand_name: brand.name,
      sort_order: source.sort_order ?? 4,
      sort_order_variant: spec.sort_order_variant,
    };

    const { data: existingModel, error: modelFetchError } = await supabase
      .from('gen_models')
      .select('id, gen_models_apis_id')
      .eq('model_id', spec.model_id)
      .maybeSingle();
    throwIf(modelFetchError, `gen_models fetch ${spec.model_id}`);

    let genModelId = existingModel?.id as string | undefined;
    let apisId = existingModel?.gen_models_apis_id as string | number | null | undefined;

    if (apisId == null) {
      const { data: existingApi, error: existingApiError } = await supabase
        .from('gen_models_apis')
        .select('id')
        .eq('gen_models_model_id', spec.model_id)
        .maybeSingle();
      throwIf(existingApiError, `gen_models_apis lookup ${spec.model_id}`);
      apisId = existingApi?.id;
    }

    if (!genModelId) {
      const { data: insertedModel, error: modelInsertError } = await supabase
        .from('gen_models')
        .insert(modelRow)
        .select('id, gen_models_apis_id')
        .single();
      throwIf(modelInsertError, `gen_models insert ${spec.model_id}`);
      genModelId = insertedModel?.id;
      apisId = apisId ?? insertedModel?.gen_models_apis_id;
      console.log('inserted gen_models', spec.model_id);
    } else {
      const { error: modelUpdateError } = await supabase.from('gen_models').update(modelRow).eq('id', genModelId);
      throwIf(modelUpdateError, `gen_models update ${spec.model_id}`);
      console.log('updated gen_models', spec.model_id);
    }

    const apiRow = {
      gen_models_model_id: spec.model_id,
      vendor_api: sourceApi.vendor_api || VENDOR,
      api_schema: apiSchema,
      function_schema: patchFunctionSchema(sourceApi.function_schema, spec),
      model_pricing: LITE_PRICING,
    };

    if (apisId != null) {
      const { error: apiUpdateError } = await supabase.from('gen_models_apis').update(apiRow).eq('id', apisId);
      throwIf(apiUpdateError, `gen_models_apis update ${spec.model_id}`);
    } else {
      const { data: insertedApi, error: apiInsertError } = await supabase
        .from('gen_models_apis')
        .insert(apiRow)
        .select('id')
        .single();
      throwIf(apiInsertError, `gen_models_apis insert ${spec.model_id}`);
      apisId = insertedApi?.id;
    }

    if (genModelId && apisId != null && existingModel?.gen_models_apis_id !== apisId) {
      const { error: linkError } = await supabase
        .from('gen_models')
        .update({ gen_models_apis_id: apisId })
        .eq('id', genModelId);
      throwIf(linkError, `gen_models link ${spec.model_id}`);
    }
  }

  console.log('Grok Imagine Video 1.5 Lite models seeded');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
