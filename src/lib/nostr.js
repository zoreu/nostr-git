import { randomBytes } from 'node:crypto';
import WebSocket from 'ws';
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip19,
  verifyEvent,
} from 'nostr-tools';

export const RELAY_TIMEOUT_MS = 7000;

export function normalizeRelayUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Empty relay.');
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) return raw.replace(/\/+$/, '');
  if (raw.startsWith('http://')) return `ws://${raw.slice('http://'.length)}`.replace(/\/+$/, '');
  if (raw.startsWith('https://')) return `wss://${raw.slice('https://'.length)}`.replace(/\/+$/, '');
  return `wss://${raw.replace(/\/+$/, '')}`;
}

export function normalizeRelayList(relays) {
  return [...new Set((relays || []).map(normalizeRelayUrl))];
}

export function normalizePubkey(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Empty pubkey.');
  if (raw.startsWith('npub1')) {
    const decoded = nip19.decode(raw);
    if (decoded.type !== 'npub') throw new Error('The provided key is not a valid npub.');
    return decoded.data;
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return raw.toLowerCase();
  throw new Error('Provide an npub1... identity or a 64-character hexadecimal pubkey.');
}

export function pubkeyToNpub(pubkeyHex) {
  return nip19.npubEncode(normalizePubkey(pubkeyHex));
}

export function secretToIdentity(secretKey) {
  const bytes =
    secretKey instanceof Uint8Array ? secretKey : Uint8Array.from(Buffer.from(secretKey, 'hex'));
  if (bytes.length !== 32) throw new Error('Invalid private key.');
  const pubkeyHex = getPublicKey(bytes);
  return {
    secretKeyHex: Buffer.from(bytes).toString('hex'),
    pubkeyHex,
    npub: pubkeyToNpub(pubkeyHex),
    nsec: nip19.nsecEncode(bytes),
  };
}

export function decodeSecretKey(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Empty private key.');
  if (raw.startsWith('nsec1')) {
    const decoded = nip19.decode(raw);
    if (decoded.type !== 'nsec') throw new Error('The provided key is not a valid nsec.');
    return secretToIdentity(decoded.data);
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return secretToIdentity(Uint8Array.from(Buffer.from(raw, 'hex')));
  }
  throw new Error('Invalid private key. Use an nsec1... or 64 hexadecimal characters.');
}

export function generateIdentity() {
  return secretToIdentity(generateSecretKey());
}

export function signEvent(secretKeyHex, template) {
  const secretKey = Uint8Array.from(Buffer.from(secretKeyHex, 'hex'));
  return finalizeEvent(template, secretKey);
}

function safeVerify(event) {
  try {
    return verifyEvent(event);
  } catch {
    return false;
  }
}

function queryOneRelay(relayUrl, filter, timeoutMs) {
  return new Promise((resolve, reject) => {
    const events = [];
    const subId = `ngit-${randomBytes(6).toString('hex')}`;
    let opened = false;
    let finished = false;
    let socket;

    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        socket?.close();
      } catch {
        // Ignored.
      }
      if (error && !opened) {
        reject(error);
      } else {
        resolve({ events, error: error ? error.message : null });
      }
    };

    const timer = setTimeout(() => finish(new Error('Timed out')), timeoutMs);
    timer.unref?.();

    try {
      socket = new WebSocket(relayUrl, {
        handshakeTimeout: Math.min(timeoutMs, 7000),
        perMessageDeflate: false,
      });
    } catch (error) {
      finish(error);
      return;
    }

    socket.on('open', () => {
      opened = true;
      socket.send(JSON.stringify(['REQ', subId, filter]));
    });

    socket.on('message', (data) => {
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!Array.isArray(message)) return;
      const [type, id, payload, extra] = message;
      if (type === 'EVENT' && id === subId && payload) {
        events.push(payload);
        return;
      }
      if (type === 'EOSE' && id === subId) {
        finish();
        return;
      }
      if (type === 'CLOSED' && id === subId) {
        finish(extra ? new Error(String(extra)) : null);
        return;
      }
      if (type === 'NOTICE') {
        // Notices are not fatal for subscriptions.
      }
    });

    socket.on('error', (error) => finish(error));
    socket.on('close', () => finish());
  });
}

export async function queryEvents(relays, filter, options = {}) {
  const timeoutMs = options.timeoutMs || RELAY_TIMEOUT_MS;
  const relayList = normalizeRelayList(relays);
  const reports = [];
  const collected = [];

  await Promise.all(
    relayList.map(async (relayUrl) => {
      const report = { url: relayUrl, ok: false, events: 0, error: null };
      try {
        const result = await queryOneRelay(relayUrl, filter, timeoutMs);
        report.ok = true;
        report.events = result.events.length;
        if (result.error) report.error = result.error;
        collected.push(...result.events);
      } catch (error) {
        report.error = error?.message || String(error);
      }
      reports.push(report);
    })
  );

  const byId = new Map();
  for (const event of collected) {
    if (!event || typeof event !== 'object') continue;
    if (options.verify !== false && !safeVerify(event)) continue;
    const current = byId.get(event.id);
    if (!current || event.created_at > current.created_at) byId.set(event.id, event);
  }

  const events = [...byId.values()].sort((a, b) => b.created_at - a.created_at);
  reports.sort((a, b) => a.url.localeCompare(b.url));
  return { events, relays: reports };
}

function publishOneRelay(relayUrl, event, timeoutMs) {
  return new Promise((resolve) => {
    let opened = false;
    let finished = false;
    let socket;
    let notice = '';

    const finish = (ok, message) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        socket?.close();
      } catch {
        // Ignored.
      }
      resolve({ ok, message: message || notice || null });
    };

    const timer = setTimeout(() => finish(false, 'Timed out'), timeoutMs);
    timer.unref?.();

    try {
      socket = new WebSocket(relayUrl, {
        handshakeTimeout: Math.min(timeoutMs, 7000),
        perMessageDeflate: false,
      });
    } catch (error) {
      finish(false, error.message);
      return;
    }

    socket.on('open', () => {
      opened = true;
      socket.send(JSON.stringify(['EVENT', event]));
    });

    socket.on('message', (data) => {
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!Array.isArray(message)) return;
      const [type, id, ok, extra] = message;
      if (type === 'OK' && id === event.id) {
        finish(Boolean(ok), extra ? String(extra) : ok ? 'accepted' : 'rejected');
        return;
      }
      if (type === 'NOTICE') notice = String(extra || id || 'notice');
      if (type === 'AUTH') notice = 'relay requires NIP-42 authentication';
    });

    socket.on('error', (error) => finish(false, error.message));
    socket.on('close', () => {
      if (opened) finish(false, 'connection closed without OK');
      else finish(false, 'could not connect');
    });
  });
}

export async function publishEvent(relays, event, options = {}) {
  const timeoutMs = options.timeoutMs || RELAY_TIMEOUT_MS;
  const relayList = normalizeRelayList(relays);
  const reports = await Promise.all(
    relayList.map(async (relayUrl) => {
      const result = await publishOneRelay(relayUrl, event, timeoutMs);
      return { url: relayUrl, ...result };
    })
  );
  reports.sort((a, b) => a.url.localeCompare(b.url));
  return {
    ok: reports.some((report) => report.ok),
    relays: reports,
  };
}

export function makeClientTags(tags = []) {
  const result = tags.map((tag) => [...tag]);
  const names = new Set(result.map((tag) => tag[0]));
  if (!names.has('client')) result.push(['client', 'nostr-git']);
  if (!names.has('ngit')) result.push(['ngit', '1']);
  return result;
}
