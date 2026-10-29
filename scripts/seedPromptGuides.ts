import { config as loadEnv } from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv({ path: resolve(__dirname, '../../gennyadmin/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';
const GUIDES_DIR = resolve(__dirname, 'prompt-guides');

const BRAND_GUIDES: Array<{ slug: string; name: string; file: string }> = [
  { slug: 'flux', name: 'Flux', file: 'flux.md' },
  { slug: 'google', name: 'Google', file: 'google.md' },
  { slug: 'alibaba', name: 'Alibaba', file: 'alibaba.md' },
  { slug: 'qwen', name: 'Qwen', file: 'qwen.md' },
  { slug: 'recraft', name: 'Recraft', file: 'recraft.md' },
  { slug: 'minimax', name: 'Minimax', file: 'minimax.md' },
  { slug: 'xai', name: 'Xai', file: 'xai.md' },
];

const PRODUCT_GUIDES: Array<{ product: string; file: string }> = [
  { product: 'grok-imagine-video-v1.5', file: 'xai-grok-imagine-video-1.5.md' },
  { product: 'grok-imagine-video-v1.5-lite', file: 'xai-grok-imagine-video-1.5-lite.md' },
  { product: 'grok-imagine-image-2.0', file: 'xai-grok-imagine-image-2.0.md' },
];

const MODEL_GUIDES: Array<{ model_id: string; file: string }> = [
  { model_id: 'google/lyria-3.5', file: 'google-lyria-3.5.md' },
];

function throwIf(error: { message: string } | null, context: string): void {
  if (!error) return;
  const missingColumn = /prompt_guide/i.test(error.message) && /schema cache|column/i.test(error.message);
  if (missingColumn) {
    throw new Error(
      `${context}: missing prompt_guide column. Run sql/prompt_guides.sql in the Supabase SQL editor, then re-run this script.`
    );
  }
  throw new Error(`${context}: ${error.message}`);
}

function readGuide(file: string): string {
  return readFileSync(resolve(GUIDES_DIR, file), 'utf8').trim();
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const brand of BRAND_GUIDES) {
    const prompt_guide = readGuide(brand.file);
    const { data, error } = await supabase
      .from('brands')
      .update({ prompt_guide })
      .or(`slug.eq.${brand.slug},name.eq.${brand.name}`)
      .select('id, name, slug');
    throwIf(error, `brands.prompt_guide ${brand.slug}`);
    if (!data?.length) {
      console.warn(`skip brand ${brand.slug}: no row with that slug or name`);
      continue;
    }
    console.log(`updated brand ${data[0].slug} (${data[0].name})`);
  }

  for (const product of PRODUCT_GUIDES) {
    const prompt_guide = readGuide(product.file);
    const { data, error } = await supabase
      .from('gen_models')
      .update({ prompt_guide })
      .eq('model_product', product.product)
      .select('id, model_id, model_name, model_product');
    throwIf(error, `gen_models.prompt_guide product ${product.product}`);
    if (!data?.length) {
      console.warn(`skip product ${product.product}: no matching gen_models rows`);
      continue;
    }
    for (const row of data) {
      console.log(`updated product ${row.model_product} model ${row.model_id} (${row.model_name})`);
    }
  }

  for (const model of MODEL_GUIDES) {
    const prompt_guide = readGuide(model.file);
    const { data, error } = await supabase
      .from('gen_models')
      .update({ prompt_guide })
      .eq('model_id', model.model_id)
      .select('id, model_id, model_name');
    throwIf(error, `gen_models.prompt_guide ${model.model_id}`);
    if (!data?.length) {
      console.warn(`skip model ${model.model_id}: no matching gen_models row`);
      continue;
    }
    for (const row of data) {
      console.log(`updated model ${row.model_id} (${row.model_name})`);
    }
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
