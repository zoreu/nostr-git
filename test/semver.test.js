import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bumpVersion,
  compareVersions,
  isVersionLabel,
  parseVersion,
  sortVersions,
  versionToString,
} from '../src/lib/semver.js';

test('parseVersion accepts with and without the v prefix', () => {
  assert.deepEqual(parseVersion('v1.2.3'), { major: 1, minor: 2, patch: 3 });
  assert.deepEqual(parseVersion('1.2.3'), { major: 1, minor: 2, patch: 3 });
  assert.deepEqual(parseVersion('v0.0.1'), { major: 0, minor: 0, patch: 1 });
  assert.equal(parseVersion('1.2'), null);
  assert.equal(parseVersion('abc'), null);
  assert.equal(parseVersion(''), null);
  assert.equal(parseVersion(null), null);
});

test('isVersionLabel detects valid and invalid labels', () => {
  assert.equal(isVersionLabel('v1.2.3'), true);
  assert.equal(isVersionLabel('2.0.0'), true);
  assert.equal(isVersionLabel('v1.2.3.4'), false);
  assert.equal(isVersionLabel('latest'), false);
});

test('versionToString normalizes the label with the v prefix and validates it', () => {
  assert.equal(versionToString('1.2.3'), 'v1.2.3');
  assert.equal(versionToString('v01.02.03'), 'v1.2.3');
  assert.equal(versionToString(parseVersion('9.10.11')), 'v9.10.11');
  assert.equal(versionToString('not-a-version'), null);
});

test('compareVersions sorts correctly by SemVer criteria', () => {
  assert.equal(compareVersions('v1.2.3', 'v1.2.3'), 0);
  assert.equal(compareVersions('v1.2.4', 'v1.2.3'), 1);
  assert.equal(compareVersions('v1.2.3', 'v1.3.0'), -1);
  assert.equal(compareVersions('v2.0.0', 'v1.9.99'), 1);
  assert.equal(compareVersions('v10.0.0', 'v9.0.0'), 1);
});

test('sortVersions sorts from newest to oldest', () => {
  const sorted = sortVersions([
    { name: 'v0.1.0', createdAt: '2026-01-01' },
    { name: 'v1.1.0', createdAt: '2026-02-01' },
    { name: 'v1.0.5', createdAt: '2026-03-01' },
    { name: 'v1.0.0', createdAt: '2026-02-28' },
  ]);
  assert.deepEqual(
    sorted.map((item) => item.name),
    ['v1.1.0', 'v1.0.5', 'v1.0.0', 'v0.1.0']
  );
});

test('bumpVersion increments major, minor and patch', () => {
  assert.deepEqual(bumpVersion('v1.2.3'), { major: 1, minor: 2, patch: 4 });
  assert.deepEqual(bumpVersion('v1.2.3', 'patch'), { major: 1, minor: 2, patch: 4 });
  assert.deepEqual(bumpVersion('v1.2.3', 'minor'), { major: 1, minor: 3, patch: 0 });
  assert.deepEqual(bumpVersion('v1.2.3', 'major'), { major: 2, minor: 0, patch: 0 });
});
