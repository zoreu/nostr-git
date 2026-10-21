import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadBlob } from './blossom.js';
import { loadGlobalConfig } from './config.js';
import { decodeText, isTextPath, validateManifest } from './manifest.js';
import { normalizePubkey, pubkeyToNpub, queryEvents } from './nostr.js';
import {
  REPO_ANNOUNCEMENT_KIND,
  buildRepoUrl,
  fetchRepository,
  parseAnnouncementEvent,
} from './protocol.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '../../web');
const MANIFEST_LIMIT = 20 * 1024 * 1024;
const TEXT_PREVIEW_LIMIT = 2 * 1024 * 1024;
const README_LIMIT = 512 * 1024;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const STATIC_FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/assets/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/assets/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml'],
};

function sendJson(response, status, value) {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

function sendText(response, status, text) {
  const body = Buffer.from(text, 'utf8');
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
  });
  response.end(body);
}

function decodeSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, 'Invalid URL parameter.');
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function repoSummary(announcement, pubkeyHex) {
  const npub = pubkeyToNpub(pubkeyHex);
  return {
    npub,
    pubkey: pubkeyHex,
    project: announcement.project,
    name: announcement.name,
    description: announcement.description,
    updatedAt: announcement.createdAt * 1000,
    cloneUrl: buildRepoUrl(npub, announcement.project),
    blossomServers: announcement.blossomServers,
  };
}

