import {
  configFile,
  DEFAULT_BLOSSOM_SERVERS,
  DEFAULT_RELAYS,
  loadGlobalConfig,
  saveGlobalConfig,
} from '../lib/config.js';
import {
  decodeSecretKey,
  generateIdentity,
  normalizePubkey,
  pubkeyToNpub,
} from '../lib/nostr.js';
import { die, info, promptSecret, success, ui, warn } from '../lib/ui.js';

function parseListOption(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value) throw new Error(`Provide a value after ${name}.`);
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatRelayList(relays) {
  return relays.map((relay) => `  ${ui.dim('•')} ${relay}`).join('\n');
}

export async function loginCommand(args) {
  const generate = args.includes('--generate');
  const keyArgument = args.find((arg) => !arg.startsWith('-') && !arg.startsWith('wss://') && !arg.startsWith('https://'));
  const relaysOption = parseListOption(args, '--relays');
  const blossomOption = parseListOption(args, '--blossom');

  let identity;
  if (generate) {
    identity = generateIdentity();
  } else {
    let secret = process.env.NGIT_NSEC || keyArgument;
    if (!secret) {
      info('Your private key is saved only on this computer (~/.ngit/config.json).');
      info('Tip: use --generate to create a new identity.');
      info('');
      secret = await promptSecret('Nostr private key (nsec1...): ');
    }
    if (!secret) die('No private key provided.');
    identity = decodeSecretKey(secret);
  }

  const current = loadGlobalConfig();
  const relays = relaysOption || current.relays || DEFAULT_RELAYS;
  const blossomServers = blossomOption || current.blossomServers || DEFAULT_BLOSSOM_SERVERS;

  if (!relays || relays.length === 0) die('At least one Nostr relay is required.');
  if (!blossomServers || blossomServers.length === 0) {
    die('At least one Blossom server is required.');
  }

  saveGlobalConfig({
    ...current,
    ...identity,
    relays,
    blossomServers,
    createdAt: current.createdAt || new Date().toISOString(),
  });

  console.log('');
  success(`Logged in as ${ui.bold(identity.npub)}`);
  info(`  ${ui.dim('pubkey:')} ${identity.pubkeyHex}`);
  info(`  ${ui.dim('config:')} ${configFile()}`);
  info('');
  info(`${ui.dim('Nostr relays:')}\n${formatRelayList(relays)}`);
  info(`${ui.dim('Blossom servers:')}\n${formatRelayList(blossomServers)}`);
  info('');

  if (generate) {
    warn('Store your private key in a safe place. It will not be shown again:');
    info(`  ${ui.bold(identity.nsec || '')}`);
    info('');
    info('To show the nsec later, use your key manager or a Nostr client.');
  } else {
    info(ui.dim('Your private key was saved with restricted permissions.'));
  }
}

export function whoamiCommand() {
  const config = loadGlobalConfig();
  if (!config.pubkeyHex) {
    die('No identity configured. Run "ngit login".');
  }
  info(`npub:   ${pubkeyToNpub(normalizePubkey(config.pubkeyHex))}`);
  info(`pubkey: ${config.pubkeyHex}`);
}
