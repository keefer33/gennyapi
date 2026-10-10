import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  heygenOutputUrls,
  heygenPollDecision,
  heygenStatusPath,
  heygenSubmitSelection,
  heygenVideoRequest,
} from './heygenShared';

test('prefers video_id, then id, then session_id', () => {
  assert.deepEqual(heygenSubmitSelection({ data: { video_id: 'vid_1', session_id: 'sess_1' } }), {
    id: 'vid_1',
    heygen_poll: 'video',
  });
  assert.deepEqual(heygenSubmitSelection({ data: { id: 'vid_2' } }), { id: 'vid_2', heygen_poll: 'video' });
  assert.deepEqual(
    heygenSubmitSelection({ data: { session_id: 'sess_abc123', status: 'generating', video_id: null } }),
    { id: 'sess_abc123', heygen_poll: 'session' }
  );
});

test('hands a session off when video_id arrives', () => {
  assert.deepEqual(
    heygenPollDecision({ data: { session_id: 'sess_abc123', status: 'generating', video_id: 'vid_xyz789' } }, 'session'),
    { action: 'handoff', videoId: 'vid_xyz789' }
  );
  assert.equal(heygenStatusPath('session', 'sess_abc123'), '/v3/video-agents/sess_abc123');
  assert.equal(heygenStatusPath('video', 'vid_xyz789', '/v3/video-agents/{id}'), '/v3/videos/vid_xyz789');
});

test('extracts a completed video_url and image urls', () => {
  const body = {
    data: {
      id: 'vid_xyz789',
      status: 'completed',
      video_url: 'https://files.heygen.ai/video/vid_xyz789.mp4',
      image_url: 'https://files.heygen.ai/image/poster.jpg',
      images: [{ url: 'https://files.heygen.ai/image/extra.jpg' }],
    },
  };
  assert.deepEqual(heygenOutputUrls(body), [
    'https://files.heygen.ai/video/vid_xyz789.mp4',
    'https://files.heygen.ai/image/poster.jpg',
    'https://files.heygen.ai/image/extra.jpg',
  ]);
  assert.deepEqual(heygenPollDecision(body, 'video'), {
    action: 'complete',
    urls: [
      'https://files.heygen.ai/video/vid_xyz789.mp4',
      'https://files.heygen.ai/image/poster.jpg',
      'https://files.heygen.ai/image/extra.jpg',
    ],
  });
});

test('keeps pending statuses waiting and fails with failure_message', () => {
  assert.deepEqual(heygenPollDecision({ data: { status: 'processing' } }, 'video'), { action: 'pending' });
  assert.deepEqual(heygenPollDecision({ data: { status: 'generating', video_id: null } }, 'session'), {
    action: 'pending',
  });
  const failed = heygenPollDecision(
    { data: { status: 'failed', failure_message: 'avatar not found' } },
    'video'
  );
  assert.equal(failed.action, 'error');
  if (failed.action !== 'error') return;
  assert.equal(failed.message, 'avatar not found');
  assert.equal(failed.metaError, 'heygen_failed');
  const cancelled = heygenPollDecision(
    { data: { status: 'cancelled', failure_message: 'generation cancelled' } },
    'video'
  );
  assert.equal(cancelled.action, 'error');
  if (cancelled.action !== 'error') return;
  assert.equal(cancelled.metaError, 'heygen_cancelled');
});

test('builds a heygen-video-1 body from playground URL fields', () => {
  assert.deepEqual(
    heygenVideoRequest({
      mode: 'text_to_video',
      prompt: 'A plant supervisor speaks to camera.',
      duration: 5,
      resolution: '768p',
      aspect_ratio: '16:9',
      prompt_enhancement: 'turbo',
      seed: null,
      image: '',
      reference_images: [],
    }),
    {
      model: 'heygen-video-1',
      mode: 'text_to_video',
      prompt: 'A plant supervisor speaks to camera.',
      duration: 5,
      resolution: '768p',
      prompt_enhancement: 'turbo',
      aspect_ratio: '16:9',
    }
  );

  assert.deepEqual(
    heygenVideoRequest({
      mode: 'image_to_video',
      prompt: 'The dish steams.',
      image: 'https://cdn.example/dish.jpg',
      aspect_ratio: '16:9',
      reference_images: ['https://cdn.example/ignored.jpg'],
    }),
    {
      model: 'heygen-video-1',
      mode: 'image_to_video',
      prompt: 'The dish steams.',
      image: { type: 'url', url: 'https://cdn.example/dish.jpg' },
    }
  );

  assert.deepEqual(
    heygenVideoRequest({
      mode: 'reference_to_video',
      prompt: 'The harness in <Picture 1>.',
      aspect_ratio: 'adaptive',
      reference_images: ['https://cdn.example/harness.jpg'],
      reference_videos: [{ type: 'url', url: 'https://cdn.example/clip.mp4' }],
      reference_audio: [],
      image: 'https://cdn.example/unused.jpg',
    }),
    {
      model: 'heygen-video-1',
      mode: 'reference_to_video',
      prompt: 'The harness in <Picture 1>.',
      aspect_ratio: 'adaptive',
      reference_images: [{ type: 'url', url: 'https://cdn.example/harness.jpg' }],
      reference_videos: [{ type: 'url', url: 'https://cdn.example/clip.mp4' }],
    }
  );
});
