import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildAlibabaImagePayload,
  calculateQwenImageRunCost,
} from './alibabaImagePayload';

test('text-to-image sends prompt text with no image parts', () => {
  const body = buildAlibabaImagePayload(
    {
      prompt: 'a newspaper front page',
      n: 1,
      size: '1024*1024',
      prompt_extend: true,
      enable_thinking: true,
    },
    'qwen-image-3.0'
  );
  assert.equal(body.model, 'qwen-image-3.0');
  assert.deepEqual(body.input, {
    messages: [{ role: 'user', content: [{ text: 'a newspaper front page' }] }],
  });
  assert.deepEqual(body.parameters, {
    n: 1,
    size: '1024*1024',
    prompt_extend: true,
    enable_thinking: true,
  });
});

test('uses payload model over the vendor default', () => {
  const body = buildAlibabaImagePayload({ prompt: 'fox', model: 'qwen-image-3.0-pro' }, 'qwen-image-3.0');
  assert.equal(body.model, 'qwen-image-3.0-pro');
});

test('maps reference images before the prompt text', () => {
  const body = buildAlibabaImagePayload(
    {
      prompt: 'put her in a blazer',
      images: ['https://cdn.example.com/a.png', { url: 'https://cdn.example.com/b.webp' }],
      n: 2,
    },
    'qwen-image-3.0'
  );
  assert.deepEqual((body.input as { messages: { content: unknown }[] }).messages[0]?.content, [
    { image: 'https://cdn.example.com/a.png' },
    { image: 'https://cdn.example.com/b.webp' },
    { text: 'put her in a blazer' },
  ]);
  assert.equal((body.parameters as { n?: unknown }).n, 2);
});

test('keeps boolean prompt_extend in parameters', () => {
  const body = buildAlibabaImagePayload(
    { prompt: 'poster', prompt_extend: false, enable_thinking: false, watermark: true },
    'qwen-image-3.0'
  );
  assert.deepEqual(body.parameters, {
    prompt_extend: false,
    enable_thinking: false,
    watermark: true,
  });
});

test('normalizes size x separator to DashScope asterisk', () => {
  const body = buildAlibabaImagePayload({ prompt: 'cat', size: '1024x768' }, 'qwen-image-3.0');
  assert.equal((body.parameters as { size?: unknown }).size, '1024*768');
});

test('qwen image cost uses n, 1K/2K pro tiers, and reference fee', () => {
  assert.equal(calculateQwenImageRunCost({ n: 2 }, 'qwen-image-3.0'), 0.06);
  assert.equal(calculateQwenImageRunCost({ model: 'qwen-image-3.0-pro', size: '1024*1024' }, 'qwen-image-3.0'), 0.04);
  assert.equal(calculateQwenImageRunCost({ model: 'qwen-image-3.0-pro', size: '1500*1500' }, 'qwen-image-3.0'), 0.04);
  assert.equal(calculateQwenImageRunCost({ model: 'qwen-image-3.0-pro', size: '2048*2048' }, 'qwen-image-3.0'), 0.075);
  assert.equal(calculateQwenImageRunCost({ size: '2048*2048' }, 'qwen-image-3.0'), 0.03);
  assert.equal(
    calculateQwenImageRunCost({ images: ['https://cdn.example.com/a.png'] }, 'qwen-image-3.0'),
    0.033
  );
});

test('caps reference images at three and keeps booleans in parameters', () => {
  const body = buildAlibabaImagePayload(
    {
      prompt: 'collage',
      images: [
        'https://cdn.example.com/1.png',
        'https://cdn.example.com/2.png',
        'https://cdn.example.com/3.png',
        'https://cdn.example.com/4.png',
      ],
      prompt_extend: false,
      n: '2',
    },
    'qwen-image-3.0'
  );
  assert.deepEqual((body.input as { messages: { content: unknown[] }[] }).messages[0]?.content, [
    { image: 'https://cdn.example.com/1.png' },
    { image: 'https://cdn.example.com/2.png' },
    { image: 'https://cdn.example.com/3.png' },
    { text: 'collage' },
  ]);
  assert.equal((body.parameters as { n?: unknown }).n, 2);
  assert.equal((body.parameters as { prompt_extend?: unknown }).prompt_extend, false);
});
