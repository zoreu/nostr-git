import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decodeSecretKey } from './nostr.js';

export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
];

export const DEFAULT_BLOSSOM_SERVERS = [
  'https://blossom.primal.net',
  'https://blossom.band',
  'https://nostr.download',
];

export const CONFIG_VERSION = 1;
export const REPO_CONFIG_VERSION = 1;

export function configDir() {
  return process.env.NGIT_HOME
    ? path.resolve(process.env.NGIT_HOME)
    : path.join(os.homedir(), '.ngit');
}

export function configFile() {
  return process.env.NGIT_CONFIG
    ? path.resolve(process.env.NGIT_CONFIG)
    : path.join(configDir(), 'config.json');
}

function splitEnvList(value) {
  if (!value) return null;
  const parts = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : null;
}

function readJsonFile(file) {
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, 'utf8');
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

function writeJsonSecure(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, file);
  try {
    chmodSync(file, 0o600);
  } catch {
    // Windows does not implement POSIX permissions in the same way.
  }
}

export function loadGlobalConfig() {
  let stored = {};
  try {
    stored = readJsonFile(configFile()) || {};
  } catch (error) {
    throw new Error(`Could not read ${configFile()}: ${error.message}`);
  }

  let envIdentity = null;
  if (process.env.NGIT_NSEC) {
    try {
      envIdentity = decodeSecretKey(process.env.NGIT_NSEC);
    } catch (error) {
      throw new Error(`Invalid NGIT_NSEC: ${error.message}`);
    }
  }

  return {
    version: stored.version || CONFIG_VERSION,
    secretKeyHex: envIdentity?.secretKeyHex ?? stored.secretKeyHex ?? null,
    pubkeyHex: envIdentity?.pubkeyHex ?? stored.pubkeyHex ?? null,
    npub: envIdentity?.npub ?? stored.npub ?? null,
    relays: splitEnvList(process.env.NGIT_RELAYS) || stored.relays || [...DEFAULT_RELAYS],
    blossomServers:
      splitEnvList(process.env.NGIT_BLOSSOM_SERVERS) ||
      stored.blossomServers ||
      [...DEFAULT_BLOSSOM_SERVERS],
    createdAt: stored.createdAt || null,
  };
}

export function saveGlobalConfig(config) {
  const data = {
    version: CONFIG_VERSION,
    secretKeyHex: config.secretKeyHex,
    pubkeyHex: config.pubkeyHex,
    npub: config.npub,
    relays: config.relays,
    blossomServers: config.blossomServers,
    createdAt: config.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeJsonSecure(configFile(), data);
  return data;
}

export function requireLogin() {
  const config = loadGlobalConfig();
  if (!config.secretKeyHex || !config.pubkeyHex) {
    const error = new Error(
      'You are not logged in yet. Run "ngit login" to configure your Nostr identity.'
    );
    error.ngitHandled = true;
    throw error;
  }
  return config;
}

export function repoConfigFile(repoRoot) {
  return path.join(repoRoot, '.ngit', 'repo.json');
}

export function loadRepoConfig(repoRoot) {
  const file = repoConfigFile(repoRoot);
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, 'utf8');
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

export function saveRepoConfig(repoRoot, config) {
  const file = repoConfigFile(repoRoot);
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  const data = {
    version: REPO_CONFIG_VERSION,
    ...config,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(temp, file);
  return data;
}

export function ensureRepoConfig(repoRoot) {
  const existing = loadRepoConfig(repoRoot);
  if (existing) return existing;

  const project = sanitizeProjectName(path.basename(repoRoot));
  return saveRepoConfig(repoRoot, {
    version: REPO_CONFIG_VERSION,
    project,
    owner: null,
    ownerPubkey: null,
    defaultBranch: null,
    createdAt: new Date().toISOString(),
  });
}

export function sanitizeProjectName(value) {
  const cleaned = String(value || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return cleaned || 'repository';
}

export function validateProjectName(value) {
  if (!value || !/^[a-zA-Z0-9._-]{1,80}$/.test(value)) {
    throw new Error(
      'Invalid project name. Use letters, numbers, dot, hyphen or underscore (up to 80 characters).'
    );
  }
  return value;
}
