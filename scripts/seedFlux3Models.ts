import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv({ path: resolve(__dirname, '../../gennyadmin/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';
const BFL_API_KEY = (
  process.env.BFL_API_KEY ||
  process.env.BFL_API_TOKEN ||
  process.env.VITE_BFL_TOKEN ||
  process.env.VITE_BFL_API_KEY ||
  ''
).trim();

const VENDOR = 'bfl';
const BRAND_NAME = 'Flux';
const BRAND_SLUG = 'flux';
const BFL_BILLING_URL = 'https://dashboard.bfl.ai';
const IMAGE_RATIOS = ['21:9', '16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16', '9:21', 'auto'] as const;
const VIDEO_RATIOS = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', '9:21', 'auto'] as const;
const VIDEO_RESOLUTIONS = ['hd', 'fhd', 'qhd', 'uhd'] as const;
const IMAGE_RESOLUTIONS = ['768sq', '1k', '1.5k', '2k', '4k'] as const;

type Json = Record<string, unknown>;

function throwIf(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function promptProperty(description: string): Json {
  return { type: 'string', title: 'Prompt', description };
}

function aspectRatioProperty(ratios: readonly string[], defaultValue = 'auto', description?: string): Json {
  return {
    type: 'string',
    title: 'Aspect ratio',
    ...(description ? { description } : {}),
    enum: [...ratios],
    default: defaultValue,
    'x-ui-component': 'AspectRatioPicker',
  };
}

function durationProperty(min: number, max: number, description?: string): Json {
  return {
    type: 'integer',
    title: 'Duration (seconds)',
    ...(description ? { description } : {}),
    minimum: min,
    maximum: max,
    default: 8,
    'x-ui-component': 'NumberSlider',
  };
}

function videoResolutionProperty(defaultValue = 'hd'): Json {
  return {
    type: 'string',
    title: 'Resolution',
    enum: [...VIDEO_RESOLUTIONS],
    default: defaultValue,
  };
}

function imageResolutionProperty(): Json {
  return {
    type: 'string',
    title: 'Resolution',
    enum: [...IMAGE_RESOLUTIONS],
    default: '1k',
  };
}

function generateAudioProperty(): Json {
  return {
    type: 'boolean',
    title: 'Audio',
    description: 'Include a soundtrack on the generated video.',
    default: true,
  };
}

function draftProperty(): Json {
  return {
    type: 'boolean',
    title: 'Draft',
    description: 'Cheaper HD preview plus a reusable draft cache. Enhance later with FLUX 3 Draft Enhance.',
    default: false,
  };
}

function mediaPicker(
  title: string,
  allowed: 'image' | 'video' | 'audio' | 'file',
  min: number,
  max: number,
  description?: string
): Json {
  return {
    type: max > 1 ? 'array' : 'string',
    title,
    description,
    ...(max > 1 ? { items: { type: 'string' }, minItems: min, maxItems: max } : {}),
    'x-ui-component': {
      type: 'MediaFilePicker',
      settings: { min, max, allowed_file_types: [allowed] },
    },
  };
}

function perSecond(cost: number): Json {
  return { type: 'multi', field: 'duration', cost };
}

function byResolution(rates: { hd: number; fhd: number; qhd: number; uhd: number }): Json {
  return {
    field: 'resolution',
    values: {
      hd: perSecond(rates.hd),
      fhd: perSecond(rates.fhd),
      qhd: perSecond(rates.qhd),
      uhd: perSecond(rates.uhd),
    },
  };
}

function videoPricing(kind: 't2v' | 'v2v'): Json {
  const full =
    kind === 'v2v'
      ? { hd: 0.43, fhd: 0.54, qhd: 0.65, uhd: 0.95 }
      : { hd: 0.17, fhd: 0.29, qhd: 0.4, uhd: 0.8 };
  const draft = kind === 'v2v' ? 0.12 : 0.06;
  return {
    type: 'multiFields',
    cost: {
      field: 'draft',
      values: {
        true: perSecond(draft),
        false: byResolution(full),
      },
    },
  };
}

function enhancePricing(): Json {
  return {
    type: 'multiFields',
    cost: byResolution({ hd: 0.17, fhd: 0.29, qhd: 0.4, uhd: 0.8 }),
  };
}

function imagePricing(): Json {
  return {
    type: 'multiFields',
    cost: {
      field: 'resolution',
      values: {
        '768sq': 0.041,
        '1k': 0.048,
        '1.5k': 0.07,
        '2k': 0.1,
        '4k': 0.607,
      },
    },
  };
}

function videoEditPricing(): Json {
  return {
    type: 'multiFields',
    cost: { type: 'multiConvert', field: 'video', cost: 0.17 },
  };
}

function videoApiSchema(mode: 't2v' | 'i2v' | 'v2v' | 'draft_enhance'): Json {
  return {
    type: 'model_run',
    method: 'POST',
    server: 'https://api.bfl.ai',
    api_path: '/v1/flux-3-video',
    polling_path: '/v1/get_result?id=',
    vendor_model_name: 'flux-3-video',
    mode,
  };
}

function imageApiSchema(): Json {
  return {
    type: 'model_run',
    method: 'POST',
    server: 'https://api.bfl.ai',
    api_path: '/v1/flux-3-image',
    polling_path: '/v1/get_result?id=',
    vendor_model_name: 'flux-3-image',
  };
}

function videoEditApiSchema(): Json {
  return {
    type: 'model_run',
    method: 'POST',
    server: 'https://api.bfl.ai',
    api_path: '/v1/flux-tools/video-edit-v1',
    polling_path: '/v1/get_result?id=',
    vendor_model_name: 'flux-video-edit',
  };
}

const MODELS: Array<{
  model_id: string;
  model_name: string;
  model_description: string;
  tool_description: string;
  model_type: string;
  generation_type: 'image' | 'video';
  model_product: string;
  model_variant: string;
  sort_order_variant: number;
  required: string[];
  order: string[];
  properties: Json;
  api_schema: Json;
  model_pricing: Json;
}> = [
  {
    model_id: 'bfl/flux-3-image',
    model_name: 'FLUX 3 Image',
    model_description:
      'Text-to-image or edit from up to 10 references. Grounded prompt following, resolutions through 4K.',
    tool_description:
      'Generate or edit images with FLUX 3. Omit images for text-to-image. Attach 1–10 images to edit or fuse references. aspect_ratio includes auto. resolution is 768sq, 1k, 1.5k, 2k, or 4k.',
    model_type: 'text-to-image',
    generation_type: 'image',
    model_product: 'FLUX 3 Image',
    model_variant: 'image',
    sort_order_variant: 1,
    required: ['prompt'],
    order: ['prompt', 'images', 'aspect_ratio', 'resolution', 'grounding'],
    properties: {
      prompt: promptProperty('Describe the image to generate, or how to edit the attached references.'),
      images: mediaPicker('Reference images', 'image', 0, 10, 'Optional. Up to 10 images. Omit for text-to-image.'),
      aspect_ratio: aspectRatioProperty(IMAGE_RATIOS),
      resolution: imageResolutionProperty(),
      grounding: {
        type: 'boolean',
        title: 'Grounding',
        description: 'Keep the output closer to the prompt and any attached references.',
        default: true,
      },
    },
    api_schema: imageApiSchema(),
    model_pricing: imagePricing(),
  },
  {
    model_id: 'bfl/flux-3-text-to-video',
    model_name: 'FLUX 3 Text To Video',
    model_description: 'Generate 5–20s video from a prompt. Draft mode returns a cheap HD preview plus a reusable cache.',
    tool_description:
      'Generate a 5–20 second video from a prompt with FLUX 3. Default duration 8s. Set draft true for a cheaper HD preview; enhance later with FLUX 3 Draft Enhance. generate_audio defaults true.',
    model_type: 'text-to-video',
    generation_type: 'video',
    model_product: 'FLUX 3',
    model_variant: 'text-to-video',
    sort_order_variant: 1,
    required: ['prompt'],
    order: ['prompt', 'aspect_ratio', 'duration', 'resolution', 'generate_audio', 'draft'],
    properties: {
      prompt: promptProperty('Describe the video to generate.'),
      aspect_ratio: aspectRatioProperty(VIDEO_RATIOS),
      duration: durationProperty(5, 20),
      resolution: videoResolutionProperty(),
      generate_audio: generateAudioProperty(),
      draft: draftProperty(),
    },
    api_schema: videoApiSchema('t2v'),
    model_pricing: videoPricing('t2v'),
  },
  {
    model_id: 'bfl/flux-3-image-to-video',
    model_name: 'FLUX 3 Image To Video',
    model_description: 'Animate 1–10 keyframe images into 5–20s video. Draft mode returns an HD preview plus a reusable cache.',
    tool_description:
      'Generate a 5–20 second video from 1–10 keyframe images with FLUX 3. Prompt required. Set draft true for a cheaper HD preview; enhance later with FLUX 3 Draft Enhance.',
    model_type: 'image-to-video',
    generation_type: 'video',
    model_product: 'FLUX 3',
    model_variant: 'image-to-video',
    sort_order_variant: 2,
    required: ['prompt', 'keyframes'],
    order: ['prompt', 'keyframes', 'aspect_ratio', 'duration', 'resolution', 'generate_audio', 'draft'],
    properties: {
      prompt: promptProperty('Describe the motion between the keyframes.'),
      keyframes: mediaPicker('Keyframes', 'image', 1, 10, '1–10 images, in order.'),
      aspect_ratio: aspectRatioProperty(VIDEO_RATIOS),
      duration: durationProperty(5, 20),
      resolution: videoResolutionProperty(),
      generate_audio: generateAudioProperty(),
      draft: draftProperty(),
    },
    api_schema: videoApiSchema('i2v'),
    model_pricing: videoPricing('t2v'),
  },
  {
    model_id: 'bfl/flux-3-video-continuation',
    model_name: 'FLUX 3 Video Continuation',
    model_description: 'Continue a source clip for 5–15s. Use this to extend video, not FLUX Video Edit.',
    tool_description:
      'Continue a source video for 5–15 seconds with FLUX 3. Attach start_video. Use this to extend a clip. Set draft true for a cheaper HD preview; enhance later with FLUX 3 Draft Enhance.',
    model_type: 'video-to-video',
    generation_type: 'video',
    model_product: 'FLUX 3',
    model_variant: 'video-continuation',
    sort_order_variant: 3,
    required: ['prompt', 'start_video'],
    order: ['prompt', 'start_video', 'aspect_ratio', 'duration', 'resolution', 'generate_audio', 'draft'],
    properties: {
      prompt: promptProperty('Describe what happens next in the clip.'),
      start_video: mediaPicker('Start video', 'video', 1, 1, 'Clip to continue from. Output starts after this video.'),
      aspect_ratio: aspectRatioProperty(VIDEO_RATIOS),
      duration: durationProperty(5, 15, 'Length of the continuation, not the source plus extra.'),
      resolution: videoResolutionProperty(),
      generate_audio: generateAudioProperty(),
      draft: draftProperty(),
    },
    api_schema: videoApiSchema('v2v'),
    model_pricing: videoPricing('v2v'),
  },
  {
    model_id: 'bfl/flux-3-draft-enhance',
    model_name: 'FLUX 3 Draft Enhance',
    model_description:
      'Upscale a prior FLUX 3 draft using its saved .bin cache. Cost uses full-render rates at the chosen resolution; duration is estimated at 8s.',
    tool_description:
      'Enhance a prior FLUX 3 draft. Attach the saved draft_cache .bin from a draft run. No prompt — the bundle already has the original generation. resolution defaults to fhd. Cost is estimated as 8 seconds at full t2v/i2v rates for the chosen resolution (continuation drafts are slightly undercharged).',
    model_type: 'video-to-video',
    generation_type: 'video',
    model_product: 'FLUX 3',
    model_variant: 'draft-enhance',
    sort_order_variant: 4,
    required: ['draft_cache'],
    order: ['draft_cache', 'resolution'],
    properties: {
      draft_cache: mediaPicker(
        'Draft cache',
        'file',
        1,
        1,
        'The .bin saved from a prior FLUX 3 draft run. Do not attach the preview video.'
      ),
      resolution: videoResolutionProperty('fhd'),
    },
    api_schema: videoApiSchema('draft_enhance'),
    model_pricing: enhancePricing(),
  },
  {
    model_id: 'bfl/flux-video-edit',
    model_name: 'FLUX Video Edit',
    model_description:
      'Edit an existing clip with a prompt. Output follows the source (downscaled to 720p if larger). Do not use this to extend a clip — use FLUX 3 Video Continuation.',
    tool_description:
      'Edit an existing video with FLUX Video Edit. Required: prompt and video. Source max 15s / 50 MiB. Do not use this to extend a clip — use FLUX 3 Video Continuation. Do not send duration, resolution, or audio.',
    model_type: 'video-to-video',
    generation_type: 'video',
    model_product: 'FLUX 3',
    model_variant: 'video-edit',
    sort_order_variant: 5,
    required: ['prompt', 'video'],
    order: ['prompt', 'video'],
    properties: {
      prompt: promptProperty('Describe the edit. Do not use this to extend the clip.'),
      video: mediaPicker('Video', 'video', 1, 1, 'Source clip, max 15 seconds and 50 MiB.'),
    },
    api_schema: videoEditApiSchema(),
    model_pricing: videoEditPricing(),
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
    .select('name')
    .or(`slug.eq.${BRAND_SLUG},name.eq.${BRAND_NAME}`)
    .maybeSingle();
  throwIf(brandError, 'brands fetch');
  if (!brand?.name) throw new Error('Flux brand is missing');

  const { data: existingVendor, error: vendorFetchError } = await supabase
    .from('vendor_apis')
    .select('id, vendor_name')
    .eq('vendor_name', VENDOR)
    .maybeSingle();
  throwIf(vendorFetchError, 'vendor_apis fetch');

  if (!existingVendor) {
    if (!BFL_API_KEY) {
      throw new Error('vendor_apis bfl is missing. Add it on the Vendors page or set BFL_API_KEY');
    }
    const { error: vendorInsertError } = await supabase.from('vendor_apis').insert({
      vendor_name: VENDOR,
      api_key: BFL_API_KEY,
      url: BFL_BILLING_URL,
      config: {},
    });
    throwIf(vendorInsertError, 'vendor_apis insert');
    console.log('inserted vendor_apis bfl');
  } else if (BFL_API_KEY) {
    const { error: vendorUpdateError } = await supabase
      .from('vendor_apis')
      .update({ api_key: BFL_API_KEY, url: BFL_BILLING_URL })
      .eq('vendor_name', VENDOR);
    throwIf(vendorUpdateError, 'vendor_apis update');
    console.log('updated vendor_apis bfl');
  } else {
    console.log('vendor_apis bfl exists');
  }

  for (const model of MODELS) {
    const modelRow = {
      model_id: model.model_id,
      model_name: model.model_name,
      model_description: model.model_description,
      model_type: model.model_type,
      generation_type: model.generation_type,
      model_product: model.model_product,
      model_variant: model.model_variant,
      brand_name: brand.name,
      sort_order: 15,
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

    const functionName = model.model_name.replace(/[\s/]+/g, '');
    const apiRow = {
      gen_models_model_id: model.model_id,
      vendor_api: VENDOR,
      api_schema: model.api_schema,
      function_schema: {
        name: functionName,
        description: model.tool_description,
        type: 'object',
        required: model.required,
        'x-order-properties': model.order,
        properties: model.properties,
      },
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

  console.log('FLUX 3 models seeded');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
