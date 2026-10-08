import assert from 'node:assert/strict';
import { test } from 'node:test';
import { videoInputToGeminiPart, videoInputsFromPayload } from './googleImageVideoPart';
import { googleGeminiImageRequestPayload } from './webhookGoogle';

const YOUTUBE_URL = 'https://www.youtube.com/watch?v=UTdfxFyOQTI';
const FILE_URL = 'https://cdn.example.com/clip.mp4';

test('maps a YouTube URL to fileData without fetching it', () => {
  assert.deepEqual(videoInputToGeminiPart(YOUTUBE_URL), {
    fileData: { fileUri: YOUTUBE_URL, mimeType: 'video/mp4' },
  });
});

test('maps an ordinary https video URL to fileData with that same URL', () => {
  assert.deepEqual(videoInputToGeminiPart({ url: FILE_URL, mime_type: 'video/webm' }), {
    fileData: { fileUri: FILE_URL, mimeType: 'video/webm' },
  });
});

test('image request includes video fileData and leaves image parts unchanged', async () => {
  const image = { inlineData: { mimeType: 'image/png', data: 'abc' } };
  const body = await googleGeminiImageRequestPayload({
    prompt: 'Generate a poster image that captures the key themes of this video.',
    aspect_ratio: '16:9',
    resolution: '2K',
    image,
    video: YOUTUBE_URL,
  });

  assert.deepEqual(body.contents, [
    {
      parts: [
        { text: 'Generate a poster image that captures the key themes of this video.' },
        image,
        { fileData: { fileUri: YOUTUBE_URL, mimeType: 'video/mp4' } },
      ],
    },
  ]);
  const generationConfig = body.generationConfig as {
    responseModalities: string[];
    imageConfig: { aspectRatio: string; imageSize: string };
  };
  assert.deepEqual(generationConfig.responseModalities, ['IMAGE']);
  assert.deepEqual(generationConfig.imageConfig, { aspectRatio: '16:9', imageSize: '2K' });
});

test('image-only payloads do not add a video part', async () => {
  const image = { inlineData: { mimeType: 'image/png', data: 'abc' } };
  const body = await googleGeminiImageRequestPayload({
    prompt: 'a poster',
    aspect_ratio: '1:1',
    image,
  });

  assert.deepEqual(body.contents, [
    {
      parts: [{ text: 'a poster' }, image],
    },
  ]);
  assert.deepEqual(videoInputsFromPayload({ image, prompt: 'a poster' }), []);
});

test('videos array is passed through and preferred over video', async () => {
  const body = await googleGeminiImageRequestPayload({
    prompt: 'a poster',
    videos: [FILE_URL, { url: YOUTUBE_URL }],
    video: 'https://cdn.example.com/ignored.mp4',
  });

  assert.deepEqual(body.contents, [
    {
      parts: [
        { text: 'a poster' },
        { fileData: { fileUri: FILE_URL, mimeType: 'video/mp4' } },
        { fileData: { fileUri: YOUTUBE_URL, mimeType: 'video/mp4' } },
      ],
    },
  ]);
});
