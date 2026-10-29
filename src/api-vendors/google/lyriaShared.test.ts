import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isLyriaModel, isOmniModel } from './googleApiShared';
import { buildLyriaPayload, extractLyriaOutput, lyriaImageSources } from './lyriaShared';

const INTERACTIONS_SCHEMA = { api_path: '/interactions', request_type: 'interactions' };

test('lyria is not treated as omni even on /interactions', () => {
  assert.equal(isLyriaModel('lyria-3.5'), true);
  assert.equal(isLyriaModel('gemini-2.5-flash', 'audio'), true);
  assert.equal(isLyriaModel('veo-3.1', 'video'), false);
  assert.equal(isOmniModel('lyria-3.5', INTERACTIONS_SCHEMA), false);
  assert.equal(isOmniModel('gemini-3.1-flash', INTERACTIONS_SCHEMA), true);
  assert.equal(isOmniModel('veo-omni', {}), true);
});

test('text-only lyria payload is a prompt string', () => {
  const body = buildLyriaPayload({ prompt: 'A beautiful piano melody.' });
  assert.equal(body.model, 'lyria-3.5');
  assert.equal(body.input, 'A beautiful piano melody.');
  assert.equal(body.response_format, undefined);
});

test('appends lyrics, instrumental, and duration hint', () => {
  const body = buildLyriaPayload({
    prompt: 'Dreamy indie pop',
    lyrics: '[Verse]\nNeon glow',
    instrumental: true,
    duration: 2,
  });
  assert.equal(typeof body.input, 'string');
  const input = String(body.input);
  assert.match(input, /Dreamy indie pop/);
  assert.match(input, /following lyrics/);
  assert.match(input, /\[Verse\]/);
  assert.match(input, /Instrumental only, no vocals/);
  assert.match(input, /2-minute song/);
});

test('wav format sets audio response_format', () => {
  const body = buildLyriaPayload({ prompt: 'piano', format: 'wav' });
  assert.deepEqual(body.response_format, { type: 'audio' });
});

test('caps reference images at 10', () => {
  const images = Array.from({ length: 12 }, (_, i) => ({
    mime_type: 'image/jpeg',
    data: `img${i}`,
  }));
  const sources = lyriaImageSources({ images: images.map(image => `https://cdn.example.com/${image.data}.jpg`) });
  assert.equal(sources.length, 10);
  const body = buildLyriaPayload({ prompt: 'from these stills' }, { images });
  assert.ok(Array.isArray(body.input));
  const input = body.input as Array<Record<string, unknown>>;
  assert.equal(input[0].type, 'text');
  assert.equal(input.length, 11);
  assert.equal(input.filter(part => part.type === 'image').length, 10);
});

test('extracts output_audio and output_text', () => {
  const output = extractLyriaOutput({
    output_audio: { data: 'YWJj', mime_type: 'audio/mp3' },
    output_text: 'We are the echoes',
  });
  assert.deepEqual(output, {
    audioBase64: 'YWJj',
    mimeType: 'audio/mpeg',
    lyrics: 'We are the echoes',
  });
});

test('extracts interleaved steps audio and lyrics', () => {
  const output = extractLyriaOutput({
    interaction: {
      id: 'v1_abc',
      steps: [
        {
          type: 'model_output',
          content: [
            { type: 'text', text: '[Verse 1]' },
            { type: 'audio', data: 'c29uZw==', mime_type: 'audio/mpeg' },
            { type: 'text', text: '[Chorus]' },
          ],
        },
      ],
    },
  });
  assert.equal(output?.audioBase64, 'c29uZw==');
  assert.equal(output?.mimeType, 'audio/mpeg');
  assert.equal(output?.lyrics, '[Verse 1]\n[Chorus]');
});

test('returns null when no audio is present', () => {
  assert.equal(extractLyriaOutput({ output_text: 'structure only' }), null);
});
