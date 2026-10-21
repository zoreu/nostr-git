import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeText, isTextPath } from '../src/lib/manifest.js';

test('decodeText preserves accents in utf-8 files', () => {
  const source = 'ação, coração, tição — "detalhes é ênfase" 🚀\n';
  const buffer = Buffer.from(source, 'utf8');
  assert.equal(decodeText(buffer), source);
});

test('decodeText recovers accents from files saved as Windows-1252/Latin-1', () => {
  const buffer = Buffer.from('Ação, Computação, segredo', 'latin1');
  const decoded = decodeText(buffer);
  assert.equal(decoded, 'Ação, Computação, segredo');
  assert.doesNotMatch(decoded, /Ã|Â£/);
});

test('decodeText keeps invalid bytes readable without swallowing content', () => {
  const buffer = Buffer.from([0x70, 0xe9, 0x63, 0x61]); // 'péca' in latin1
  assert.equal(decodeText(buffer), 'péca');
});

test('isTextPath covers common text files', () => {
  assert.equal(isTextPath('src/app.js'), true);
  assert.equal(isTextPath('README.md'), true);
  assert.equal(isTextPath('file.txt'), true);
  assert.equal(isTextPath('logo.png'), false);
});
