import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAnnouncementTemplate,
  buildStateTemplate,
  parseAnnouncementEvent,
  parseNostrUrl,
  parseStateEvent,
} from '../src/lib/protocol.js';
import { mimeForPath } from '../src/lib/manifest.js';
import { normalizeRelayUrl, normalizePubkey } from '../src/lib/nostr.js';
import { sanitizeProjectName, validateProjectName } from '../src/lib/config.js';

test('parseNostrUrl accepts nostr://, ngit:// and plain paths', () => {
  const npub = 'npub1vnd9csl58a9rvngvndf0pmuww0cesrqu4wefkh80tx5ca6n4dfzshpfwv6';
  assert.deepEqual(parseNostrUrl(`${npub}/project`), {
    identity: npub,
    project: 'project',
  });
  assert.deepEqual(parseNostrUrl(`nostr://${npub}/project`), {
    identity: npub,
    project: 'project',
  });
  assert.deepEqual(parseNostrUrl(`ngit://${npub}/project/`), {
    identity: npub,
    project: 'project',
  });
});

test('parseNostrUrl rejects incomplete addresses', () => {
  assert.throws(() => parseNostrUrl('npub1noproject'), /format/i);
});

test('relay and pubkey normalization', () => {
  assert.equal(normalizeRelayUrl('relay.damus.io'), 'wss://relay.damus.io');
  assert.equal(normalizeRelayUrl('https://relay.damus.io/'), 'wss://relay.damus.io');
  assert.equal(
    normalizePubkey('64da5c43f43f4a364d0c9b52f0ef8e73f1980c1cabb29b5cef59a98eea756a45'),
    '64da5c43f43f4a364d0c9b52f0ef8e73f1980c1cabb29b5cef59a98eea756a45'
  );
});

test('state event keeps branch, commit and blobs', () => {
  const template = buildStateTemplate({
    project: 'demo',
    branch: 'main',
    commit: 'a'.repeat(40),
    manifest: {
      hash: 'b'.repeat(64),
      size: 123,
      server: 'https://blossom.primal.net',
      servers: ['https://blossom.primal.net'],
    },
    bundle: {
      hash: 'c'.repeat(64),
      size: 456,
      server: 'https://nostr.download',
    },
    blossomServers: ['https://blossom.primal.net', 'https://nostr.download'],
    createdAt: 1700000000,
  });
  const event = {
    ...template,
    id: 'd'.repeat(64),
    pubkey: 'e'.repeat(64),
    sig: 'f'.repeat(128),
  };
  const state = parseStateEvent(event);
  assert.equal(state.project, 'demo');
  assert.equal(state.branch, 'main');
  assert.equal(state.commit, 'a'.repeat(40));
  assert.equal(state.manifest.hash, 'b'.repeat(64));
  assert.equal(state.bundle.hash, 'c'.repeat(64));
  assert.equal(state.manifest.server, 'https://blossom.primal.net');
  assert.deepEqual(state.blossomServers, [
    'https://blossom.primal.net',
    'https://nostr.download',
  ]);
});

test('announcement event keeps name, description and servers', () => {
  const template = buildAnnouncementTemplate({
    project: 'demo',
    pubkey: 'e'.repeat(64),
    npub: 'npub1demo',
    description: 'Test project',
    relays: ['wss://relay.damus.io'],
    blossomServers: ['https://blossom.primal.net'],
    createdAt: 1700000001,
  });
  const announcement = parseAnnouncementEvent({
    ...template,
    id: 'd'.repeat(64),
    pubkey: 'e'.repeat(64),
    sig: 'f'.repeat(128),
  });
  assert.equal(announcement.project, 'demo');
  assert.equal(announcement.description, 'Test project');
  assert.deepEqual(announcement.relays, ['wss://relay.damus.io']);
  assert.deepEqual(announcement.blossomServers, ['https://blossom.primal.net']);
});

test('MIME recognizes dotfiles and common files', () => {
  assert.match(mimeForPath('.gitignore'), /^text\/plain/);
  assert.match(mimeForPath('README.md'), /^text\/markdown/);
  assert.match(mimeForPath('src/index.js'), /^text\/javascript/);
  assert.equal(mimeForPath('image.png'), 'image/png');
});

test('project names are sanitized and validated', () => {
  assert.equal(sanitizeProjectName('My Project!'), 'My-Project');
  assert.equal(validateProjectName('my-project_2.0'), 'my-project_2.0');
  assert.throws(() => validateProjectName('name/with/slash'), /invalid/i);
});
