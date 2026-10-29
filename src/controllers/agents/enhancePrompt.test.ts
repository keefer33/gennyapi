import assert from 'node:assert/strict';
import { test } from 'node:test';
import { composeEnhancePromptSystemPrompt } from './enhancePrompt';

test('enhance system prompt injects a prompting guide when present', () => {
  const withGuide = composeEnhancePromptSystemPrompt({
    generationType: 'audio',
    lengthInstruction: ' Output only the prompt text.',
    promptGuide: 'Write a full song, not a video shot list.',
  });
  assert.match(withGuide, /expert prompt engineer for AI audio/);
  assert.match(withGuide, /Follow this model's prompting guide/);
  assert.match(withGuide, /Write a full song, not a video shot list/);
});

test('enhance system prompt stays generic when no guide', () => {
  const noGuide = composeEnhancePromptSystemPrompt({
    generationType: 'image',
    lengthInstruction: ' Output only the prompt text.',
  });
  assert.match(noGuide, /expert prompt engineer for AI image/);
  assert.equal(noGuide.includes('prompting guide'), false);
});
