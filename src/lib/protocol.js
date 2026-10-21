import { makeClientTags, queryEvents } from './nostr.js';

export const REPO_ANNOUNCEMENT_KIND = 30617;
export const REPO_STATE_KIND = 30618;
export const NGIT_PROTOCOL = 'ngit/1';
export const MANIFEST_MIME = 'application/json';
export const BUNDLE_MIME = 'application/x-git-bundle';

export function tagsByName(tags = []) {
  const map = new Map();
  for (const tag of tags) {
    if (!Array.isArray(tag) || !tag[0]) continue;
    if (!map.has(tag[0])) map.set(tag[0], []);
    map.get(tag[0]).push(tag);
  }
  return map;
}

function firstTag(map, name) {
  return map.get(name)?.[0] || null;
}

function parseDescriptor(tag) {
  if (!tag) return null;
  const [, hash, server, size, mime] = tag;
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return null;
  return {
    hash: hash.toLowerCase(),
    server: server && /^https?:\/\//i.test(server) ? server.replace(/\/+$/, '') : null,
    size: size !== undefined && size !== '' && Number.isFinite(Number(size)) ? Number(size) : null,
    mime: mime || null,
  };
}

export function parseStateEvent(event) {
  if (!event || event.kind !== REPO_STATE_KIND) return null;
  const map = tagsByName(event.tags);
  const project = firstTag(map, 'd')?.[1] || null;
  if (!project) return null;

  let branch = firstTag(map, 'branch')?.[1] || null;
  const headTag = firstTag(map, 'HEAD')?.[1] || '';
  if (!branch && headTag.startsWith('ref: refs/heads/')) {
    branch = headTag.slice('ref: refs/heads/'.length);
  }

  const refs = {};
  for (const [name, entries] of map.entries()) {
    if (!name.startsWith('refs/heads/')) continue;
    refs[name.slice('refs/heads/'.length)] = entries[0]?.[1] || null;
  }

  if (!branch && Object.keys(refs).length > 0) branch = Object.keys(refs)[0];
  const commit =
    firstTag(map, 'commit')?.[1] || (branch && refs[branch]) || null;

  const blossomServers = [
    ...new Set(
      (map.get('blossom') || [])
        .map((tag) => tag[1])
        .filter((value) => value && /^https?:\/\//i.test(value))
        .map((value) => value.replace(/\/+$/, ''))
    ),
  ];

  const manifest = parseDescriptor(firstTag(map, 'manifest'));
  const bundle = parseDescriptor(firstTag(map, 'bundle'));

  return {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    project,
    branch,
    commit,
    refs,
    blossomServers,
    manifest,
    bundle,
    event,
  };
}

export function parseAnnouncementEvent(event) {
  if (!event || event.kind !== REPO_ANNOUNCEMENT_KIND) return null;
  const map = tagsByName(event.tags);
  const project = firstTag(map, 'd')?.[1] || null;
  if (!project) return null;

  return {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    project,
    name: firstTag(map, 'name')?.[1] || project,
    description: event.content || '',
    relays: [
      ...new Set(
        (map.get('relays') || []).flatMap((tag) => tag.slice(1)).filter(Boolean)
      ),
    ],
    blossomServers: [
      ...new Set(
        (map.get('blossom') || [])
          .map((tag) => tag[1])
          .filter((value) => value && /^https?:\/\//i.test(value))
          .map((value) => value.replace(/\/+$/, ''))
      ),
    ],
    maintainers: [
      ...new Set((map.get('maintainers') || []).map((tag) => tag[1]).filter(Boolean)),
    ],
    event,
  };
}

export function buildAnnouncementTemplate({
  project,
  pubkey,
  description,
  relays,
  blossomServers,
  npub,
  createdAt = Math.floor(Date.now() / 1000),
}) {
  const tags = makeClientTags([
    ['d', project],
    ['name', project],
    ['description', description || 'Decentralized Git repository via Nostr + Blossom'],
    ['clone', `nostr://${npub}/${project}`],
    ['relays', ...relays],
    ...blossomServers.map((server) => ['blossom', server]),
    ['maintainers', pubkey],
    ['t', 'ngit'],
    ['t', 'nostr-git'],
  ]);

  return {
    kind: REPO_ANNOUNCEMENT_KIND,
    created_at: createdAt,
    tags,
    content: description || 'Decentralized Git repository via Nostr + Blossom',
  };
}

export function buildStateTemplate({
  project,
  branch,
  commit,
  manifest,
  bundle,
  blossomServers,
  createdAt = Math.floor(Date.now() / 1000),
}) {
  const tags = makeClientTags([
    ['d', project],
    ['HEAD', `ref: refs/heads/${branch}`],
    [`refs/heads/${branch}`, commit],
    ['commit', commit],
    ['branch', branch],
    ...blossomServers.map((server) => ['blossom', server]),
    [
      'manifest',
      manifest.hash,
      manifest.server,
      String(manifest.size),
      MANIFEST_MIME,
    ],
    ['bundle', bundle.hash, bundle.server, String(bundle.size), BUNDLE_MIME],
    ['t', 'ngit'],
  ]);

  const content = JSON.stringify({
    protocol: NGIT_PROTOCOL,
    project,
    branch,
    commit,
    manifest: {
      hash: manifest.hash,
      size: manifest.size,
      servers: manifest.servers || [manifest.server].filter(Boolean),
    },
    bundle: {
      hash: bundle.hash,
      size: bundle.size,
      server: bundle.server,
    },
  });

  return {
    kind: REPO_STATE_KIND,
    created_at: createdAt,
    tags,
    content,
  };
}

export function pickLatest(events, { kind, pubkey, project } = {}) {
  let best = null;
  for (const event of events) {
    if (kind && event.kind !== kind) continue;
    if (pubkey && event.pubkey !== pubkey) continue;
    const map = tagsByName(event.tags);
    if (project && firstTag(map, 'd')?.[1] !== project) continue;
    if (!best || event.created_at > best.created_at) best = event;
  }
  return best;
}

export async function fetchRepository(relays, pubkeyHex, project, options = {}) {
  const filter = {
    kinds: [REPO_STATE_KIND],
    authors: [pubkeyHex],
    '#d': [project],
    limit: 5,
  };
  const announcementFilter = {
    kinds: [REPO_ANNOUNCEMENT_KIND],
    authors: [pubkeyHex],
    '#d': [project],
    limit: 5,
  };

  const [stateResult, announcementResult] = await Promise.all([
    queryEvents(relays, filter, options),
    queryEvents(relays, announcementFilter, options),
  ]);

  const stateEvent = pickLatest(stateResult.events, {
    kind: REPO_STATE_KIND,
    pubkey: pubkeyHex,
    project,
  });
  const announcementEvent = pickLatest(announcementResult.events, {
    kind: REPO_ANNOUNCEMENT_KIND,
    pubkey: pubkeyHex,
    project,
  });

  return {
    state: stateEvent ? parseStateEvent(stateEvent) : null,
    announcement: announcementEvent ? parseAnnouncementEvent(announcementEvent) : null,
    stateRelays: stateResult.relays,
    announcementRelays: announcementResult.relays,
  };
}

export function buildRepoUrl(npub, project) {
  return `nostr://${npub}/${project}`;
}

export function parseNostrUrl(value) {
  let raw = String(value || '').trim();
  if (raw.startsWith('ngit://')) raw = `nostr://${raw.slice('ngit://'.length)}`;
  if (raw.startsWith('nostr://')) raw = raw.slice('nostr://'.length);
  raw = raw.replace(/^\/+|\/+$/g, '');
  const slash = raw.indexOf('/');
  if (slash === -1) {
    throw new Error(
      'Invalid address. Use the format npub1.../project-folder (or nostr://npub1.../project-folder).'
    );
  }
  return {
    identity: raw.slice(0, slash),
    project: raw.slice(slash + 1).replace(/\/+$/, ''),
  };
}
