import { createHash } from 'node:crypto';
import { DEFAULT_BLOSSOM_SERVERS } from './config.js';
import { signEvent } from './nostr.js';

export const BLOSSOM_AUTH_KIND = 24242;

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function normalizeServerList(servers = []) {
  const values = [...(servers || []), ...DEFAULT_BLOSSOM_SERVERS];
  const allowLocal = process.env.NGIT_ALLOW_LOCAL_BLOSSOM === '1';
  const result = [];
  for (const server of values) {
    if (!server) continue;
    try {
      const url = new URL(String(server));
      if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
      if (!allowLocal) {
        if (url.protocol !== 'https:') continue;
        if (isPrivateHost(url.hostname)) continue;
      }
      const normalized = url.toString().replace(/\/+$/, '');
      if (!result.includes(normalized)) result.push(normalized);
    } catch {
      // Ignore invalid servers.
    }
  }
  return result;
}

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '::1' || host === '0.0.0.0') return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}

export function blobUrl(server, hash) {
  return `${server.replace(/\/+$/, '')}/${hash}`;
}

function uploadAuthorization(secretKeyHex, hash, size, action = 'upload') {
  const now = Math.floor(Date.now() / 1000);
  const event = signEvent(secretKeyHex, {
    kind: BLOSSOM_AUTH_KIND,
    created_at: now,
    tags: [
      ['t', action],
      ['x', hash],
      ['size', String(size)],
      ['expiration', String(now + 600)],
    ],
    content: action === 'upload' ? 'Upload blob' : action,
  });
  return `Nostr ${Buffer.from(JSON.stringify(event), 'utf8').toString('base64')}`;
}

async function headBlob(server, hash, timeoutMs) {
  try {
    const response = await fetch(blobUrl(server, hash), {
      method: 'HEAD',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return false;
    const length = response.headers.get('content-length');
    return length === null || Number(length) > 0;
  } catch {
    return false;
  }
}

async function uploadToServer(server, buffer, hash, size, secretKeyHex, timeoutMs) {
  const response = await fetch(`${server}/upload`, {
    method: 'PUT',
    headers: {
      Authorization: uploadAuthorization(secretKeyHex, hash, size),
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(size),
      'X-SHA-256': hash,
      'X-Content-Length': String(size),
    },
    body: buffer,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text().catch(() => '');
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (response.ok) return { data };
  if (response.status === 409) return { data, alreadyExists: true };

  const message =
    data?.message || data?.error || text.trim().slice(0, 400) || `HTTP ${response.status}`;
  throw new Error(message);
}

export async function uploadBlob(
  buffer,
  {
    secretKeyHex,
    servers = DEFAULT_BLOSSOM_SERVERS,
    contentType = 'application/octet-stream',
    timeoutMs = 120000,
    reuse = true,
  }
) {
  if (!secretKeyHex) throw new Error('Login necessário para enviar arquivos ao Blossom.');
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const hash = sha256(data);
  const size = data.length;
  const candidates = normalizeServerList(servers);
  const errors = [];

  if (reuse) {
    const checks = await Promise.all(
      candidates.map(async (server) => ({
        server,
        exists: await headBlob(server, hash, Math.min(timeoutMs, 12000)),
      }))
    );
    const existing = checks.find((item) => item.exists);
    if (existing) {
      return {
        hash,
        size,
        server: existing.server,
        url: blobUrl(existing.server, hash),
        contentType,
        existing: true,
      };
    }
  }

  for (const server of candidates) {
    try {
      const result = await uploadToServer(
        server,
        data,
        hash,
        size,
        secretKeyHex,
        timeoutMs
      );
      return {
        hash,
        size,
        server,
        url: result.data?.url || blobUrl(server, hash),
        contentType: result.data?.type || contentType,
        existing: Boolean(result.alreadyExists),
      };
    } catch (error) {
      errors.push(`${server}: ${error.message}`);
    }
  }

  throw new Error(
    `Não foi possível enviar o blob para nenhum servidor Blossom.\n${errors
      .map((line) => `  - ${line}`)
      .join('\n')}`
  );
}

export async function downloadBlob(
  hash,
  { servers = DEFAULT_BLOSSOM_SERVERS, timeoutMs = 120000, expectedSize = null } = {}
) {
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) {
    throw new Error('Hash de blob inválido.');
  }
  const normalizedHash = hash.toLowerCase();
  const candidates = normalizeServerList(servers);
  const errors = [];

  for (const server of candidates) {
    try {
      const response = await fetch(blobUrl(server, normalizedHash), {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        errors.push(`${server}: HTTP ${response.status}`);
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const actual = sha256(buffer);
      if (actual !== normalizedHash) {
        errors.push(`${server}: hash não confere`);
        continue;
      }
      if (expectedSize !== null && buffer.length !== expectedSize) {
        errors.push(`${server}: tamanho não confere`);
        continue;
      }
      return { buffer, server, hash: normalizedHash };
    } catch (error) {
      errors.push(`${server}: ${error?.message || error}`);
    }
  }

  throw new Error(
    `Blob ${normalizedHash.slice(0, 12)}... não encontrado no Blossom.\n${errors
      .map((line) => `  - ${line}`)
      .join('\n')}`
  );
}
