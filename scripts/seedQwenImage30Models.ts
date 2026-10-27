import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv({ path: resolve(__dirname, '../../gennyadmin/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

const VENDOR = 'alibaba';
const BRAND_NAME = 'Qwen';
const BRAND_SLUG = 'qwen';
const QWEN_IMAGE_MODELS = ['qwen-image-3.0', 'qwen-image-3.0-pro'] as const;

function throwIf(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
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

  const { data: vendor, error: vendorError } = await supabase
    .from('vendor_apis')
    .select('vendor_name')
    .eq('vendor_name', VENDOR)
    .maybeSingle();
  throwIf(vendorError, 'vendor_apis fetch');
  if (!vendor?.vendor_name) throw new Error('alibaba vendor_apis row is missing');

  const modelId = 'alibaba/qwen-image-3.0';
  const modelName = 'Qwen Image 3.0';
  const modelDescription =
    'Text-to-image and edit from up to 3 reference images. Strong on-image text and layouts. Standard is $0.03/image; Pro is $0.04 at 1K and $0.075 at 2K, plus $0.003 per reference.';
  const toolDescription =
    'Generate or edit images with Qwen Image 3.0. Omit images for text-to-image. Attach 1–3 images to edit or fuse references. Set model to qwen-image-3.0 (standard, $0.03) or qwen-image-3.0-pro ($0.04 at 1K / $0.075 at 2K). n is 1–6. Reference images add $0.003 each. Leave enable_thinking false unless quality matters more than speed.';

  const modelRow = {
    model_id: modelId,
    model_name: modelName,
    model_description: modelDescription,
    model_type: 'text-to-image',
    generation_type: 'image',
    model_product: 'Qwen Image 3.0',
    model_variant: 'image',
    brand_name: brandName,
    sort_order: 20,
    sort_order_variant: 1,
  };

  const { data: existingModel, error: modelFetchError } = await supabase
    .from('gen_models')
    .select('id, gen_models_apis_id')
    .eq('model_id', modelId)
    .maybeSingle();
  throwIf(modelFetchError, `gen_models fetch ${modelId}`);

  let genModelId = existingModel?.id as string | undefined;
  let apisId = existingModel?.gen_models_apis_id as string | number | null | undefined;

  if (!genModelId) {
    const { data: insertedModel, error: modelInsertError } = await supabase
      .from('gen_models')
      .insert(modelRow)
      .select('id, gen_models_apis_id')
      .single();
    throwIf(modelInsertError, `gen_models insert ${modelId}`);
    genModelId = insertedModel?.id;
    apisId = insertedModel?.gen_models_apis_id;
    console.log('inserted gen_models', modelId);
  } else {
    const { error: modelUpdateError } = await supabase.from('gen_models').update(modelRow).eq('id', genModelId);
    throwIf(modelUpdateError, `gen_models update ${modelId}`);
    console.log('updated gen_models', modelId);
  }

  const apiRow = {
    gen_models_model_id: modelId,
    vendor_api: VENDOR,
    api_schema: {
      type: 'model_run',
      method: 'POST',
      server: 'https://dashscope-intl.aliyuncs.com',
      api_path: '/api/v1/services/aigc/image-generation/generation',
      polling_path: 'https://dashscope-intl.aliyuncs.com/api/v1/tasks/',
      vendor_model_name: 'qwen-image-3.0',
    },
    function_schema: {
      name: 'QwenImage30',
      description: toolDescription,
      type: 'object',
      required: ['prompt'],
      'x-order-properties': [
        'prompt',
        'images',
        'negative_prompt',
        'model',
        'size',
        'n',
        'prompt_extend',
        'enable_thinking',
        'seed',
        'watermark',
      ],
      properties: {
        prompt: {
          type: 'string',
          title: 'Prompt',
          description: 'Describe the image to generate, or how to edit the attached references.',
        },
        images: {
          type: 'array',
          title: 'Reference images',
          description: 'Optional. 1–3 images to edit or fuse. Omit for text-to-image.',
          items: { type: 'string' },
          minItems: 0,
          maxItems: 3,
          'x-ui-component': {
            type: 'MediaFilePicker',
            settings: { min: 0, max: 3, allowed_file_types: ['image'] },
          },
        },
        negative_prompt: {
          type: 'string',
          title: 'Negative prompt',
          description: 'Content to avoid. Qwen Image 3.0 only.',
        },
        model: {
          type: 'string',
          title: 'Model',
          description: 'qwen-image-3.0 is $0.03/image. qwen-image-3.0-pro is $0.04 at 1K and $0.075 at 2K (pixel area over 2,250,000).',
          enum: [...QWEN_IMAGE_MODELS],
          default: 'qwen-image-3.0',
        },
        size: {
          type: 'string',
          title: 'Size',
          description: 'Width × height. Pixel area 512×512 to 2048×2048. Default 1024×1024.',
          default: '1024*1024',
          'x-ui-component': 'SizePicker',
          minimum: 512,
          maximum: 2048,
          separator: '*',
        },
        n: {
          type: 'integer',
          title: 'Images',
          minimum: 1,
          maximum: 6,
          default: 1,
          'x-ui-component': 'NumberSlider',
        },
        prompt_extend: {
          type: 'boolean',
          title: 'Enhance prompt',
          description: 'Rewrite short prompts. Required for thinking mode.',
          default: true,
        },
        enable_thinking: {
          type: 'boolean',
          title: 'Thinking',
          description: 'Much slower. Turns on extra reasoning. Requires Enhance prompt.',
          default: false,
        },
        seed: {
          type: 'integer',
          title: 'Seed',
          description: 'Optional seed for reproducible generation.',
        },
        watermark: {
          type: 'boolean',
          title: 'Watermark',
          default: false,
        },
      },
    },
    model_pricing: {
      type: 'qwen-image',
    },
  };

  if (apisId != null) {
    const { error: apiUpdateError } = await supabase.from('gen_models_apis').update(apiRow).eq('id', apisId);
    throwIf(apiUpdateError, `gen_models_apis update ${modelId}`);
  } else {
    const { data: insertedApi, error: apiInsertError } = await supabase
      .from('gen_models_apis')
      .insert(apiRow)
      .select('id')
      .single();
    throwIf(apiInsertError, `gen_models_apis insert ${modelId}`);
    apisId = insertedApi?.id;
    const { error: linkError } = await supabase
      .from('gen_models')
      .update({ gen_models_apis_id: apisId })
      .eq('id', genModelId);
    throwIf(linkError, `gen_models link ${modelId}`);
  }

  console.log('Qwen Image 3.0 seeded');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
