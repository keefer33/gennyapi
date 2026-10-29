import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppError } from '../../app/error';
import { mapMinimaxVideoPayload, minimaxErrorMessage } from './mapMinimaxVideoPayload';

const MODEL = 'MiniMax-H3-Max';

test('maps text-to-video prompt + aspect_ratio', () => {
  const body = mapMinimaxVideoPayload(
    {
      prompt: 'A boy playing basketball by the sea',
      duration: '5',
      resolution: '480P',
      aspect_ratio: '16:9',
    },
    MODEL
  );
  assert.deepEqual(body, {
    model: MODEL,
    content: [{ type: 'text', text: 'A boy playing basketball by the sea' }],
    resolution: '480P',
    duration: 5,
    ratio: '16:9',
  });
});

test('rejects text-to-video adaptive ratio', () => {
  assert.throws(
    () =>
      mapMinimaxVideoPayload(
        { prompt: 'ocean', duration: 5, resolution: '768P', ratio: 'adaptive' },
        MODEL
      ),
    (error: unknown) => error instanceof AppError && error.code === 'minimax_t2v_ratio_required'
  );
});

test('maps image-to-video first and last frame and forces adaptive ratio', () => {
  const body = mapMinimaxVideoPayload(
    {
      prompt: 'Add steam to the ramen',
      duration: 6,
      resolution: '768P',
      aspect_ratio: '16:9',
      image_url: 'https://cdn.example.com/first.png',
      end_image_url: { url: 'https://cdn.example.com/last.png' },
      prompt_expansion_mode: 'quality',
    },
    MODEL
  );
  assert.equal(body.ratio, 'adaptive');
  assert.deepEqual(body.content, [
    { type: 'text', text: 'Add steam to the ramen' },
    {
      type: 'image_url',
      image_url: { url: 'https://cdn.example.com/first.png' },
      role: 'first_frame',
    },
    {
      type: 'image_url',
      image_url: { url: 'https://cdn.example.com/last.png' },
      role: 'last_frame',
    },
  ]);
  assert.deepEqual(body.extra, { prompt_expansion_mode: 'quality' });
});

test('maps reference-to-video images, videos, and audio', () => {
  const body = mapMinimaxVideoPayload(
    {
      prompt: 'Character speaks: Follow the wind.',
      duration: 8,
      resolution: '480P',
      reference_image_urls: ['https://cdn.example.com/ref.png'],
      reference_video_urls: ['https://cdn.example.com/ref.mp4'],
      reference_audio_urls: ['https://cdn.example.com/ref.mp3'],
    },
    MODEL
  );
  assert.equal(body.ratio, 'adaptive');
  assert.equal(body.content.length, 4);
  assert.equal(body.content[1]?.role, 'reference_image');
  assert.equal(body.content[2]?.role, 'reference_video');
  assert.equal(body.content[3]?.role, 'reference_audio');
});

test('rejects mixed image-to-video and reference-to-video inputs', () => {
  assert.throws(
    () =>
      mapMinimaxVideoPayload(
        {
          prompt: 'mix',
          duration: 5,
          resolution: '480P',
          image_url: 'https://cdn.example.com/first.png',
          reference_image_urls: ['https://cdn.example.com/ref.png'],
        },
        MODEL
      ),
    (error: unknown) => error instanceof AppError && error.code === 'minimax_mixed_i2v_r2v'
  );
});

test('passes through an existing content array', () => {
  const content = [
    { type: 'text' as const, text: 'native content' },
    {
      type: 'image_url' as const,
      image_url: { url: 'https://cdn.example.com/first.png' },
      role: 'first_frame' as const,
    },
  ];
  const body = mapMinimaxVideoPayload(
    { content, duration: 5, resolution: '768P' },
    MODEL
  );
  assert.equal(body.ratio, 'adaptive');
  assert.deepEqual(body.content, content);
});

test('maps MiniMax-H3-Highspeed text-to-video at 768P', () => {
  const body = mapMinimaxVideoPayload(
    {
      prompt: 'A courier weaving through a night market',
      duration: 6,
      resolution: '768P',
      aspect_ratio: '9:16',
    },
    'MiniMax-H3-Highspeed'
  );
  assert.equal(body.model, 'MiniMax-H3-Highspeed');
  assert.equal(body.resolution, '768P');
  assert.equal(body.duration, 6);
  assert.equal(body.ratio, '9:16');
  assert.equal(body.extra, undefined);
});

test('MiniMax-H3-Lite image-to-video still uses adaptive ratio', () => {
  const body = mapMinimaxVideoPayload(
    {
      prompt: 'Add steam to the ramen',
      duration: 5,
      resolution: '480P',
      aspect_ratio: '4:3',
      image_url: 'https://cdn.example.com/first.png',
    },
    'MiniMax-H3-Lite'
  );
  assert.equal(body.model, 'MiniMax-H3-Lite');
  assert.equal(body.ratio, 'adaptive');
  assert.equal(body.resolution, '480P');
  assert.equal(body.extra, undefined);
});

test('MiniMax-H3-Lite reference-to-video requires a concrete ratio', () => {
  const body = mapMinimaxVideoPayload(
    {
      prompt: 'Character speaks: Follow the wind.',
      duration: 8,
      resolution: '768P',
      aspect_ratio: '9:16',
      reference_image_urls: ['https://cdn.example.com/ref.png'],
    },
    'MiniMax-H3-Lite'
  );
  assert.equal(body.model, 'MiniMax-H3-Lite');
  assert.equal(body.ratio, '9:16');
});

test('MiniMax-H3-Lite reference-to-video defaults adaptive to 16:9', () => {
  const body = mapMinimaxVideoPayload(
    {
      prompt: 'Character walks through a market',
      duration: 6,
      resolution: '480P',
      reference_video_urls: ['https://cdn.example.com/ref.mp4'],
    },
    'MiniMax-H3-Lite'
  );
  assert.equal(body.ratio, '16:9');
});

test('omits extra.prompt_expansion_mode for MiniMax-H3', () => {
  const body = mapMinimaxVideoPayload(
    {
      prompt: 'quality lighthouse',
      duration: 4,
      resolution: '2K',
      aspect_ratio: '16:9',
      prompt_expansion_mode: 'quality',
    },
    'MiniMax-H3'
  );
  assert.equal(body.model, 'MiniMax-H3');
  assert.equal(body.extra, undefined);
  assert.equal(body.resolution, '2K');
  assert.equal(body.duration, 4);
});

test('parses MiniMax OpenAI-style errors', () => {
  assert.equal(
    minimaxErrorMessage(
      {
        type: 'error',
        error: { type: 'bad_request_error', message: 'invalid params (2013)', http_code: '400' },
      },
      'fallback'
    ),
    'invalid params (2013)'
  );
});
