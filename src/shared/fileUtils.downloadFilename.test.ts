import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filenameForDownloadedFile, sniffImageExtension } from './fileUtils';

const RECRAFT_URL =
  'https://img.recraft.ai/LilqLuk6Ws7LOuZXZBujI71U8rIrCTx_6B_ata6t02I/rs:fit:1024:1024:0/raw:1/plain/abs://external/images/6d439e01-7935-423c-8346-2a3995aaa392';

function webpBuffer(): Buffer {
  const buf = Buffer.alloc(16);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(8, 4);
  buf.write('WEBP', 8);
  return buf;
}

test('adds an extension from Content-Type when the Recraft URL has none', () => {
  assert.equal(
    filenameForDownloadedFile(RECRAFT_URL, 'image/webp'),
    '6d439e01-7935-423c-8346-2a3995aaa392.webp'
  );
  assert.equal(
    filenameForDownloadedFile(RECRAFT_URL, 'image/svg+xml; charset=utf-8'),
    '6d439e01-7935-423c-8346-2a3995aaa392.svg'
  );
});

test('sniffs webp and svg when Content-Type is octet-stream', () => {
  assert.equal(sniffImageExtension(webpBuffer()), 'webp');
  assert.equal(
    filenameForDownloadedFile(RECRAFT_URL, 'application/octet-stream', webpBuffer()),
    '6d439e01-7935-423c-8346-2a3995aaa392.webp'
  );
  assert.equal(
    filenameForDownloadedFile(RECRAFT_URL, 'application/octet-stream', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
    '6d439e01-7935-423c-8346-2a3995aaa392.svg'
  );
});

test('keeps an existing URL extension', () => {
  assert.equal(
    filenameForDownloadedFile('https://cdn.example.com/output/photo.png?token=abc', 'image/webp'),
    'photo.png'
  );
});

test('keeps a .bin name for BFL draft_cache URLs', () => {
  assert.equal(
    filenameForDownloadedFile('https://delivery.bfl.ai/v1/draft_cache/abc123', 'application/octet-stream'),
    'abc123.bin'
  );
  assert.equal(
    filenameForDownloadedFile('https://delivery.bfl.ai/files/cache.bin?token=abc', 'application/octet-stream'),
    'cache.bin'
  );
});
