import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  higgsfieldAuthorizationValue,
  higgsfieldOutputUrls,
  higgsfieldPollDecision,
  higgsfieldStatusEndpoint,
} from './higgsfieldShared';

test('builds the Key authorization header value', () => {
  assert.equal(higgsfieldAuthorizationValue('key-id', 'key-secret'), 'Key key-id:key-secret');
});

test('collects image, video, and audio urls', () => {
  assert.deepEqual(
    higgsfieldOutputUrls({
      images: [{ url: 'https://cdn.example.com/a.jpg' }, { url: 'https://cdn.example.com/b.jpg' }],
      video: { url: 'https://cdn.example.com/clip.mp4' },
      audio: { url: 'https://cdn.example.com/voice.mp3' },
      audios: [{ url: 'https://cdn.example.com/voice.mp3' }, { url: 'https://cdn.example.com/extra.mp3' }],
    }),
    [
      'https://cdn.example.com/a.jpg',
      'https://cdn.example.com/b.jpg',
      'https://cdn.example.com/clip.mp4',
      'https://cdn.example.com/voice.mp3',
      'https://cdn.example.com/extra.mp3',
    ]
  );
});

test('keeps queued and in_progress pending', () => {
  assert.deepEqual(higgsfieldPollDecision({ status: 'queued' }), { action: 'pending' });
  assert.deepEqual(higgsfieldPollDecision({ status: 'in_progress' }), { action: 'pending' });
});

test('completes when media urls are present', () => {
  assert.deepEqual(
    higgsfieldPollDecision({
      status: 'completed',
      images: [{ url: 'https://cdn.example.com/image.jpg' }],
    }),
    { action: 'complete', urls: ['https://cdn.example.com/image.jpg'] }
  );
});

test('errors on completed output with no media, nsfw, and canceled', () => {
  const empty = higgsfieldPollDecision({ status: 'completed' });
  const nsfw = higgsfieldPollDecision({ status: 'nsfw' });
  const canceled = higgsfieldPollDecision({ status: 'canceled', error: { message: 'stopped' } });
  const failed = higgsfieldPollDecision({ status: 'failed', detail: 'model error' });
  assert.equal(empty.action, 'error');
  assert.equal(nsfw.action, 'error');
  assert.equal(canceled.action, 'error');
  assert.equal(failed.action, 'error');
  if (nsfw.action !== 'error' || canceled.action !== 'error' || failed.action !== 'error') return;
  assert.equal(nsfw.metaError, 'higgsfield_nsfw');
  assert.equal(canceled.message, 'stopped');
  assert.equal(failed.message, 'model error');
});

test('uses status_url and falls back to the request status path', () => {
  assert.equal(
    higgsfieldStatusEndpoint(
      'https://api.higgsfield.ai/requests/abc/status',
      'https://api.higgsfield.ai',
      'ignored'
    ),
    'https://api.higgsfield.ai/requests/abc/status'
  );
  assert.equal(
    higgsfieldStatusEndpoint('', 'https://api.higgsfield.ai/', 'req-1'),
    'https://api.higgsfield.ai/requests/req-1/status'
  );
});
