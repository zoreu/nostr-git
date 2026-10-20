import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadGlobalConfig } from '../src/lib/config.js';
import { generateIdentity } from '../src/lib/nostr.js';

function restoreEnv(name, previous) {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}

test('NGIT_NSEC fornece a identidade sem depender do config', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'ngit-config-test-'));
  const identity = generateIdentity();
  const previousHome = process.env.NGIT_HOME;
  const previousNsec = process.env.NGIT_NSEC;
  process.env.NGIT_HOME = home;
  process.env.NGIT_NSEC = identity.nsec;
  try {
    const config = loadGlobalConfig();
    assert.equal(config.npub, identity.npub);
    assert.equal(config.pubkeyHex, identity.pubkeyHex);
    assert.equal(config.secretKeyHex, identity.secretKeyHex);
    assert.equal(config.relays.length, 3);
  } finally {
    restoreEnv('NGIT_HOME', previousHome);
    restoreEnv('NGIT_NSEC', previousNsec);
    await rm(home, { recursive: true, force: true });
  }
});

test('NGIT_NSEC inválido gera erro claro', () => {
  const previousNsec = process.env.NGIT_NSEC;
  process.env.NGIT_NSEC = 'nsec-invalido';
  try {
    assert.throws(() => loadGlobalConfig(), /NGIT_NSEC inválido/i);
  } finally {
    restoreEnv('NGIT_NSEC', previousNsec);
  }
});
