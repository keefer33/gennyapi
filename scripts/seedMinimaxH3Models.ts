import { config as loadEnv } from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv({ path: resolve(__dirname, '../../gennyadmin/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';
const MINIMAX_API_KEY = (
  process.env.MINIMAX_API_KEY ||
  process.env.VITE_MINIMAX_API_KEY ||
  process.env.MINIMAX_API_TOKEN ||
  ''
).trim();

const VENDOR = 'minimax';
const BRAND_NAME = 'Minimax';
const BRAND_SLUG = 'minimax';
const MINIMAX_BILLING_URL = 'https://platform.minimax.io/docs/pricing/overview';
const CONCRETE_RATIOS = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];

const SOURCE_MODELS = [
  'minimax/h3/text-to-video',
  'minimax/h3/image-to-video',
  'minimax/h3/reference-to-video',
] as const;

type Json = Record<string, unknown>;

type SourceRow = {
  id: string;
  model_id: string;
  model_name: string;
  model_description: string | null;
  model_type: string | null;
  generation_type: string | null;
  model_product: string | null;
  model_variant: string | null;
  brand_name: string | null;
  sort_order: number | null;
  gen_models_apis_id: string | number | null;
  gen_models_apis:
    | {
        api_schema: Json | null;
        function_schema: Json | null;
        model_pricing: Json | null;
        vendor_api: string | null;
      }
    | Array<{
        api_schema: Json | null;
        function_schema: Json | null;
        model_pricing: Json | null;
        vendor_api: string | null;
      }>
    | null;
};

type VariantKind = 't2v' | 'i2v' | 'r2v';

type CloneSpec = {
  source_model_id: (typeof SOURCE_MODELS)[number];
  kind: VariantKind;
  model_id: string;
  model_name: string;
  model_description: string;
  tool_description: string;
  function_name: string;
  model_variant: string;
  sort_order_variant: number;
  vendor_model_name: string;
  resolutions: string[];
  default_resolution: string;
  duration_min: number;
  pricing: Record<string, number>;
  strip_adaptive_ratio?: boolean;
};

function throwIf(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function perSecondByResolution(rates: Record<string, number>): Json {
  return {
    type: 'multiFields',
    cost: {
      field: 'resolution',
      values: Object.fromEntries(
        Object.entries(rates).map(([resolution, cost]) => [
          resolution,
          { type: 'multi', field: 'duration', cost },
        ])
      ),
    },
  };
}

function patchFunctionSchema(schema: Json, spec: CloneSpec): Json {
  const next = cloneJson(schema);
  next.name = spec.function_name;
  next.description = spec.tool_description;

  const properties = (next.properties as Json | undefined) || {};
  const resolution = (properties.resolution as Json | undefined) || {};
  resolution.enum = spec.resolutions;
  resolution.default = spec.default_resolution;
  properties.resolution = resolution;

  const duration = (properties.duration as Json | undefined) || {};
  duration.minimum = spec.duration_min;
  duration.description = `Length of the video in seconds (${spec.duration_min}-15).`;
  properties.duration = duration;

  delete properties.prompt_expansion_mode;
  const order = Array.isArray(next['x-order-properties'])
    ? (next['x-order-properties'] as string[]).filter(key => key !== 'prompt_expansion_mode')
    : undefined;
  if (order) next['x-order-properties'] = order;

  const aspectRatio = properties.aspect_ratio as Json | undefined;
  if (aspectRatio && spec.strip_adaptive_ratio) {
    const enumValues = Array.isArray(aspectRatio.enum)
      ? (aspectRatio.enum as string[]).filter(value => value !== 'adaptive')
      : CONCRETE_RATIOS;
    aspectRatio.enum = enumValues.length ? enumValues : CONCRETE_RATIOS;
    if (aspectRatio.default === 'adaptive') aspectRatio.default = '16:9';
    aspectRatio.description = 'Output aspect ratio. Lite does not support adaptive.';
    properties.aspect_ratio = aspectRatio;
  }

  next.properties = properties;
  return next;
}

const HIGHSPEED_PRICING = { '768P': 0.06 };
const LITE_PRICING = { '480P': 0.025, '768P': 0.04 };

const CLONES: CloneSpec[] = [
  {
    source_model_id: 'minimax/h3/text-to-video',
    kind: 't2v',
    model_id: 'minimax/h3/highspeed-text-to-video',
    model_name: 'Minimax H3 Highspeed Text To Video',
    model_description:
      'MiniMax-H3-Highspeed text-to-video. Faster everyday output at 768P, 4–15 seconds.',
    tool_description:
      'MiniMax-H3-Highspeed text-to-video at 768P. Required: prompt. Duration 4–15s. Pick a concrete aspect ratio.',
    function_name: 'MinimaxH3HighspeedTextToVideo',
    model_variant: 'highspeed-text-to-video',
    sort_order_variant: 7,
    vendor_model_name: 'MiniMax-H3-Highspeed',
    resolutions: ['768P'],
    default_resolution: '768P',
    duration_min: 4,
    pricing: HIGHSPEED_PRICING,
  },
  {
    source_model_id: 'minimax/h3/image-to-video',
    kind: 'i2v',
    model_id: 'minimax/h3/highspeed-image-to-video',
    model_name: 'Minimax H3 Highspeed Image To Video',
    model_description:
      'MiniMax-H3-Highspeed image-to-video. Animates a first-frame image with optional last-frame control at 768P.',
    tool_description:
      'MiniMax-H3-Highspeed image-to-video at 768P. Required: prompt and first-frame image. Optional last frame. Duration 4–15s.',
    function_name: 'MinimaxH3HighspeedImageToVideo',
    model_variant: 'highspeed-image-to-video',
    sort_order_variant: 8,
    vendor_model_name: 'MiniMax-H3-Highspeed',
    resolutions: ['768P'],
    default_resolution: '768P',
    duration_min: 4,
    pricing: HIGHSPEED_PRICING,
  },
  {
    source_model_id: 'minimax/h3/reference-to-video',
    kind: 'r2v',
    model_id: 'minimax/h3/highspeed-reference-to-video',
    model_name: 'Minimax H3 Highspeed Reference To Video',
    model_description:
      'MiniMax-H3-Highspeed reference-to-video. Combines reference images, videos, and audio with a prompt at 768P.',
    tool_description:
      'MiniMax-H3-Highspeed reference-to-video at 768P. Required: prompt. Optional reference images, videos, and audio. Duration 4–15s.',
    function_name: 'MinimaxH3HighspeedReferenceToVideo',
    model_variant: 'highspeed-reference-to-video',
    sort_order_variant: 9,
    vendor_model_name: 'MiniMax-H3-Highspeed',
    resolutions: ['768P'],
    default_resolution: '768P',
    duration_min: 4,
    pricing: HIGHSPEED_PRICING,
  },
  {
    source_model_id: 'minimax/h3/text-to-video',
    kind: 't2v',
    model_id: 'minimax/h3/lite-text-to-video',
    model_name: 'Minimax H3 Lite Text To Video',
    model_description:
      'MiniMax-H3-Lite text-to-video. Lower-cost generation at 480P or 768P, 4–15 seconds.',
    tool_description:
      'MiniMax-H3-Lite text-to-video at 480P or 768P. Required: prompt. Duration 4–15s. Pick a concrete aspect ratio (adaptive is not supported).',
    function_name: 'MinimaxH3LiteTextToVideo',
    model_variant: 'lite-text-to-video',
    sort_order_variant: 10,
    vendor_model_name: 'MiniMax-H3-Lite',
    resolutions: ['480P', '768P'],
    default_resolution: '768P',
    duration_min: 4,
    pricing: LITE_PRICING,
    strip_adaptive_ratio: true,
  },
  {
    source_model_id: 'minimax/h3/image-to-video',
    kind: 'i2v',
    model_id: 'minimax/h3/lite-image-to-video',
    model_name: 'Minimax H3 Lite Image To Video',
    model_description:
      'MiniMax-H3-Lite image-to-video. Animates a first-frame image with optional last-frame control at 480P or 768P.',
    tool_description:
      'MiniMax-H3-Lite image-to-video at 480P or 768P. Required: prompt and first-frame image. Optional last frame. Duration 4–15s.',
    function_name: 'MinimaxH3LiteImageToVideo',
    model_variant: 'lite-image-to-video',
    sort_order_variant: 11,
    vendor_model_name: 'MiniMax-H3-Lite',
    resolutions: ['480P', '768P'],
    default_resolution: '768P',
    duration_min: 4,
    pricing: LITE_PRICING,
  },
  {
    source_model_id: 'minimax/h3/reference-to-video',
    kind: 'r2v',
    model_id: 'minimax/h3/lite-reference-to-video',
    model_name: 'Minimax H3 Lite Reference To Video',
    model_description:
      'MiniMax-H3-Lite reference-to-video. Combines reference images, videos, and audio with a prompt at 480P or 768P.',
    tool_description:
      'MiniMax-H3-Lite reference-to-video at 480P or 768P. Required: prompt and a concrete aspect ratio. Optional reference images, videos, and audio. Duration 4–15s.',
    function_name: 'MinimaxH3LiteReferenceToVideo',
    model_variant: 'lite-reference-to-video',
    sort_order_variant: 12,
    vendor_model_name: 'MiniMax-H3-Lite',
    resolutions: ['480P', '768P'],
    default_resolution: '768P',
    duration_min: 4,
    pricing: LITE_PRICING,
    strip_adaptive_ratio: true,
  },
];

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
  if (!brand?.name) throw new Error('Minimax brand is missing');

  const promptGuide = readFileSync(resolve(__dirname, 'prompt-guides/minimax.md'), 'utf8').trim();
  const { error: guideError } = await supabase
    .from('brands')
    .update({ prompt_guide: promptGuide })
    .or(`slug.eq.${BRAND_SLUG},name.eq.${BRAND_NAME}`);
  throwIf(guideError, 'brands.prompt_guide');
  console.log('updated brand prompt_guide', brand.slug || brand.name);

  const { data: existingVendor, error: vendorFetchError } = await supabase
    .from('vendor_apis')
    .select('id, vendor_name')
    .eq('vendor_name', VENDOR)
    .maybeSingle();
  throwIf(vendorFetchError, 'vendor_apis fetch');

  if (!existingVendor) {
    if (!MINIMAX_API_KEY) {
      throw new Error('vendor_apis minimax is missing. Add it on the Vendors page or set MINIMAX_API_KEY');
    }
    const { error: vendorInsertError } = await supabase.from('vendor_apis').insert({
      vendor_name: VENDOR,
      api_key: MINIMAX_API_KEY,
      url: MINIMAX_BILLING_URL,
      config: {},
    });
    throwIf(vendorInsertError, 'vendor_apis insert');
    console.log('inserted vendor_apis minimax');
  } else {
    console.log('vendor_apis minimax exists');
  }

  const { data: sources, error: sourceError } = await supabase
    .from('gen_models')
    .select(
      'id, model_id, model_name, model_description, model_type, generation_type, model_product, model_variant, brand_name, sort_order, gen_models_apis_id, gen_models_apis:gen_models_apis!gen_models_gen_models_apis_id_fkey(api_schema, function_schema, model_pricing, vendor_api)'
    )
    .in('model_id', [...SOURCE_MODELS]);
  throwIf(sourceError, 'gen_models source fetch');

  const sourceById = new Map(((sources || []) as SourceRow[]).map(row => [row.model_id, row]));
  for (const modelId of SOURCE_MODELS) {
    if (!sourceById.has(modelId)) {
      throw new Error(`Missing source model ${modelId}. Seed MiniMax-H3 quality models first.`);
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
    apiSchema.vendor_model_name = spec.vendor_model_name;

    const modelRow = {
      model_id: spec.model_id,
      model_name: spec.model_name,
      model_description: spec.model_description,
      model_type: source.model_type,
      generation_type: source.generation_type || 'video',
      model_product: 'h3',
      model_variant: spec.model_variant,
      brand_name: brand.name,
      sort_order: source.sort_order ?? 1,
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
      model_pricing: perSecondByResolution(spec.pricing),
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

  console.log('MiniMax H3 Highspeed and Lite models seeded');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
