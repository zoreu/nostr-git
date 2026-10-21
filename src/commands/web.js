import { loadGlobalConfig } from '../lib/config.js';
import { normalizePubkey, pubkeyToNpub } from '../lib/nostr.js';
import { parseNostrUrl } from '../lib/protocol.js';
import { info, openBrowser, success, ui } from '../lib/ui.js';
import { createWebApp } from '../lib/webServer.js';

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
}

export async function webCommand(args) {
  const config = loadGlobalConfig();
  const noOpen = args.includes('--no-open');
  const host = optionValue(args, '--host') || '127.0.0.1';
  const port = Number(optionValue(args, '--port') || optionValue(args, '-p') || 3737);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid port.');
  }

  const positional = args.filter(
    (arg, index) =>
      !arg.startsWith('-') &&
      args[index - 1] !== '--port' &&
      args[index - 1] !== '-p' &&
      args[index - 1] !== '--host'
  );

  let target = null;
  if (positional[0]) {
    const raw = positional[0];
    if (raw.includes('/')) {
      const parsed = parseNostrUrl(raw);
      target = {
        npub: pubkeyToNpub(normalizePubkey(parsed.identity)),
        project: parsed.project,
      };
    } else if (config.npub) {
      target = { npub: config.npub, project: raw };
    } else {
      throw new Error(
        'Provide the repository as npub1.../project or log in to use just the project name.'
      );
    }
  }

  const app = createWebApp({
    relays: config.relays,
    blossomServers: config.blossomServers,
  });

  let address;
  try {
    address = await app.listen({ host, port });
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      throw new Error(`Port ${port} is already in use. Try: ngit web --port ${port + 1}`);
    }
    throw error;
  }

  const browserHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  const base = `http://${browserHost}:${address.port}/`;
  const hash = target
    ? `#/${encodeURIComponent(target.npub)}/${encodeURIComponent(target.project)}`
    : '';
  const url = `${base}${hash}`;

  console.log('');
  success(`Web interface running at ${ui.cyan(url)}`);
  info(`  ${ui.dim('relays:')}  ${config.relays.join(', ')}`);
  info(`  ${ui.dim('blossom:')} ${config.blossomServers.join(', ')}`);
  info(`  ${ui.dim('Press Ctrl+C to stop.')}`);

  if (!noOpen) {
    const opened = openBrowser(url);
    if (!opened) info(`  Open it manually: ${url}`);
  }

  const shutdown = () => {
    console.log('');
    info('Stopping ngit web...');
    app.server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
