import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ziplineStorageKeyFromPublicUrl } from '../../zipline/ziplineUtils';
import { ziplineStorageKeysForUserFileRow } from './userFileDeleteCore';

const ZIPLINE_BASE = 'https://aifile.link';

test('ziplineStorageKeyFromPublicUrl uses path segment from aifile URL', () => {
  assert.equal(
    ziplineStorageKeyFromPublicUrl('https://aifile.link/P73ndN.jpg', ZIPLINE_BASE),
    'P73ndN.jpg'
  );
});

test('display file_name rename does not change storage delete keys', () => {
  const keys = ziplineStorageKeysForUserFileRow(
    {
      file_path: 'https://aifile.link/P73ndN.jpg',
      thumbnail_url: 'https://aifile.link/rkfQHV.jpg',
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
      file_path: 'https://aifile.link/P73ndN.jpg',
      thumbnail_url: 'https://aifile.link/rkfQHV.jpg',
    },
    ZIPLINE_BASE
  );
  assert.deepEqual(afterRename, keys);
  assert.notEqual(afterRename.mainKey, 'turtle swimming');
});

test('thumbnail key omitted when same as main', () => {
  const keys = ziplineStorageKeysForUserFileRow(
    {
      file_path: 'https://aifile.link/same.jpg',
      thumbnail_url: 'https://aifile.link/same.jpg',
    },
    ZIPLINE_BASE
  );
  assert.equal(keys.mainKey, 'same.jpg');
  assert.equal(keys.thumbKey, null);
});
