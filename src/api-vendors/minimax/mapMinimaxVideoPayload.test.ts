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
