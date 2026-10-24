import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  collectAssetPatchIds,
  collectProjectFileTagTargets,
  metadataWithProjectTag,
  projectTagIdFromMetadata,
} from './projectFileTags';

test('playground generate collects generation_id for tagging', () => {
  const targets = collectProjectFileTagTargets('LOCAL_GENNY_BOT_FLUX_PRO', {
    success: true,
    generation_id: 'gen-1',
  });
  assert.deepEqual(targets, { fileIds: [], generationIds: ['gen-1'] });
});

test('GET_GENERATION_STATUS collects generation_files ids and generation_id', () => {
  const targets = collectProjectFileTagTargets('LOCAL_GENNY_BOT_GET_GENERATION_STATUS', {
    success: true,
    generation_id: 'gen-1',
    generation_files: [
      { id: 'file-a', file_path: 'https://file.example/a.png' },
      { id: 'file-b', file_path: 'https://file.example/b.png' },
    ],
  });
  assert.deepEqual(targets?.fileIds, ['file-a', 'file-b']);
  assert.deepEqual(targets?.generationIds, ['gen-1']);
});

test('UPLOAD_FILE collects file_id from nested file', () => {
  const targets = collectProjectFileTagTargets('LOCAL_GENNY_BOT_FILES_UPLOAD_FILE', {
    success: true,
    file_id: 'file-up',
    file: { id: 'file-up', file_path: 'https://file.example/up.png' },
  });
  assert.deepEqual(targets?.fileIds, ['file-up']);
  assert.deepEqual(targets?.generationIds, []);
});

test('list/get/assist/voice tools do not produce tag targets', () => {
  assert.equal(
    collectProjectFileTagTargets('LOCAL_GENNY_BOT_FILES_LIST_USER_FILES', {
      success: true,
      files: [{ id: 'other' }],
    }),
    null
  );
  assert.equal(
    collectProjectFileTagTargets('LOCAL_GENNY_BOT_VOICES_DESIGN_VOICE', {
      success: true,
      voices: [{ voice_id: 'v-a' }],
    }),
    null
  );
  assert.equal(
    collectProjectFileTagTargets('LOCAL_GENNY_BOT_CHARACTERS_CREATE_CHARACTER', {
      success: true,
      generation_id: 'gen-skip',
    }),
    null
  );
  assert.equal(
    collectProjectFileTagTargets('LOCAL_GENNY_BOT_FLUX_PRO', {
      success: false,
      generation_id: 'gen-x',
    }),
    null
  );
});

test('collectAssetPatchIds reads files and generation_ids', () => {
  const targets = collectAssetPatchIds({
    files: [{ id: 'file-1' }, { file_id: 'file-2' }],
    generation_ids: ['gen-1', { generation_id: 'gen-2' }],
    generations: [{ generation_id: 'gen-1' }],
    characters: [{ character_id: 'char-1' }],
    voices: [{ voice_id: 'voice-1' }],
  });
  assert.deepEqual(targets.fileIds, ['file-1', 'file-2']);
  assert.deepEqual(targets.generationIds, ['gen-1', 'gen-2']);
});

test('metadataWithProjectTag stores project_tag_id and drops assets json', () => {
  const next = metadataWithProjectTag(
    { assets: { generations: [{ generation_id: 'g1' }] }, other: 'keep' },
    'tag-1'
  );
  assert.equal(next.project_tag_id, 'tag-1');
  assert.equal(next.other, 'keep');
  assert.equal('assets' in next, false);
  assert.equal(projectTagIdFromMetadata(next), 'tag-1');
});
