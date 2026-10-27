import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bflOutputUrls,
  bflPollDecision,
  bflPollEndpoint,
  buildBflPayload,
  withBflCostDefaults,
} from './bflShared';

test('text-to-video bakes mode and keeps duration', () => {
  const body = buildBflPayload(
    { prompt: 'a fox in mist', duration: 8, resolution: 'fhd', generate_audio: true },
    { mode: 't2v', api_path: '/v1/flux-3-video' }
  );
  assert.equal(body.mode, 't2v');
  assert.equal(body.prompt, 'a fox in mist');
  assert.equal(body.duration, 8);
  assert.equal(body.resolution, 'fhd');
  assert.equal(body.generate_audio, true);
  assert.equal(body.draft, undefined);
});

test('draft forces hd and sets draft true', () => {
  const body = buildBflPayload(
    { prompt: 'fox', draft: true, resolution: 'uhd' },
    { mode: 't2v', api_path: '/v1/flux-3-video' }
  );
  assert.equal(body.draft, true);
  assert.equal(body.resolution, 'hd');
});

test('image-to-video maps keyframe urls before other fields', () => {
  const body = buildBflPayload(
    {
      prompt: 'camera rises',
      keyframes: ['https://cdn.example.com/a.png', { url: 'https://cdn.example.com/b.png' }],
    },
    { mode: 'i2v', api_path: '/v1/flux-3-video' }
  );
  assert.deepEqual(body.keyframes, ['https://cdn.example.com/a.png', 'https://cdn.example.com/b.png']);
  assert.equal(body.mode, 'i2v');
});

test('video continuation uses start_video', () => {
  const body = buildBflPayload(
    { prompt: 'they enter the market', start_video: 'https://cdn.example.com/clip.mp4' },
    { mode: 'v2v', api_path: '/v1/flux-3-video' }
  );
  assert.equal(body.start_video, 'https://cdn.example.com/clip.mp4');
  assert.equal(body.mode, 'v2v');
});

test('video edit has no mode and maps video plus prompt', () => {
  const body = buildBflPayload(
    { prompt: 'remove the bucket', video: 'https://cdn.example.com/harbor.mp4', duration: 10 },
    { api_path: '/v1/flux-tools/video-edit-v1' }
  );
  assert.equal(body.mode, undefined);
  assert.equal(body.prompt, 'remove the bucket');
  assert.equal(body.video, 'https://cdn.example.com/harbor.mp4');
  assert.equal(body.duration, undefined);
});

test('draft enhance sends draft_cache without a prompt', () => {
  const body = buildBflPayload(
    { draft_cache: 'https://file.genny.bot/draft.bin', resolution: 'uhd' },
    { mode: 'draft_enhance', api_path: '/v1/flux-3-video' }
  );
  assert.equal(body.mode, 'draft_enhance');
  assert.equal(body.draft_cache, 'https://file.genny.bot/draft.bin');
  assert.equal(body.prompt, undefined);
  assert.equal(body.resolution, 'uhd');
});

test('image maps optional references and omits empty images', () => {
  const t2i = buildBflPayload({ prompt: 'coastal highway', aspect_ratio: '21:9' }, { api_path: '/v1/flux-3-image' });
  assert.equal(t2i.images, undefined);
  assert.equal(t2i.mode, undefined);
  const i2i = buildBflPayload(
    { prompt: 'recolor the bird', images: ['https://cdn.example.com/birds.webp'] },
    { api_path: '/v1/flux-3-image' }
  );
  assert.equal(i2i.images, 'https://cdn.example.com/birds.webp');
});

test('cost defaults duration 8, hd, and draft false for video', () => {
  assert.deepEqual(withBflCostDefaults({ prompt: 'x' }, { mode: 't2v', api_path: '/v1/flux-3-video' }), {
    prompt: 'x',
    duration: 8,
    resolution: 'hd',
    draft: false,
  });
  assert.equal(
    withBflCostDefaults({ draft: true, duration: 'auto' }, { mode: 't2v', api_path: '/v1/flux-3-video' }).resolution,
    'hd'
  );
  const enhance = withBflCostDefaults({}, { mode: 'draft_enhance', api_path: '/v1/flux-3-video' });
  assert.equal(enhance.resolution, 'fhd');
  assert.equal(enhance.duration, 8);
  assert.equal(withBflCostDefaults({}, { api_path: '/v1/flux-3-image' }).resolution, '1k');
});

test('poll ready returns sample and draft_cache', () => {
  assert.deepEqual(
    bflPollDecision({
      status: 'Ready',
      result: {
        sample: 'https://delivery.bfl.ai/clip.mp4',
        draft_cache: 'https://delivery.bfl.ai/cache.bin',
      },
    }),
    {
      action: 'complete',
      urls: ['https://delivery.bfl.ai/clip.mp4', 'https://delivery.bfl.ai/cache.bin'],
    }
  );
  assert.equal(bflPollDecision({ status: 'Generating' }).action, 'pending');
  assert.equal(bflPollDecision({ status: 'Content Moderated' }).action, 'error');
  assert.equal(bflOutputUrls({ result: { sample: 'https://delivery.bfl.ai/a.png' } })[0], 'https://delivery.bfl.ai/a.png');
});

test('uses polling_url and falls back to get_result', () => {
  assert.equal(
    bflPollEndpoint('https://api.bfl.ai/v1/get_result?id=abc', 'https://api.bfl.ai', '/v1/get_result?id=', 'ignored'),
    'https://api.bfl.ai/v1/get_result?id=abc'
  );
  assert.equal(
    bflPollEndpoint('', 'https://api.bfl.ai/', '/v1/get_result?id=', 'task-1'),
    'https://api.bfl.ai/v1/get_result?id=task-1'
  );
});
