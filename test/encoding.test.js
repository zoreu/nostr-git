import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeText, isTextPath } from '../src/lib/manifest.js';

test('decodeText preserva acentos em arquivos utf-8', () => {
  const source = 'ação, coração, tição — "detalhes é ênfase" 🚀\n';
  const buffer = Buffer.from(source, 'utf8');
  assert.equal(decodeText(buffer), source);
});

test('decodeText recupera acentos de arquivos salvos em Windows-1252/Latin-1', () => {
  const buffer = Buffer.from('Ação, Computação, segredo', 'latin1');
  const decoded = decodeText(buffer);
  assert.equal(decoded, 'Ação, Computação, segredo');
  assert.doesNotMatch(decoded, /Ã|Â£/);
});

test('decodeText mantém bytes inválidos legíveis sem engolir conteúdo', () => {
  const buffer = Buffer.from([0x70, 0xe9, 0x63, 0x61]); // 'péca' em latin1
  assert.equal(decodeText(buffer), 'péca');
});

test('isTextPath cobre arquivos de texto comuns', () => {
  assert.equal(isTextPath('src/app.js'), true);
  assert.equal(isTextPath('README.md'), true);
  assert.equal(isTextPath('arquivo.txt'), true);
  assert.equal(isTextPath('logo.png'), false);
});
