import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculatePricingUtil } from '../../shared/calculateCosts';
import { buildAlibabaVideoPayload, withAlibabaCostDefaults } from './alibabaVideoPayload';

test('text-to-video sends prompt and parameters with no media', () => {
  const body = buildAlibabaVideoPayload(
    {
      prompt: 'a kitten on a rooftop',
      resolution: '1080P',
      ratio: '16:9',
      duration: 5,
      audio: true,
      prompt_extend: true,
    },
    'wan3.0-video'
  );
  assert.equal(body.model, 'wan3.0-video');
  assert.deepEqual(body.input, { prompt: 'a kitten on a rooftop' });
  assert.deepEqual(body.parameters, {
    resolution: '1080P',
    ratio: '16:9',
    duration: 5,
    audio: true,
    prompt_extend: true,
  });
});

test('uses payload model over the vendor default', () => {
  const body = buildAlibabaVideoPayload({ prompt: 'fox', model: 'wan3.0-video-prime' }, 'wan3.0-video');
  assert.equal(body.model, 'wan3.0-video-prime');
});

test('maps first_frame and last_frame types', () => {
  const first = buildAlibabaVideoPayload(
    { prompt: 'a cat running', first_frame: 'https://cdn.example.com/first.png', duration: 5 },
    'wan3.0-video'
  );
  assert.deepEqual((first.input as { media: unknown }).media, [
    { type: 'first_frame', url: 'https://cdn.example.com/first.png' },
  ]);

  const both = buildAlibabaVideoPayload(
    {
      prompt: 'dawn in a pumpkin patch',
      first_frame: 'https://cdn.example.com/first.webp',
      last_frame: 'https://cdn.example.com/last.webp',
    },
    'wan3.0-video'
  );
  assert.deepEqual((both.input as { media: unknown }).media, [
    { type: 'first_frame', url: 'https://cdn.example.com/first.webp' },
    { type: 'last_frame', url: 'https://cdn.example.com/last.webp' },
  ]);
});

test('maps reference_audios to reference_audio and keeps output audio in parameters', () => {
  const body = buildAlibabaVideoPayload(
    {
      prompt: 'Image 1 sings',
      reference_images: ['https://cdn.example.com/girl.jpg'],
      reference_audios: [{ url: 'https://cdn.example.com/song.mp3' }],
      audio: true,
    },
    'wan3.0-video'
  );
  assert.deepEqual((body.input as { media: unknown }).media, [
    { type: 'reference_image', url: 'https://cdn.example.com/girl.jpg' },
    { type: 'reference_audio', url: 'https://cdn.example.com/song.mp3' },
  ]);
  assert.equal((body.parameters as { audio?: unknown }).audio, true);
});

test('maps file urls into media', () => {
  const body = buildAlibabaVideoPayload(
    {
      prompt: 'product ad from this deck',
      file: 'https://cdn.example.com/glass.pptx',
      prompt_extend: true,
    },
    'wan3.0-video'
  );
  assert.deepEqual((body.input as { media: unknown }).media, [
    { type: 'file', url: 'https://cdn.example.com/glass.pptx' },
  ]);
});

test('remaps aspect_ratio to ratio on text-to-video', () => {
  const body = buildAlibabaVideoPayload(
    { prompt: 'neon city', aspect_ratio: '9:16', duration: 8 },
    'wan3.0-video'
  );
  assert.equal((body.parameters as { ratio?: unknown }).ratio, '9:16');
  assert.equal((body.parameters as { aspect_ratio?: unknown }).aspect_ratio, undefined);
});

test('maps link urls into media', () => {
  const body = buildAlibabaVideoPayload(
    {
      prompt: 'product ad from this page',
      link: 'https://example.com/product',
      prompt_extend: true,
    },
    'wan3.0-video'
  );
  assert.deepEqual((body.input as { media: unknown }).media, [
    { type: 'link', url: 'https://example.com/product' },
  ]);
});

test('cost defaults duration 5, 1080P, and vendor model', async () => {
  const values = withAlibabaCostDefaults({}, 'wan3.0-video');
  assert.equal(values.duration, 5);
  assert.equal(values.resolution, '1080P');
  assert.equal(values.model, 'wan3.0-video');

  const pricing = {
    type: 'multiFields',
    cost: {
      field: 'model',
      values: {
        'wan3.0-video': {
          field: 'resolution',
          values: {
            '480P': { type: 'multi', field: 'duration', cost: 0.05 },
            '720P': { type: 'multi', field: 'duration', cost: 0.1 },
            '1080P': { type: 'multi', field: 'duration', cost: 0.2 },
          },
        },
        'wan3.0-video-prime': {
          field: 'resolution',
          values: {
            '480P': { type: 'multi', field: 'duration', cost: 0.068 },
            '720P': { type: 'multi', field: 'duration', cost: 0.14 },
            '1080P': { type: 'multi', field: 'duration', cost: 0.28 },
          },
        },
      },
    },
  };

  assert.equal(await calculatePricingUtil(values, pricing), 1);
  const primeCost = await calculatePricingUtil(
    withAlibabaCostDefaults({ model: 'wan3.0-video-prime', resolution: '720P', duration: 10 }),
    pricing
  );
  assert.equal(Number(primeCost.toFixed(2)), 1.4);
});
