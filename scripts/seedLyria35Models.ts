import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv({ path: resolve(__dirname, '../../gennyadmin/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';
const GOOGLE_API_KEY = (
  process.env.GOOGLE_API_KEY ||
  process.env.VITE_GOOGLE_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.VITE_GEMINI_API_KEY ||
  ''
).trim();

const VENDOR = 'google';
const BRAND_NAME = 'Google';
const BRAND_SLUG = 'google';
const GOOGLE_BILLING_URL = 'https://aistudio.google.com/usage';

type Json = Record<string, unknown>;

function throwIf(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
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
  if (!brand?.name) throw new Error('Google brand is missing');

  const { data: existingVendor, error: vendorFetchError } = await supabase
    .from('vendor_apis')
    .select('id, vendor_name')
    .eq('vendor_name', VENDOR)
    .maybeSingle();
  throwIf(vendorFetchError, 'vendor_apis fetch');

  if (!existingVendor) {
    if (!GOOGLE_API_KEY) {
      throw new Error('vendor_apis google is missing. Add it on the Vendors page or set GOOGLE_API_KEY');
    }
    const { error: vendorInsertError } = await supabase.from('vendor_apis').insert({
      vendor_name: VENDOR,
      api_key: GOOGLE_API_KEY,
      url: GOOGLE_BILLING_URL,
      config: {},
    });
    throwIf(vendorInsertError, 'vendor_apis insert');
    console.log('inserted vendor_apis google');
  } else {
    console.log('vendor_apis google exists');
  }

  const model = {
    model_id: 'google/lyria-3.5',
    model_name: 'Lyria 3.5',
    model_description:
      'Full-length songs with verses, choruses, and bridges. 44.1 kHz stereo MP3 from a prompt, optional lyrics, and up to 10 reference images.',
    tool_description:
      'Generate a full song with Google Lyria 3.5. Required: prompt. Optional: lyrics, up to 10 images, instrumental true for no vocals. Duration is influenced by the prompt (about 1–3 minutes). Cost is $0.08 per song.',
    model_type: 'text-to-audio',
    generation_type: 'audio' as const,
    model_product: 'Lyria 3.5',
    model_variant: 'full-song',
    sort_order_variant: 1,
    required: ['prompt'],
    order: ['prompt', 'lyrics', 'images', 'instrumental'],
    properties: {
      prompt: {
        type: 'string',
        title: 'Prompt',
        description:
          'Describe genre, mood, instruments, and structure. Mention a length (for example a 2-minute song) to influence duration.',
      },
      lyrics: {
        type: 'string',
        title: 'Lyrics',
        description: 'Optional. Use [Verse], [Chorus], and [Bridge] tags to shape the song.',
      },
      images: mediaPicker(
        'Reference images',
        'image',
        0,
        10,
        'Optional. Up to 10 images. Lyria composes music inspired by the stills.'
      ),
      instrumental: {
        type: 'boolean',
        title: 'Instrumental',
        description: 'Generate without vocals.',
        default: false,
      },
    },
    api_schema: {
      type: 'model_run',
      method: 'POST',
      server: 'https://generativelanguage.googleapis.com/v1beta',
      api_path: '/interactions',
      polling_path: '/interactions/',
      vendor_model_name: 'lyria-3.5',
      request_type: 'interactions',
    },
    model_pricing: { type: 'per', cost: 0.08 },
  };

  const modelRow = {
    model_id: model.model_id,
    model_name: model.model_name,
    model_description: model.model_description,
    model_type: model.model_type,
    generation_type: model.generation_type,
    model_product: model.model_product,
    model_variant: model.model_variant,
    brand_name: brand.name,
    sort_order: 20,
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
    api_schema: model.api_schema,
    function_schema: {
      name: model.model_name.replace(/[\s/]+/g, ''),
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

  console.log('Lyria 3.5 model seeded');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
