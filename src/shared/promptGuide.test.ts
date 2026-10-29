import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PLAYGROUND_LIST_SELECT,
  genModelSelectWithoutPromptGuide,
} from '../database/const';
import {
  effectivePromptGuide,
  isUuid,
  promptGuideSource,
  promptGuideToolResultFromModel,
  resolvePromptGuideLookup,
  truncatePromptGuide,
} from './promptGuide';

test('effectivePromptGuide prefers model over brand', () => {
  assert.equal(
    effectivePromptGuide({
      prompt_guide: '  model guide  ',
      brand_name: { prompt_guide: 'brand guide' },
    }),
    'model guide'
  );
});

test('effectivePromptGuide falls back to brand', () => {
  assert.equal(
    effectivePromptGuide({
      prompt_guide: '   ',
      brand_name: { name: 'Flux', prompt_guide: ' brand guide\n' },
    }),
    'brand guide'
  );
});

test('effectivePromptGuide is null when both empty', () => {
  assert.equal(effectivePromptGuide({ prompt_guide: null, brand_name: { prompt_guide: '' } }), null);
  assert.equal(effectivePromptGuide({ brand_name: 'Flux' }), null);
  assert.equal(effectivePromptGuide(null), null);
});

test('promptGuideSource reports model, brand, or none', () => {
  assert.equal(
    promptGuideSource({ prompt_guide: 'm', brand_name: { prompt_guide: 'b' } }),
    'model'
  );
  assert.equal(promptGuideSource({ brand_name: { prompt_guide: 'b' } }), 'brand');
  assert.equal(promptGuideSource({ brand_name: { name: 'Flux' } }), 'none');
});

test('promptGuideToolResultFromModel maps lookup by fields', () => {
  const uuid = '11111111-1111-4111-8111-111111111111';
  const found = promptGuideToolResultFromModel({
    id: uuid,
    model_id: 'google/lyria-3.5',
    model_name: 'Lyria 3.5',
    prompt_guide: null,
    brand_name: { name: 'Google', slug: 'google', prompt_guide: 'brand' },
  });
  assert.equal(found.success, true);
  assert.equal(found.gen_model_id, uuid);
  assert.equal(found.model_id, 'google/lyria-3.5');
  assert.equal(found.source, 'brand');
  assert.equal(found.prompt_guide, 'brand');

  const missing = promptGuideToolResultFromModel(null);
  assert.equal(missing.success, false);
  assert.equal(missing.source, 'none');
  assert.equal(missing.prompt_guide, null);
});

test('resolvePromptGuideLookup prefers UUID then model_id', () => {
  const uuid = '11111111-1111-4111-8111-111111111111';
  assert.deepEqual(resolvePromptGuideLookup({ gen_model_id: uuid, model_id: 'google/lyria-3.5' }), {
    kind: 'id',
    value: uuid,
  });
  assert.deepEqual(resolvePromptGuideLookup({ model_id: 'google/lyria-3.5' }), {
    kind: 'model_id',
    value: 'google/lyria-3.5',
  });
  assert.deepEqual(resolvePromptGuideLookup({}), { kind: 'missing' });
  assert.equal(isUuid(uuid), true);
  assert.equal(isUuid('google/lyria-3.5'), false);
});

test('genModelSelectWithoutPromptGuide drops prompt_guide columns', () => {
  const stripped = genModelSelectWithoutPromptGuide(PLAYGROUND_LIST_SELECT);
  assert.equal(stripped.includes('prompt_guide'), false);
  assert.match(stripped, /brand_name\(id, name, slug, logo\)/);
});

test('truncatePromptGuide caps long text', () => {
  const long = 'a'.repeat(20);
  assert.equal(truncatePromptGuide(long, 8), `${'a'.repeat(8)}\n\n[Guide truncated]`);
  assert.equal(truncatePromptGuide(' short ', 8), 'short');
  assert.equal(truncatePromptGuide('  '), null);
});