export function createWebApp({ relays, blossomServers }) {
  const stateCache = new Map();
  const manifestCache = new Map();
  const blobCache = new Map();
  const STATE_TTL = 20_000;
  const BLOB_TTL = 5 * 60_000;

  function cachedBlob(hash, servers, expectedSize) {
    const key = `${hash}:${expectedSize || ''}`;
    const hit = blobCache.get(key);
    if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value);
    return downloadBlob(hash, { servers, expectedSize, timeoutMs: 60000 }).then((value) => {
      blobCache.set(key, { value, expires: Date.now() + BLOB_TTL });
      while (blobCache.size > 120) blobCache.delete(blobCache.keys().next().value);
      return value;
    });
  }

  async function loadManifest(state) {
    if (!state.manifest) throw new HttpError(404, 'This repository has no web manifest.');
    const cached = manifestCache.get(state.manifest.hash);
    if (cached && cached.expires > Date.now()) return cached.value;

    const servers = unique([
      state.manifest.server,
      ...state.blossomServers,
      ...blossomServers,
    ]);
    const downloaded = await cachedBlob(state.manifest.hash, servers, state.manifest.size);
    if (downloaded.buffer.length > MANIFEST_LIMIT) {
      throw new HttpError(502, 'Repository manifest is too large.');
    }
    let manifest;
    try {
      manifest = validateManifest(JSON.parse(downloaded.buffer.toString('utf8')));
    } catch (error) {
      throw new HttpError(502, `Invalid manifest: ${error.message}`);
    }
    manifestCache.set(state.manifest.hash, {
      value: manifest,
      expires: Date.now() + 60_000,
    });
    return manifest;
  }

  async function getRepository(identity, project) {
    let pubkeyHex;
    try {
      pubkeyHex = normalizePubkey(identity);
    } catch (error) {
      throw new HttpError(400, error.message);
    }

    const cacheKey = `${pubkeyHex}/${project}`;
    const cached = stateCache.get(cacheKey);
    let repository;
    if (cached && cached.expires > Date.now()) {
      repository = cached.value;
    } else {
      repository = await fetchRepository(relays, pubkeyHex, project, { timeoutMs: 9000 });
      stateCache.set(cacheKey, {
        value: repository,
        expires: Date.now() + STATE_TTL,
      });
      while (stateCache.size > 200) stateCache.delete(stateCache.keys().next().value);
    }

    if (!repository.state) {
      throw new HttpError(404, `Repository ${project} not found for this identity.`);
    }

    const manifest = await loadManifest(repository.state);
    const npub = pubkeyToNpub(pubkeyHex);
    const fileServers = unique([
      ...repository.state.blossomServers,
      repository.state.manifest?.server,
      ...(manifest.tree || []).flatMap((file) => file.servers || []),
      ...blossomServers,
    ]);

    return {
      repository,
      manifest,
      npub,
      pubkeyHex,
      fileServers,
    };
  }

  async function readFileEntry(data, filePath) {
    const entry = data.manifest.tree.find((file) => file.path === filePath);
    if (!entry) throw new HttpError(404, `File not found: ${filePath}`);
    const servers = unique([...(entry.servers || []), ...data.fileServers]);
    const downloaded = await cachedBlob(entry.sha256, servers, entry.size);
    return { entry, buffer: downloaded.buffer };
  }

  async function handleRepo(identity, project) {
    const data = await getRepository(identity, project);
    const { repository, manifest, npub, pubkeyHex, fileServers } = data;
    const state = repository.state;
    const announcement = repository.announcement;
    const description = announcement?.description || manifest.description || '';

    let readme = null;
    if (manifest.readmePath) {
      const entry = manifest.tree.find((file) => file.path === manifest.readmePath);
      if (entry && entry.size <= README_LIMIT && isTextPath(entry.path)) {
        try {
          const file = await readFileEntry(data, entry.path);
          readme = {
            path: entry.path,
            content: decodeText(file.buffer),
          };
        } catch {
          readme = null;
        }
      }
    }

    return {
      repo: {
        npub,
        pubkey: pubkeyHex,
        project,
        name: announcement?.name || manifest.project || project,
        description,
        cloneUrl: buildRepoUrl(npub, project),
        defaultBranch: state.branch || manifest.defaultBranch,
        latestCommit: state.commit || manifest.latestCommit,
        updatedAt: state.createdAt * 1000,
        stats: manifest.stats,
        readme,
        stateEventId: state.id,
      },
      manifest,
      state: {
        branch: state.branch,
        commit: state.commit,
        createdAt: state.createdAt,
        blossomServers: state.blossomServers,
        bundle: state.bundle,
      },
      fileServers,
      relays: repository.stateRelays,
    };
  }

  async function handleFile(identity, project, filePath) {
    const data = await getRepository(identity, project);
    const { entry, buffer } = await readFileEntry(data, filePath);
    const text = isTextPath(entry.path) && buffer.length <= TEXT_PREVIEW_LIMIT;
    return {
      path: entry.path,
      sha256: entry.sha256,
      size: entry.size,
      mime: entry.mime,
      text,
      content: text ? decodeText(buffer) : null,
      binary: !text,
      rawUrl: `/api/raw/${encodeURIComponent(data.npub)}/${encodeURIComponent(
        project
      )}?path=${encodeURIComponent(entry.path)}`,
    };
  }

  async function handleRaw(identity, project, filePath, response, download) {
    const data = await getRepository(identity, project);
    const { entry, buffer } = await readFileEntry(data, filePath);
    const disposition = download ? 'attachment' : 'inline';
    const safeName = entry.path.split('/').pop().replace(/["\\]/g, '_');
    const inlineText =
      !download && isTextPath(entry.path) && buffer.length <= TEXT_PREVIEW_LIMIT;
    const payload = inlineText ? Buffer.from(decodeText(buffer), 'utf8') : buffer;
    response.writeHead(200, {
      'Content-Type': entry.mime || 'application/octet-stream',
      'Content-Length': payload.length,
      'Content-Disposition': `${disposition}; filename="${safeName}"`,
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    response.end(payload);
  }

  async function collectRepos(filter, fetchLimit) {
    const result = await queryEvents(relays, { ...filter, limit: fetchLimit }, { timeoutMs: 8000 });
    const seen = new Map();
    for (const event of result.events) {
      const parsed = parseAnnouncementEvent(event);
      if (!parsed) continue;
      if (!parsed.blossomServers || parsed.blossomServers.length === 0) continue;
      const key = `${parsed.pubkey}/${parsed.project}`;
      const current = seen.get(key);
      if (!current || parsed.createdAt > current.createdAt) seen.set(key, parsed);
    }
    const entries = [...seen.values()].sort((a, b) => b.createdAt - a.createdAt);
    return { entries, relays: result.relays };
  }

  async function listRepos(filter, limit) {
    const { entries, relays: relayReports } = await collectRepos(filter, Math.max(limit * 4, 80));
    return {
      repos: entries.slice(0, limit).map((announcement) => repoSummary(announcement, announcement.pubkey)),
      relays: relayReports,
    };
  }

  async function searchRepos(query, limit) {
    if (!query) return { repos: [], relays: [], query };
    const { entries, relays: relayReports } = await collectRepos(
      { kinds: [REPO_ANNOUNCEMENT_KIND] },
      200
    );
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const repos = entries
      .filter((entry) => {
        const summary = repoSummary(entry, entry.pubkey);
        const haystack = [
          summary.name,
          summary.project,
          summary.description,
          summary.npub,
          entry.relays.join(' '),
        ]
          .join(' ')
          .toLowerCase();
        return tokens.every((token) => haystack.includes(token));
      })
      .slice(0, limit)
      .map((entry) => repoSummary(entry, entry.pubkey));
    return { repos, relays: relayReports, query };
  }

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://localhost');

    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        throw new HttpError(405, 'Method not allowed.');
      }

      const pathname = requestUrl.pathname;
      if (!pathname.startsWith('/api/')) {
        const staticEntry = STATIC_FILES[pathname];
        if (!staticEntry) throw new HttpError(404, 'Page not found.');
        const [file, type] = staticEntry;
        const body = await readFile(path.join(WEB_DIR, file));
        const headers = {
          'Content-Type': type,
          'Content-Length': body.length,
          'Cache-Control': file === 'index.html' ? 'no-cache' : 'public, max-age=60',
        };
        if (file === 'index.html') {
          headers['Content-Security-Policy'] =
            "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
        }
        response.writeHead(200, headers);
        response.end(request.method === 'HEAD' ? undefined : body);
        return;
      }

      const parts = pathname.split('/').filter(Boolean);
      const endpoint = parts[1];

      if (endpoint === 'health') {
        sendJson(response, 200, { ok: true, relays, blossomServers });
        return;
      }

      if (endpoint === 'me') {
        const config = loadGlobalConfig();
        sendJson(response, 200, {
          npub: config.npub || null,
          pubkey: config.pubkeyHex || null,
          relays: config.relays,
          blossomServers: config.blossomServers,
        });
        return;
      }

      if (endpoint === 'repos') {
        const identity = requestUrl.searchParams.get('author');
        const limit = Math.min(Number(requestUrl.searchParams.get('limit')) || 24, 60);
        if (!identity) throw new HttpError(400, 'The author parameter is required.');
        let pubkeyHex;
        try {
          pubkeyHex = normalizePubkey(identity);
        } catch (error) {
          throw new HttpError(400, error.message);
        }
        const result = await listRepos(
          {
            kinds: [REPO_ANNOUNCEMENT_KIND],
            authors: [pubkeyHex],
            limit,
          },
          limit
        );
        sendJson(response, 200, result);
        return;
      }

      if (endpoint === 'explore') {
        const limit = Math.min(Number(requestUrl.searchParams.get('limit')) || 30, 60);
        const result = await listRepos(
          {
            kinds: [REPO_ANNOUNCEMENT_KIND],
            limit,
          },
          limit
        );
        sendJson(response, 200, result);
        return;
      }

      if (endpoint === 'search') {
        const query = String(requestUrl.searchParams.get('q') || '').trim();
        const limit = Math.min(Number(requestUrl.searchParams.get('limit')) || 30, 60);
        const result = await searchRepos(query, limit);
        sendJson(response, 200, result);
        return;
      }

      if (endpoint === 'repo') {
        if (parts.length < 4) throw new HttpError(400, 'Provide identity and project.');
        const identity = decodeSegment(parts[2]);
        const project = decodeSegment(parts[3]);
        const result = await handleRepo(identity, project);
        sendJson(response, 200, result);
        return;
      }

      if (endpoint === 'file') {
        if (parts.length < 4) throw new HttpError(400, 'Provide identity and project.');
        const identity = decodeSegment(parts[2]);
        const project = decodeSegment(parts[3]);
        const filePath = requestUrl.searchParams.get('path');
        if (!filePath) throw new HttpError(400, 'The path parameter is required.');
        const result = await handleFile(identity, project, filePath);
        sendJson(response, 200, result);
        return;
      }

      if (endpoint === 'raw') {
        if (parts.length < 4) throw new HttpError(400, 'Provide identity and project.');
        const identity = decodeSegment(parts[2]);
        const project = decodeSegment(parts[3]);
        const filePath = requestUrl.searchParams.get('path');
        if (!filePath) throw new HttpError(400, 'The path parameter is required.');
        const download = requestUrl.searchParams.get('download') === '1';
        await handleRaw(identity, project, filePath, response, download);
        return;
      }

      throw new HttpError(404, 'Endpoint not found.');
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 502;
      if (!(error instanceof HttpError)) {
        console.error(`[ngit web] ${error.stack || error}`);
      }
      if (response.headersSent) {
        response.destroy();
        return;
      }
      if (requestUrl.pathname.startsWith('/api/')) {
        sendJson(response, status, { error: error.message || String(error) });
      } else {
        sendText(response, status, error.message || String(error));
      }
    }
  });

  return {
    server,
    listen({ host = '127.0.0.1', port = 3737 } = {}) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.removeListener('error', reject);
          resolve(server.address());
        });
      });
    },
  };
}
