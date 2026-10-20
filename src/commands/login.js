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
  if (!value) throw new Error(`Informe um valor depois de ${name}.`);
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
      info('Sua chave privada fica salva apenas neste computador (~/.ngit/config.json).');
      info('Dica: use --generate para criar uma identidade nova.');
      info('');
      secret = await promptSecret('Chave privada Nostr (nsec1...): ');
    }
    if (!secret) die('Nenhuma chave privada informada.');
    identity = decodeSecretKey(secret);
  }

  const current = loadGlobalConfig();
  const relays = relaysOption || current.relays || DEFAULT_RELAYS;
  const blossomServers = blossomOption || current.blossomServers || DEFAULT_BLOSSOM_SERVERS;

  if (!relays || relays.length === 0) die('É necessário pelo menos um relay Nostr.');
  if (!blossomServers || blossomServers.length === 0) {
    die('É necessário pelo menos um servidor Blossom.');
  }

  saveGlobalConfig({
    ...current,
    ...identity,
    relays,
    blossomServers,
    createdAt: current.createdAt || new Date().toISOString(),
  });

  console.log('');
  success(`Login realizado como ${ui.bold(identity.npub)}`);
  info(`  ${ui.dim('pubkey:')} ${identity.pubkeyHex}`);
  info(`  ${ui.dim('config:')} ${configFile()}`);
  info('');
  info(`${ui.dim('Relays Nostr:')}\n${formatRelayList(relays)}`);
  info(`${ui.dim('Servidores Blossom:')}\n${formatRelayList(blossomServers)}`);
  info('');

  if (generate) {
    warn('Guarde sua chave privada em local seguro. Ela não será exibida novamente:');
    info(`  ${ui.bold(identity.nsec || '')}`);
    info('');
    info('Para exibir o nsec depois, use seu gerenciador de chaves ou um cliente Nostr.');
  } else {
    info(ui.dim('Sua chave privada foi salva com permissões restritas.'));
  }
}

export function whoamiCommand() {
  const config = loadGlobalConfig();
  if (!config.pubkeyHex) {
    die('Nenhuma identidade configurada. Rode "ngit login".');
  }
  info(`npub:   ${pubkeyToNpub(normalizePubkey(config.pubkeyHex))}`);
  info(`pubkey: ${config.pubkeyHex}`);
}
