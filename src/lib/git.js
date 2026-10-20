import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

function spawnCapture(command, args, { cwd, input, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...env },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const stdout = [];
    const stderr = [];

    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      });
    });

    if (input !== undefined && input !== null) {
      child.stdin.end(input);
    } else {
      child.stdin.end();
    }
  });
}

export async function runGit(args, options = {}) {
  return spawnCapture('git', args, options);
}

export async function runGitText(args, options = {}) {
  const result = await runGit(args, options);
  if (result.code !== 0) {
    const message = result.stderr.toString('utf8').trim() || `git ${args.join(' ')} falhou`;
    throw new Error(message);
  }
  return result.stdout.toString('utf8').trim();
}

export async function runGitBuffer(args, options = {}) {
  const result = await runGit(args, options);
  if (result.code !== 0) {
    const message = result.stderr.toString('utf8').trim() || `git ${args.join(' ')} falhou`;
    throw new Error(message);
  }
  return result.stdout;
}

export function runGitInteractive(args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      stdio: 'inherit',
      windowsHide: false,
    });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

export async function ensureGitInstalled() {
  try {
    await runGit(['--version']);
  } catch {
    throw new Error(
      'Git não encontrado. Instale o Git (https://git-scm.com) e tente novamente.'
    );
  }
}

export async function findRepoRoot(cwd = process.cwd()) {
  try {
    const root = await runGitText(['rev-parse', '--show-toplevel'], { cwd });
    return path.resolve(root);
  } catch {
    return null;
  }
}

export async function requireRepoRoot(cwd = process.cwd()) {
  const root = await findRepoRoot(cwd);
  if (!root) {
    const error = new Error(
      'Este diretório não é um repositório ngit. Rode "ngit init" primeiro.'
    );
    error.ngitHandled = true;
    throw error;
  }
  return root;
}

export async function hasCommits(root) {
  const result = await runGit(['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: root });
  return result.code === 0;
}

export async function headCommit(root) {
  return runGitText(['rev-parse', 'HEAD'], { cwd: root });
}

export async function currentBranch(root) {
  const result = await runGit(['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: root });
  if (result.code !== 0) {
    throw new Error('HEAD destacado (detached). Faça checkout de uma branch antes de enviar.');
  }
  return result.stdout.toString('utf8').trim();
}

export async function listBranches(root) {
  const output = await runGitText(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], {
    cwd: root,
  });
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

export async function readTree(root, ref = 'HEAD') {
  const raw = await runGitBuffer(['ls-tree', '-r', '-l', '-z', ref], { cwd: root });
  const entries = [];
  for (const item of raw.toString('utf8').split('\0')) {
    if (!item) continue;
    const match = /^(\d{6}) ([a-z]+) ([0-9a-f]{40,64})\s+(\d+|-)\t([\s\S]*)$/.exec(item);
    if (!match) continue;
    const [, mode, type, oid, size, filePath] = match;
    if (type !== 'blob') continue;
    entries.push({
      mode,
      type,
      oid,
      size: size === '-' ? null : Number(size),
      path: filePath,
    });
  }
  return entries;
}

export async function readBlob(root, oid) {
  return runGitBuffer(['cat-file', 'blob', oid], { cwd: root });
}

export async function readLog(root, ref = 'HEAD', limit = 200) {
  const format = '%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%s%x1e';
  const raw = await runGitText(
    ['log', `--max-count=${limit}`, `--format=${format}`, ref],
    { cwd: root }
  );
  if (!raw) return [];
  return raw
    .split('\x1e')
    .map((record) => record.replace(/^\r?\n/, ''))
    .filter(Boolean)
    .map((record) => {
      const [hash, short, authorName, authorEmail, date, parents, ...subjectParts] =
        record.split('\x1f');
      return {
        hash,
        short,
        authorName,
        authorEmail,
        date,
        parents: parents ? parents.split(' ').filter(Boolean) : [],
        subject: subjectParts.join('\x1f'),
      };
    });
}

export async function listTags(root) {
  const raw = await runGitText(
    [
      'for-each-ref',
      'refs/tags',
      '--format=%(refname:short)%01%(*objectname)%01%(objectname)%01%(creatordate:iso-strict)%01%(contents:subject)',
    ],
    { cwd: root }
  );
  if (!raw) return [];
  return raw.split(/\r?\n/).filter(Boolean).map((line) => {
    const [name, peeled, tagObject, createdAt, message] = line.split('\x01');
    return {
      name,
      commit: (peeled || tagObject || '').toLowerCase() || null,
      createdAt: createdAt && createdAt !== '' ? createdAt : null,
      message: message || '',
    };
  });
}

export async function resolveCommit(root, ref) {
  const raw = String(ref || '').trim();
  if (!raw) return null;
  const result = await runGit(['rev-parse', '--verify', '--quiet', `${raw}^{commit}`], {
    cwd: root,
  });
  return result.code === 0 ? result.stdout.toString('utf8').trim().toLowerCase() : null;
}

export async function isDetachedHead(root) {
  const result = await runGit(['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: root });
  return result.code !== 0;
}

export async function checkoutRef(root, ref, { newBranch = null, force = false } = {}) {
  const args = ['checkout'];
  if (force) args.push('-f');
  if (newBranch) args.push('-b', newBranch);
  args.push(ref);
  return runGitInteractive(args, { cwd: root });
}

export async function createBundle(root, file) {
  const result = await runGit(['bundle', 'create', file, '--all'], { cwd: root });
  if (result.code !== 0) {
    throw new Error(result.stderr.toString('utf8').trim() || 'Falha ao criar o bundle Git.');
  }
}

export async function cloneBundle(file, target, cwd = process.cwd()) {
  return runGitInteractive(['clone', '--', file, target], { cwd });
}

export async function setNostrRemote(root, url, { replaceOrigin = false } = {}) {
  const origin = await runGit(['remote', 'get-url', 'origin'], { cwd: root });
  const originUrl = origin.code === 0 ? origin.stdout.toString('utf8').trim() : null;

  if (replaceOrigin || originUrl === null || originUrl.startsWith('nostr://')) {
    if (originUrl === null) {
      await runGit(['remote', 'add', 'origin', url], { cwd: root });
    } else {
      await runGit(['remote', 'set-url', 'origin', url], { cwd: root });
    }
    return 'origin';
  }

  const nostrRemote = await runGit(['remote', 'get-url', 'nostr'], { cwd: root });
  if (nostrRemote.code === 0) {
    await runGit(['remote', 'set-url', 'nostr', url], { cwd: root });
  } else {
    await runGit(['remote', 'add', 'nostr', url], { cwd: root });
  }
  return 'nostr';
}

export async function statusPorcelain(root) {
  return runGitText(['status', '--porcelain'], { cwd: root });
}

export async function countCommits(root) {
  try {
    return Number(await runGitText(['rev-list', '--count', 'HEAD'], { cwd: root }));
  } catch {
    return 0;
  }
}

export function ensureNgitExcluded(root) {
  const gitDir = path.join(root, '.git');
  if (!existsSync(gitDir)) return;
  const infoDir = path.join(gitDir, 'info');
  const excludeFile = path.join(infoDir, 'exclude');
  mkdirSync(infoDir, { recursive: true });
  let current = '';
  try {
    current = readFileSync(excludeFile, 'utf8');
  } catch {
    current = '';
  }
  const lines = current.split(/\r?\n/).map((line) => line.trim());
  if (!lines.includes('.ngit/')) {
    const prefix = current && !current.endsWith('\n') ? '\n' : '';
    appendFileSync(excludeFile, `${prefix}.ngit/\n`);
  }
}
