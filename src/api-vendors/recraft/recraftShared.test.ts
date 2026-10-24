import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  RecraftPayloadError,
  calculateRecraftRunCost,
  collectRecraftImageUrls,
  mapRecraftGenerationPayload,
  recraftErrorMessage,
  recraftGenerationDecision,
} from './recraftShared';

const V41_PRICING = {
  type: 'multiFields',
  cost: {
    field: 'model',
    values: {
      recraftv4_1: { type: 'multi', field: 'n', cost: 0.035 },
      recraftv4_1_vector: { type: 'multi', field: 'n', cost: 0.08 },
      recraftv4_1_pro: { type: 'multi', field: 'n', cost: 0.25 },
      recraftv4_1_flash: { type: 'multi', field: 'n', cost: 0.007 },
      recraftv4_styles: { type: 'multi', field: 'n', cost: 0.04 },
    },
  },
};

test('maps n and size and defaults the Recraft model', () => {
  assert.deepEqual(
    mapRecraftGenerationPayload({ prompt: 'a red fox', n: 3, size: '16:9' }, 'recraftv4_1'),
    {
      prompt: 'a red fox',
      model: 'recraftv4_1',
      n: 3,
      size: '16:9',
      response_format: 'url',
    }
  );
});

test('drops image_format for vector models', () => {
  const body = mapRecraftGenerationPayload(
    {
      prompt: 'app icon',
      model: 'recraftv4_1_vector',
      image_format: 'png',
      size: '1:1',
    },
    'recraftv4_1'
  );
  assert.equal(body.model, 'recraftv4_1_vector');
  assert.equal(body.image_format, undefined);
  assert.equal(body.size, '1:1');
  assert.equal(body.n, 1);
});

test('keeps raster image_format', () => {
  const body = mapRecraftGenerationPayload(
    { prompt: 'fox', image_format: 'png' },
    'recraftv4_1'
  );
  assert.equal(body.image_format, 'png');
});

test('rejects V4 Styles without style refs or style_id', () => {
  assert.throws(
    () => mapRecraftGenerationPayload({ prompt: 'fox', model: 'recraftv4_styles' }),
    (error: unknown) => error instanceof RecraftPayloadError && /style_id or style_reference_urls/.test(error.message)
  );
});

test('accepts V4 Styles with style_id or reference urls', () => {
  assert.deepEqual(
    mapRecraftGenerationPayload({
      prompt: 'fox',
      model: 'recraftv4_styles',
      style_id: '0e6a1b8c-5b1f-4a8e-9f3a-2c7d4e8b9a10',
    }).style_id,
    '0e6a1b8c-5b1f-4a8e-9f3a-2c7d4e8b9a10'
  );
  assert.deepEqual(
    mapRecraftGenerationPayload({
      prompt: 'fox',
      model: 'recraftv4_styles_pro',
      style_reference_urls: [{ url: 'https://cdn.example.com/ref.png' }, 'https://cdn.example.com/ref2.jpg'],
    }).style_reference_urls,
    ['https://cdn.example.com/ref.png', 'https://cdn.example.com/ref2.jpg']
  );
});

test('rejects combining style_id with style references', () => {
  assert.throws(
    () =>
      mapRecraftGenerationPayload({
        prompt: 'fox',
        style_id: 'style-1',
        style_reference_urls: ['https://cdn.example.com/ref.png'],
      }),
    RecraftPayloadError
  );
});

test('strips style fields from Flash requests', () => {
  const body = mapRecraftGenerationPayload(
    {
      prompt: 'fox',
      style_id: 'style-1',
      style_reference_urls: ['https://cdn.example.com/ref.png'],
    },
    'recraftv4_1_flash'
  );
  assert.equal(body.model, 'recraftv4_1_flash');
  assert.equal(body.style_id, undefined);
  assert.equal(body.style_reference_urls, undefined);
});

test('collects Recraft image urls and HTTP decisions', () => {
  const body = {
    created: 1759140000,
    credits: 80,
    data: [
      { image_id: 'a', url: 'https://cdn.example.com/a.webp' },
      { image_id: 'b', url: 'https://cdn.example.com/b.webp' },
    ],
  };
  assert.deepEqual(collectRecraftImageUrls(body), [
    'https://cdn.example.com/a.webp',
    'https://cdn.example.com/b.webp',
  ]);
  assert.deepEqual(recraftGenerationDecision(200, body), {
    action: 'complete',
    urls: ['https://cdn.example.com/a.webp', 'https://cdn.example.com/b.webp'],
  });
  assert.deepEqual(recraftGenerationDecision(400, { message: 'style is required' }), {
    action: 'error',
    message: 'style is required',
    metaError: 'recraft_http_400',
  });
  assert.equal(recraftGenerationDecision(200, { data: [] }).action, 'error');
  assert.equal(recraftErrorMessage({ error: { message: 'invalid size' } }, 'fallback'), 'invalid size');
});

test('prices Recraft variants by n and adds the style-create fee', async () => {
  assert.equal(await calculateRecraftRunCost({ prompt: 'fox' }, V41_PRICING, 'recraftv4_1'), 0.035);
  assert.equal(
    await calculateRecraftRunCost({ prompt: 'fox', n: 2, model: 'recraftv4_1_vector' }, V41_PRICING),
    0.16
  );
  assert.equal(await calculateRecraftRunCost({ prompt: 'fox', n: 3 }, V41_PRICING, 'recraftv4_1_flash'), 0.021);
  assert.equal(
    await calculateRecraftRunCost(
      {
        prompt: 'fox',
        model: 'recraftv4_styles',
        style_reference_urls: ['https://cdn.example.com/ref.png'],
      },
      V41_PRICING
    ),
    0.045
  );
});
