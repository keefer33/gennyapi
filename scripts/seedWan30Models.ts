import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv({ path: resolve(__dirname, '../../gennyadmin/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

const VENDOR = 'alibaba';
const BRAND_NAME = 'Alibaba';
const WAN3_MODELS = ['wan3.0-video', 'wan3.0-video-prime'] as const;
const RATIOS = ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] as const;

type Json = Record<string, unknown>;

function throwIf(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function promptProperty(description: string): Json {
  return { type: 'string', title: 'Prompt', description };
}

function modelProperty(): Json {
  return {
    type: 'string',
    title: 'Model',
    enum: [...WAN3_MODELS],
    default: 'wan3.0-video',
  };
}

function resolutionProperty(): Json {
  return {
    type: 'string',
    title: 'Resolution',
    enum: ['480P', '720P', '1080P'],
    default: '1080P',
  };
}

function ratioProperty(defaultValue = 'adaptive'): Json {
  return {
    type: 'string',
    title: 'Aspect ratio',
    enum: [...RATIOS],
    default: defaultValue,
    'x-ui-component': 'AspectRatioPicker',
  };
}

function durationProperty(): Json {
  return {
    type: 'integer',
    title: 'Duration (seconds)',
    minimum: 2,
    maximum: 30,
    default: 5,
    'x-ui-component': 'NumberSlider',
  };
}

function audioProperty(): Json {
  return {
    type: 'boolean',
    title: 'Audio',
    description: 'Include a soundtrack on the generated video.',
    default: true,
  };
}

function promptExtendProperty(lockedTrue = false): Json {
  return {
    type: 'boolean',
    title: 'Enhance prompt',
    description: lockedTrue
      ? 'Required for file and web-page inputs.'
      : 'Rewrite short prompts for better results. Adds a little latency.',
    default: true,
    ...(lockedTrue ? { readOnly: true } : {}),
  };
}

function seedProperty(): Json {
  return {
    type: 'integer',
    title: 'Seed',
    description: 'Optional seed for reproducible generation. Use -1 for random.',
  };
}

function watermarkProperty(): Json {
  return {
    type: 'boolean',
    title: 'Watermark',
    default: false,
  };
}

function mediaPicker(
  title: string,
  allowed: 'image' | 'video' | 'audio',
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

function urlProperty(title: string, description: string): Json {
  return { type: 'string', title, description, format: 'uri' };
}

const SHARED_PARAM_KEYS = ['model', 'resolution', 'ratio', 'duration', 'audio', 'prompt_extend', 'seed', 'watermark'];

function sharedProperties(options?: { ratioDefault?: string; promptExtendLocked?: boolean }): Json {
  return {
    model: modelProperty(),
    resolution: resolutionProperty(),
    ratio: ratioProperty(options?.ratioDefault),
    duration: durationProperty(),
    audio: audioProperty(),
    prompt_extend: promptExtendProperty(options?.promptExtendLocked),
    seed: seedProperty(),
    watermark: watermarkProperty(),
  };
}

function wan30Pricing(): Json {
  const perSecond = (cost: number) => ({ type: 'multi', field: 'duration', cost });
  const byResolution = (rates: { p480: number; p720: number; p1080: number }) => ({
    field: 'resolution',
    values: {
      '480P': perSecond(rates.p480),
      '720P': perSecond(rates.p720),
      '1080P': perSecond(rates.p1080),
    },
  });
  return {
    type: 'multiFields',
    cost: {
      field: 'model',
      values: {
        'wan3.0-video': byResolution({ p480: 0.05, p720: 0.1, p1080: 0.2 }),
        'wan3.0-video-prime': byResolution({ p480: 0.068, p720: 0.14, p1080: 0.28 }),
      },
    },
  };
}

function apiSchema(): Json {
  return {
    type: 'model_run',
    method: 'POST',
    server: 'https://dashscope-intl.aliyuncs.com',
    api_path: '/api/v1/services/aigc/video-generation/video-synthesis',
    polling_path: 'https://dashscope-intl.aliyuncs.com/api/v1/tasks/',
    vendor_model_name: 'wan3.0-video',
  };
}

const MODELS = [
  {
    model_id: 'alibaba/wan-3.0/text-to-video',
    model_name: 'Alibaba Wan 3.0 Text To Video',
    model_description: 'Text-to-video up to 30 seconds at 30fps, with optional native dialogue and sound.',
    model_type: 'text-to-video',
    model_variant: 'text-to-video',
    sort_order_variant: 1,
    required: ['prompt'],
    order: ['prompt', ...SHARED_PARAM_KEYS],
    properties: {
      prompt: promptProperty('Describe the video. Supports multi-shot storyboards and spoken dialogue.'),
      ...sharedProperties({ ratioDefault: '16:9' }),
    },
  },
  {
    model_id: 'alibaba/wan-3.0/image-to-video',
    model_name: 'Alibaba Wan 3.0 Image To Video',
    model_description: 'Animate a first-frame image. Other media types are not allowed in this mode.',
    model_type: 'image-to-video',
    model_variant: 'image-to-video',
    sort_order_variant: 2,
    required: ['prompt', 'first_frame'],
    order: ['prompt', 'first_frame', ...SHARED_PARAM_KEYS],
    properties: {
      prompt: promptProperty('Describe the motion from the first frame.'),
      first_frame: mediaPicker('First frame', 'image', 1, 1, 'Used as the first frame of the video.'),
      ...sharedProperties(),
    },
  },
  {
    model_id: 'alibaba/wan-3.0/first-last-frame',
    model_name: 'Alibaba Wan 3.0 First Last Frame',
    model_description: 'Interpolate from a first frame to a last frame. Cannot mix with reference media.',
    model_type: 'image-to-video',
    model_variant: 'first-last-frame',
    sort_order_variant: 3,
    required: ['prompt', 'first_frame', 'last_frame'],
    order: ['prompt', 'first_frame', 'last_frame', ...SHARED_PARAM_KEYS],
    properties: {
      prompt: promptProperty('Describe what happens between the first and last frames.'),
      first_frame: mediaPicker('First frame', 'image', 1, 1),
      last_frame: mediaPicker('Last frame', 'image', 1, 1),
      ...sharedProperties(),
    },
  },
  {
    model_id: 'alibaba/wan-3.0/reference-to-video',
    model_name: 'Alibaba Wan 3.0 Reference To Video',
    model_description: 'Reference images, videos, and audio. Mention Image 1, Video 1, Audio 1 in the prompt.',
    model_type: 'image-to-video',
    model_variant: 'reference-to-video',
    sort_order_variant: 4,
    required: ['prompt'],
    order: ['prompt', 'reference_images', 'reference_videos', 'reference_audios', ...SHARED_PARAM_KEYS],
    properties: {
      prompt: promptProperty('Describe the scene. Use Image 1, Video 1, Audio 1 to point at attached media.'),
      reference_images: mediaPicker('Reference images', 'image', 0, 10, 'Up to 10 images.'),
      reference_videos: mediaPicker('Reference videos', 'video', 0, 5, 'Up to 5 clips, 15 seconds total.'),
      reference_audios: mediaPicker('Reference audio', 'audio', 0, 5, 'Up to 5 clips, 15 seconds total.'),
      ...sharedProperties(),
    },
  },
  {
    model_id: 'alibaba/wan-3.0/file-to-video',
    model_name: 'Alibaba Wan 3.0 File To Video',
    model_description: 'Generate a video from a public document or web page. Optional image/video/audio refs.',
    model_type: 'image-to-video',
    model_variant: 'file-to-video',
    sort_order_variant: 5,
    required: ['prompt'],
    order: ['prompt', 'file', 'link', 'reference_images', 'reference_videos', 'reference_audios', ...SHARED_PARAM_KEYS],
    properties: {
      prompt: promptProperty('Describe the video to make from the document or page.'),
      file: urlProperty('File URL', 'Public PDF, PPT, DOC, XLS, TXT, or Markdown URL (max 100MB, 50 pages). Do not set Link at the same time.'),
      link: urlProperty('Web page', 'Public page URL that does not require login. Do not set File at the same time.'),
      reference_images: mediaPicker('Reference images', 'image', 0, 10),
      reference_videos: mediaPicker('Reference videos', 'video', 0, 5),
      reference_audios: mediaPicker('Reference audio', 'audio', 0, 5),
      ...sharedProperties({ promptExtendLocked: true }),
    },
  },
  {
    model_id: 'alibaba/wan-3.0/video-edit',
    model_name: 'Alibaba Wan 3.0 Video Edit',
    model_description: 'Edit or extend a video with a prompt. Optional extra image and audio references.',
    model_type: 'video-to-video',
    model_variant: 'video-edit',
    sort_order_variant: 6,
    required: ['prompt', 'reference_videos'],
    order: ['prompt', 'reference_videos', 'reference_images', 'reference_audios', ...SHARED_PARAM_KEYS],
    properties: {
      prompt: promptProperty('Editing or extension intent, e.g. change style, remove an object, or extend forward.'),
      reference_videos: mediaPicker('Video', 'video', 1, 5, 'The clip to edit or extend.'),
      reference_images: mediaPicker('Reference images', 'image', 0, 10),
      reference_audios: mediaPicker('Reference audio', 'audio', 0, 5),
      ...sharedProperties(),
    },
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
    .eq('name', BRAND_NAME)
    .maybeSingle();
  throwIf(brandError, 'brands fetch');
  if (!brand?.name) throw new Error('Alibaba brand is missing');

  const { data: vendor, error: vendorError } = await supabase
    .from('vendor_apis')
    .select('vendor_name')
    .eq('vendor_name', VENDOR)
    .maybeSingle();
  throwIf(vendorError, 'vendor_apis fetch');
  if (!vendor?.vendor_name) throw new Error('alibaba vendor_apis row is missing');

  const pricing = wan30Pricing();
  const schema = apiSchema();

  for (const model of MODELS) {
    const modelRow = {
      model_id: model.model_id,
      model_name: model.model_name,
      model_description: model.model_description,
      model_type: model.model_type,
      generation_type: 'video',
      model_product: 'wan-3.0',
      model_variant: model.model_variant,
      brand_name: BRAND_NAME,
      sort_order: 19,
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

    const functionName = model.model_name.replace(/\s+/g, '');
    const apiRow = {
      gen_models_model_id: model.model_id,
      vendor_api: VENDOR,
      api_schema: schema,
      function_schema: {
        name: functionName,
        description: model.model_description,
        type: 'object',
        required: model.required,
        'x-order-properties': model.order,
        properties: model.properties,
      },
      model_pricing: pricing,
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

  console.log('Wan 3.0 models seeded');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
