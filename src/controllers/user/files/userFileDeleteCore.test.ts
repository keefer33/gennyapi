import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ziplineStorageKeyFromPublicUrl } from '../../zipline/ziplineUtils';
import { siblingDraftCacheFiles, ziplineStorageKeysForUserFileRow } from './userFileDeleteCore';

const ZIPLINE_BASE = 'https://file.genny.bot';

test('ziplineStorageKeyFromPublicUrl uses path segment from aifile URL', () => {
  assert.equal(ziplineStorageKeyFromPublicUrl('https://file.genny.bot/P73ndN.jpg', ZIPLINE_BASE), 'P73ndN.jpg');
});

test('display file_name rename does not change storage delete keys', () => {
  const keys = ziplineStorageKeysForUserFileRow(
    {
      file_path: 'https://file.genny.bot/P73ndN.jpg',
      thumbnail_url: 'https://file.genny.bot/rkfQHV.jpg',
    },
    ZIPLINE_BASE
  );

  assert.deepEqual(keys, {
    mainKey: 'P73ndN.jpg',
    thumbKey: 'rkfQHV.jpg',
  });

  // Simulated rename: file_name would be "turtle swimming" but is not consulted.
  const afterRename = ziplineStorageKeysForUserFileRow(
    {
      file_path: 'https://file.genny.bot/P73ndN.jpg',
      thumbnail_url: 'https://file.genny.bot/rkfQHV.jpg',
    },
    ZIPLINE_BASE
  );
  assert.deepEqual(afterRename, keys);
  assert.notEqual(afterRename.mainKey, 'turtle swimming');
});

test('thumbnail key omitted when same as main', () => {
  const keys = ziplineStorageKeysForUserFileRow(
    {
      file_path: 'https://file.genny.bot/same.jpg',
      thumbnail_url: 'https://file.genny.bot/same.jpg',
    },
    ZIPLINE_BASE
  );
  assert.equal(keys.mainKey, 'same.jpg');
  assert.equal(keys.thumbKey, null);
});

test('deleting a draft video collects sibling .bin caches only', () => {
  const video = {
    id: 'video-1',
    file_name: 'draft.mp4',
    file_path: 'https://file.genny.bot/draft.mp4',
    gen_model_run_id: 'run-1',
  };
  const cache = {
    id: 'bin-1',
    file_name: 'abc123.bin',
    file_path: 'https://file.genny.bot/abc123.bin',
    gen_model_run_id: 'run-1',
  };
  const otherVideo = {
    id: 'video-2',
    file_name: 'other.mp4',
    file_path: 'https://file.genny.bot/other.mp4',
    gen_model_run_id: 'run-1',
  };
  assert.deepEqual(siblingDraftCacheFiles(video, [video, cache, otherVideo]), [cache]);
  assert.deepEqual(siblingDraftCacheFiles(cache, [video, cache]), []);
  assert.deepEqual(siblingDraftCacheFiles(video, [video, otherVideo]), []);
});
