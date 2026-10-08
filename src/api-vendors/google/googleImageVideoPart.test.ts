import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  collectInteractionOutputImages,
  googleYouTubeImageInteractionRequest,
  isYouTubeVideoUrl,
  videoInputToGeminiPart,
  videoInputsFromPayload,
} from './googleImageVideoPart';
import { googleGeminiImageRequestPayload } from './webhookGoogle';

const YOUTUBE_URL = 'https://www.youtube.com/watch?v=UTdfxFyOQTI';
const FILE_URL = 'https://cdn.example.com/clip.mp4';
const MODEL = 'gemini-nano-banana-2.1';

test('detects YouTube hosts and leaves other video URLs alone', () => {
  assert.equal(isYouTubeVideoUrl(YOUTUBE_URL), true);
  assert.equal(isYouTubeVideoUrl('https://youtu.be/UTdfxFyOQTI'), true);
  assert.equal(isYouTubeVideoUrl('https://m.youtube.com/shorts/abc123'), true);
  assert.equal(isYouTubeVideoUrl(FILE_URL), false);
});

test('maps a YouTube URL to an interactions video part and does not fetch it', () => {
  assert.equal(videoInputToGeminiPart(YOUTUBE_URL), null);
  assert.deepEqual(
    googleYouTubeImageInteractionRequest(MODEL, {
      prompt: 'Generate a poster image that captures the key themes of this video.',
      video: YOUTUBE_URL,
      aspect_ratio: '16:9',
      resolution: '2k',
    }),
    {
      model: MODEL,
      input: [
        { type: 'video', uri: YOUTUBE_URL, mime_type: 'video/mp4' },
        { type: 'text', text: 'Generate a poster image that captures the key themes of this video.' },
      ],
      response_format: { type: 'image', aspect_ratio: '16:9', image_size: '2K' },
    }
  );
});

test('maps an ordinary https video URL to fileData and skips interactions', () => {
  assert.equal(googleYouTubeImageInteractionRequest(MODEL, { prompt: 'a poster', video: FILE_URL }), null);
  assert.deepEqual(videoInputToGeminiPart({ url: FILE_URL, mime_type: 'video/webm' }), {
    fileData: { fileUri: FILE_URL, mimeType: 'video/webm' },
  });
});

test('image request keeps a non-YouTube video on generateContent', async () => {
  const image = { inlineData: { mimeType: 'image/png', data: 'abc' } };
  const body = await googleGeminiImageRequestPayload({
    prompt: 'a poster',
    aspect_ratio: '16:9',
    resolution: '2K',
    image,
    video: FILE_URL,
  });

  assert.deepEqual(body.contents, [
    {
      parts: [
        { text: 'a poster' },
        image,
        { fileData: { fileUri: FILE_URL, mimeType: 'video/mp4' } },
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
  assert.equal(googleYouTubeImageInteractionRequest(MODEL, { image, prompt: 'a poster' }), null);
  assert.deepEqual(videoInputsFromPayload({ image, prompt: 'a poster' }), []);
});

test('a YouTube URL is left out of generateContent and sent as the only interactions video', async () => {
  const body = await googleGeminiImageRequestPayload({
    prompt: 'a poster',
    videos: [FILE_URL, { url: YOUTUBE_URL }],
    video: 'https://cdn.example.com/ignored.mp4',
  });

  assert.deepEqual(body.contents, [
    {
      parts: [{ text: 'a poster' }, { fileData: { fileUri: FILE_URL, mimeType: 'video/mp4' } }],
    },
  ]);
  assert.deepEqual(googleYouTubeImageInteractionRequest(MODEL, { prompt: 'a poster', videos: [FILE_URL, YOUTUBE_URL] }), {
    model: MODEL,
    input: [
      { type: 'video', uri: YOUTUBE_URL, mime_type: 'video/mp4' },
      { type: 'text', text: 'a poster' },
    ],
    response_format: { type: 'image' },
  });
});

test('reads the interaction output image and ignores thought images', () => {
  const images = collectInteractionOutputImages({
    id: 'v1_abc',
    status: 'completed',
    steps: [
      { type: 'thought', summary: [{ type: 'image', data: 'thought', mime_type: 'image/png' }] },
      { type: 'model_output', content: [{ type: 'image', data: 'final', mime_type: 'image/jpeg' }] },
    ],
    output_image: { type: 'image', data: 'poster', mime_type: 'image/png' },
  });
  assert.deepEqual(images, [{ base64: 'poster', mimeType: 'image/png' }]);
});
