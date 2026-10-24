import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGennyBotSystemPrompt, PROJECT_ASSETS_INVENTORY_RULES } from './agentUtils';

const prompt = buildGennyBotSystemPrompt({
  playgroundTools: [{ slug: 'FLUX_PRO', name: 'Flux Pro', description: 'Generate an image.' }],
  voiceTools: [{ slug: 'DESIGN_VOICE', name: 'Design voice', description: 'Design a voice.' }],
  projectTools: [{ slug: 'GET_PROJECT', name: 'Get project', description: 'Load a project.' }],
  fileTools: [{ slug: 'LIST_USER_FILES', name: 'List user files', description: 'List files.' }],
});

test('system prompt has no character toolkit', () => {
  assert.equal(prompt.includes('GENNY_BOT_CHARACTERS'), false);
  assert.equal(prompt.includes('CREATE_CHARACTER'), false);
  assert.equal(prompt.includes('LOCAL_GENNY_BOT_CHARACTERS'), false);
  assert.match(prompt, /no built-in character toolkit/i);
  assert.match(prompt, /playground/i);
});

test('system prompt describes tagged project files', () => {
  assert.match(prompt, /tagged with the project name/);
  assert.match(PROJECT_ASSETS_INVENTORY_RULES, /LIST_USER_FILES with project_id/);
  assert.match(PROJECT_ASSETS_INVENTORY_RULES, /LIST_GENERATIONS with project_id/);
  assert.match(prompt, /do not ask the user to tag/i);
  assert.match(prompt, /recap it in the Project Brief by voice_id/);
});
