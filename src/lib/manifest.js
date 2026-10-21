import path from 'node:path';
import { readBlob, readTree } from './git.js';
import { sha256 } from './blossom.js';

const MIME_BY_EXTENSION = {
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.scss': 'text/x-scss; charset=utf-8',
  '.sass': 'text/x-sass; charset=utf-8',
  '.less': 'text/x-less; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.jsx': 'text/jsx; charset=utf-8',
  '.ts': 'text/typescript; charset=utf-8',
  '.tsx': 'text/tsx; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jsonc': 'application/json; charset=utf-8',
  '.json5': 'application/json; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.toml': 'text/toml; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.tar': 'application/x-tar',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.py': 'text/x-python; charset=utf-8',
  '.rb': 'text/x-ruby; charset=utf-8',
  '.php': 'text/x-php; charset=utf-8',
  '.java': 'text/x-java; charset=utf-8',
  '.c': 'text/x-c; charset=utf-8',
  '.h': 'text/x-c; charset=utf-8',
  '.cpp': 'text/x-c++; charset=utf-8',
  '.hpp': 'text/x-c++; charset=utf-8',
  '.cs': 'text/x-csharp; charset=utf-8',
  '.go': 'text/x-go; charset=utf-8',
  '.rs': 'text/x-rust; charset=utf-8',
  '.swift': 'text/x-swift; charset=utf-8',
  '.kt': 'text/x-kotlin; charset=utf-8',
  '.sh': 'text/x-shellscript; charset=utf-8',
  '.bash': 'text/x-shellscript; charset=utf-8',
  '.zsh': 'text/x-shellscript; charset=utf-8',
  '.ps1': 'text/x-powershell; charset=utf-8',
  '.bat': 'text/x-batch; charset=utf-8',
  '.cmd': 'text/x-batch; charset=utf-8',
  '.sql': 'text/x-sql; charset=utf-8',
  '.dockerfile': 'text/plain; charset=utf-8',
  '.gitignore': 'text/plain; charset=utf-8',
  '.env': 'text/plain; charset=utf-8',
  '.lock': 'text/plain; charset=utf-8',
};

const TEXT_EXTENSIONS = new Set(Object.keys(MIME_BY_EXTENSION).filter((ext) => {
  const mime = MIME_BY_EXTENSION[ext];
  return mime.startsWith('text/') || mime.includes('json') || mime.includes('xml');
}));

export function mimeForPath(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (base === 'dockerfile') return 'text/plain; charset=utf-8';
  if (base === 'makefile') return 'text/plain; charset=utf-8';
  if (base === 'readme') return 'text/plain; charset=utf-8';
  if (base === 'license') return 'text/plain; charset=utf-8';
  if (base.startsWith('.') && !path.extname(base)) return 'text/plain; charset=utf-8';
  const extension = path.extname(base);
  return MIME_BY_EXTENSION[extension] || 'application/octet-stream';
}

export function isTextMime(mime) {
  return (
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('xml') ||
    mime.includes('javascript') ||
    mime.includes('yaml') ||
    mime.includes('toml') ||
    mime.includes('sql')
  );
}

export function isTextPath(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (['dockerfile', 'makefile', 'readme', 'license', '.gitignore', '.env'].includes(base)) {
    return true;
  }
  if (base.startsWith('.') && !path.extname(base)) return true;
  return TEXT_EXTENSIONS.has(path.extname(base));
}

const utf8Strict = new TextDecoder('utf-8', { fatal: true });
const windows1252 = new TextDecoder('windows-1252');

export function decodeText(buffer) {
  try {
    return utf8Strict.decode(buffer);
  } catch {
    return windows1252.decode(buffer);
  }
}

export async function collectSnapshot(root, ref = 'HEAD') {
  const tree = await readTree(root, ref);
  const files = [];

  for (const entry of tree) {
    const buffer = await readBlob(root, entry.oid);
    const mime = mimeForPath(entry.path);
    files.push({
      path: entry.path,
      mode: entry.mode,
      oid: entry.oid,
      size: buffer.length,
      sha256: sha256(buffer),
      mime,
      buffer,
    });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

export function findReadme(files) {
  const candidates = files.filter((file) => /^readme(\.[a-z0-9]+)?$/i.test(file.path));
  if (candidates.length === 0) return null;
  const preferred = ['readme.md', 'readme.markdown', 'readme.txt', 'readme'];
  candidates.sort((a, b) => {
    const aIndex = preferred.indexOf(a.path.toLowerCase());
    const bIndex = preferred.indexOf(b.path.toLowerCase());
    return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
  });
  return candidates[0];
}

export function buildManifest({
  project,
  npub,
  pubkey,
  branch,
  commit,
  commits,
  files,
  versions = [],
  description = '',
}) {
  const serializedFiles = files.map((file) => ({
    path: file.path,
    mode: file.mode,
    oid: file.oid,
    sha256: file.sha256,
    size: file.size,
    mime: file.mime,
    servers: file.servers || [file.server].filter(Boolean),
  }));

  const readme = findReadme(serializedFiles);

  return {
    version: 1,
    protocol: 'ngit/1',
    project,
    owner: npub,
    ownerPubkey: pubkey,
    description,
    defaultBranch: branch,
    latestCommit: commit,
    commits: commits.map((entry) => ({
      hash: entry.hash,
      short: entry.short,
      subject: entry.subject,
      authorName: entry.authorName,
      authorEmail: entry.authorEmail,
      date: entry.date,
      parents: entry.parents,
    })),
    versions: versions.map((entry) => ({
      name: entry.name,
      commit: entry.commit,
      createdAt: entry.createdAt,
    })),
    tree: serializedFiles,
    readmePath: readme?.path || null,
    stats: {
      files: serializedFiles.length,
      bytes: serializedFiles.reduce((total, file) => total + file.size, 0),
    },
    generatedAt: new Date().toISOString(),
  };
}

export function validateManifest(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid manifest.');
  if (value.version !== 1) throw new Error('Unsupported manifest version.');
  if (!Array.isArray(value.tree)) throw new Error('Manifest has no file tree.');
  return value;
}
