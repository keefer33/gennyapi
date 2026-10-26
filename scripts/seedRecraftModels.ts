import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import {
  RECRAFT_ASPECT_RATIOS,
  RECRAFT_FLASH_MODEL,
  RECRAFT_STYLES_MODEL,
  RECRAFT_STYLES_MODELS,
  RECRAFT_V41_RASTER_MODELS,
  RECRAFT_V41_VECTOR_MODELS,
} from '../src/api-vendors/recraft/recraftShared';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv({ path: resolve(__dirname, '../../gennyadmin/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';
const RECRAFT_TOKEN =
  process.env.RECRAFT_API_TOKEN || process.env.VITE_RECRAFT_API_KEY || process.env.RECRAFT_API_KEY || '';

const VENDOR = 'recraft';
const BRAND_NAME = 'Recraft';
const BRAND_SLUG = 'recraft';

type Json = Record<string, unknown>;

function throwIf(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function sizeProperty(): Json {
  return {
    type: 'string',
    title: 'Size',
    description: 'Aspect ratio. Leave unset to let Recraft pick from the prompt.',
    enum: [...RECRAFT_ASPECT_RATIOS],
    'x-ui-component': 'AspectRatioPicker',
  };
}

function nProperty(): Json {
  return {
    type: 'integer',
    title: 'Images',
    minimum: 1,
    maximum: 6,
    default: 1,
    'x-ui-component': 'NumberSlider',
  };
}

function imageFormatProperty(): Json {
  return {
    type: 'string',
    title: 'Image format',
    enum: ['webp', 'png'],
    default: 'webp',
  };
}

function promptProperty(): Json {
  return {
    type: 'string',
    title: 'Prompt',
    description: 'Describe the image to generate.',
  };
}

function randomSeedProperty(): Json {
  return {
    type: 'integer',
    title: 'Seed',
    description: 'Optional seed for reproducible generation.',
  };
}

function modelProperty(values: readonly string[], defaultModel: string): Json {
  return {
    type: 'string',
    title: 'Model',
    enum: [...values],
    default: defaultModel,
  };
}

function styleIdProperty(): Json {
  return {
    type: 'string',
    title: 'Style ID',
    description: 'Existing Recraft style UUID. Do not combine with style references.',
  };
}

function styleRefsProperty(required: boolean): Json {
  return {
    type: 'array',
    title: 'Style references',
    description: required
      ? '1–10 reference images, or provide a Style ID instead. Creating a new style adds $0.005.'
      : 'Optional 1–10 reference images. Creating a new style adds $0.005. Do not combine with Style ID.',
    items: { type: 'string' },
    minItems: required ? 1 : 0,
    maxItems: 10,
    'x-ui-component': {
      type: 'MediaFilePicker',
      settings: {
        min: required ? 1 : 0,
        max: 10,
        allowed_file_types: ['image'],
      },
    },
  };
}

function multiFieldPricing(values: Record<string, number>): Json {
  return {
    type: 'multiFields',
    cost: {
      field: 'model',
      values: Object.fromEntries(
        Object.entries(values).map(([model, cost]) => [model, { type: 'multi', field: 'n', cost }])
      ),
    },
  };
}

function apiSchema(vendorModelName: string): Json {
  return {
    vendor_model_name: vendorModelName,
    server: 'https://external.api.recraft.ai/v1',
    api_path: '/images/generations',
  };
}

const MODELS = [
  {
    model_id: 'recraft-v4-1',
    model_name: 'Recraft V4.1',
    model_description: 'Photorealism, illustration, and strong short prompts. Raster, Pro, and Utility variants.',
    model_product: 'Recraft V4.1',
    model_variant: 'raster',
    sort_order: 16,
    sort_order_variant: 1,
    vendor_model_name: 'recraftv4_1',
    function_schema: {
      name: 'RecraftV41',
      description: 'Generate raster images with Recraft V4.1.',
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: promptProperty(),
        model: modelProperty(RECRAFT_V41_RASTER_MODELS, 'recraftv4_1'),
        size: sizeProperty(),
        n: nProperty(),
        image_format: imageFormatProperty(),
        style_reference_urls: styleRefsProperty(false),
        style_id: styleIdProperty(),
        random_seed: randomSeedProperty(),
      },
    },
    model_pricing: multiFieldPricing({
      recraftv4_1: 0.035,
      recraftv4_1_pro: 0.25,
      recraftv4_1_utility: 0.02,
      recraftv4_1_utility_pro: 0.08,
    }),
  },
  {
    model_id: 'recraft-v4-1-vector',
    model_name: 'Recraft V4.1 Vector',
    model_description: 'Production-grade SVG. Pro and Utility vector variants.',
    model_product: 'Recraft V4.1',
    model_variant: 'vector',
    sort_order: 16,
    sort_order_variant: 2,
    vendor_model_name: 'recraftv4_1_vector',
    function_schema: {
      name: 'RecraftV41Vector',
      description: 'Generate SVG images with Recraft V4.1 Vector.',
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: promptProperty(),
        model: modelProperty(RECRAFT_V41_VECTOR_MODELS, 'recraftv4_1_vector'),
        size: sizeProperty(),
        n: nProperty(),
        style_reference_urls: styleRefsProperty(false),
        style_id: styleIdProperty(),
        random_seed: randomSeedProperty(),
      },
    },
    model_pricing: multiFieldPricing({
      recraftv4_1_vector: 0.08,
      recraftv4_1_pro_vector: 0.4,
      recraftv4_1_utility_vector: 0.04,
      recraftv4_1_utility_pro_vector: 0.16,
    }),
  },
  {
    model_id: 'recraft-v4-1-flash',
    model_name: 'Recraft V4.1 Flash',
    model_description: 'Fast raster generation, about 1.3s, quality close to V4.1. Styles are not supported.',
    model_product: 'Recraft V4.1 Flash',
    model_variant: 'text-to-image',
    sort_order: 17,
    sort_order_variant: 1,
    vendor_model_name: RECRAFT_FLASH_MODEL,
    function_schema: {
      name: 'RecraftV41Flash',
      description: 'Generate images with Recraft V4.1 Flash.',
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: promptProperty(),
        size: sizeProperty(),
        n: nProperty(),
        image_format: imageFormatProperty(),
        random_seed: randomSeedProperty(),
      },
    },
    model_pricing: { type: 'perMulti', cost: 0.007 },
  },
  {
    model_id: 'recraft-v4-styles',
    model_name: 'Recraft V4 Styles',
    model_description: 'Match a look from 1 to 10 style reference images or an existing Recraft style ID.',
    model_product: 'Recraft V4 Styles',
    model_variant: 'text-to-image',
    sort_order: 18,
    sort_order_variant: 1,
    vendor_model_name: RECRAFT_STYLES_MODEL,
    function_schema: {
      name: 'RecraftV4Styles',
      description: 'Generate images that match Recraft style references.',
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: promptProperty(),
        model: modelProperty(RECRAFT_STYLES_MODELS, RECRAFT_STYLES_MODEL),
        size: sizeProperty(),
        n: nProperty(),
        image_format: imageFormatProperty(),
        style_reference_urls: styleRefsProperty(true),
        style_id: styleIdProperty(),
        random_seed: randomSeedProperty(),
      },
    },
    model_pricing: multiFieldPricing({
      recraftv4_styles: 0.04,
      recraftv4_styles_pro: 0.25,
      recraftv4_styles_vector: 0.08,
      recraftv4_styles_pro_vector: 0.4,
    }),
  },
];

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  if (!RECRAFT_TOKEN.trim()) {
    throw new Error('Missing Recraft API token (RECRAFT_API_TOKEN or VITE_RECRAFT_API_KEY)');
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existingBrand, error: brandFetchError } = await supabase
    .from('brands')
    .select('id, name, slug')
    .or(`slug.eq.${BRAND_SLUG},name.eq.${BRAND_NAME}`)
    .maybeSingle();
  throwIf(brandFetchError, 'brands fetch');

  let brandName = existingBrand?.name ?? BRAND_NAME;
  if (!existingBrand) {
    const { data: insertedBrand, error: brandInsertError } = await supabase
      .from('brands')
      .insert({ name: BRAND_NAME, slug: BRAND_SLUG, logo: null })
      .select('id, name, slug')
      .single();
    throwIf(brandInsertError, 'brands insert');
    brandName = insertedBrand?.name ?? BRAND_NAME;
    console.log('inserted brand', brandName);
  } else {
    console.log('brand exists', brandName);
  }

  const { data: existingVendor, error: vendorFetchError } = await supabase
    .from('vendor_apis')
    .select('id, vendor_name')
    .eq('vendor_name', VENDOR)
    .maybeSingle();
  throwIf(vendorFetchError, 'vendor_apis fetch');

  if (!existingVendor) {
    const { error: vendorInsertError } = await supabase.from('vendor_apis').insert({
      vendor_name: VENDOR,
      api_key: RECRAFT_TOKEN.trim(),
      config: {},
    });
    throwIf(vendorInsertError, 'vendor_apis insert');
    console.log('inserted vendor_apis recraft');
  } else {
    const { error: vendorUpdateError } = await supabase
      .from('vendor_apis')
      .update({ api_key: RECRAFT_TOKEN.trim() })
      .eq('vendor_name', VENDOR);
    throwIf(vendorUpdateError, 'vendor_apis update');
    console.log('updated vendor_apis recraft');
  }

  for (const model of MODELS) {
    const modelRow = {
      model_id: model.model_id,
      model_name: model.model_name,
      model_description: model.model_description,
      model_type: 'text-to-image',
      generation_type: 'image',
      model_product: model.model_product,
      model_variant: model.model_variant,
      brand_name: brandName,
      sort_order: model.sort_order,
      sort_order_variant: model.sort_order_variant,
    };

    const { data: existingModel, error: modelFetchError } = await supabase
      .from('gen_models')
      .select('id, gen_models_apis_id')
      .eq('model_id', model.model_id)
      .maybeSingle();
    throwIf(modelFetchError, `gen_models fetch ${model.model_id}`);

    let genModelId = existingModel?.id as string | undefined;
    let apisId = existingModel?.gen_models_apis_id as string | number | null | undefined;

    if (!genModelId) {
      const { data: insertedModel, error: modelInsertError } = await supabase
        .from('gen_models')
        .insert(modelRow)
        .select('id, gen_models_apis_id')
        .single();
      throwIf(modelInsertError, `gen_models insert ${model.model_id}`);
      genModelId = insertedModel?.id;
      apisId = insertedModel?.gen_models_apis_id;
      console.log('inserted gen_models', model.model_id);
    } else {
      const { error: modelUpdateError } = await supabase.from('gen_models').update(modelRow).eq('id', genModelId);
      throwIf(modelUpdateError, `gen_models update ${model.model_id}`);
      console.log('updated gen_models', model.model_id);
    }

    const apiRow = {
      gen_models_model_id: model.model_id,
      vendor_api: VENDOR,
      api_schema: apiSchema(model.vendor_model_name),
      function_schema: model.function_schema,
      model_pricing: model.model_pricing,
    };

    if (apisId != null) {
      const { error: apiUpdateError } = await supabase.from('gen_models_apis').update(apiRow).eq('id', apisId);
      throwIf(apiUpdateError, `gen_models_apis update ${model.model_id}`);
    } else {
      const { data: insertedApi, error: apiInsertError } = await supabase
        .from('gen_models_apis')
        .insert(apiRow)
        .select('id')
        .single();
      throwIf(apiInsertError, `gen_models_apis insert ${model.model_id}`);
      apisId = insertedApi?.id;
      const { error: linkError } = await supabase
        .from('gen_models')
        .update({ gen_models_apis_id: apisId })
        .eq('id', genModelId);
      throwIf(linkError, `gen_models link ${model.model_id}`);
    }
  }

  console.log('Recraft models seeded');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
