import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { headCommit, isDetachedHead, listTags, resolveCommit, runGit, runGitText } from '../src/lib/git.js';
import { isVersionLabel, sortVersions } from '../src/lib/semver.js';

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'ngit-test',
  GIT_AUTHOR_EMAIL: 'ngit-test@example.com',
  GIT_COMMITTER_NAME: 'ngit-test',
  GIT_COMMITTER_EMAIL: 'ngit-test@example.com',
};

async function makeTempRepo() {
  return mkdtemp(path.join(os.tmpdir(), 'ngit-version-test-'));
}

test('listTags/resolveCommit read annotated tags and resolve commits', async () => {
  const root = await makeTempRepo();

  try {
    await runGitText(['init', '-b', 'main'], { cwd: root, env: GIT_ENV });

    await writeFile(path.join(root, 'file.txt'), 'first version\n', 'utf8');
    await runGitText(['add', '.'], { cwd: root, env: GIT_ENV });

    let commitProcess = await runGit(['commit', '-m', 'first commit'], { cwd: root, env: GIT_ENV });
    assert.equal(commitProcess.code, 0);

    const commitA = await headCommit(root);
    await runGitText(['tag', '-a', 'v1.0.0', '-m', 'initial version'], { cwd: root, env: GIT_ENV });

    await writeFile(path.join(root, 'file.txt'), 'second version\n', 'utf8');
    await runGitText(['add', '.'], { cwd: root, env: GIT_ENV });
    commitProcess = await runGit(['commit', '-m', 'version bump'], { cwd: root, env: GIT_ENV });
    assert.equal(commitProcess.code, 0);

    const commitB = await headCommit(root);
    await runGitText(['tag', '-a', 'v2.1.0', '-m', 'new version'], { cwd: root, env: GIT_ENV });

    const tags = (await listTags(root)).filter((tag) => isVersionLabel(tag.name));
    assert.deepEqual(
      sortVersions(tags).map((tag) => tag.name),
      ['v2.1.0', 'v1.0.0']
    );

    assert.equal(sortVersions(tags)[1].commit, commitA);
    assert.equal(sortVersions(tags)[0].commit, commitB);
    assert.match(sortVersions(tags)[1].message, /initial version/);

    assert.equal(await resolveCommit(root, 'v1.0.0'), commitA);
    assert.equal(await resolveCommit(root, '1.0.0'), null);
    assert.equal(await resolveCommit(root, commitB.slice(0, 7)), commitB);
    assert.equal(await resolveCommit(root, 'v9.9.9'), null);
    assert.equal(await resolveCommit(root, ''), null);

    assert.equal(await isDetachedHead(root), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
