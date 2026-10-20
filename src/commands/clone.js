import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { downloadBlob } from '../lib/blossom.js';
import {
  ensureNgitExcluded,
  cloneBundle,
  currentBranch,
  ensureGitInstalled,
  setNostrRemote,
} from '../lib/git.js';
import { loadGlobalConfig, saveRepoConfig, validateProjectName } from '../lib/config.js';
import { normalizePubkey, pubkeyToNpub } from '../lib/nostr.js';
import { fetchRepository, parseNostrUrl } from '../lib/protocol.js';
import {
  die,
  formatBytes,
  info,
  success,
  ui,
  warn,
} from '../lib/ui.js';

function targetIsUsable(target) {
  if (!existsSync(target)) return true;
  try {
    return readdirSync(target).length === 0;
  } catch {
    return false;
  }
}

export async function cloneCommand(args) {
  await ensureGitInstalled();

  const positional = args.filter((arg) => !arg.startsWith('-'));
  if (positional.length === 0) {
    die('Informe o repositório. Exemplo: ngit clone npub1.../meu-projeto');
  }

  const { identity, project: rawProject } = parseNostrUrl(positional[0]);
  const project = validateProjectName(rawProject);
  const pubkeyHex = normalizePubkey(identity);
  const npub = pubkeyToNpub(pubkeyHex);
  const target = positional[1] || project;
  const config = loadGlobalConfig();
  const url = `nostr://${npub}/${project}`;

  if (!targetIsUsable(target)) {
    die(`O destino "${target}" já existe e não está vazio.`);
  }

  info(`Buscando ${ui.cyan(url)} nos relays Nostr...`);
  const repository = await fetchRepository(config.relays, pubkeyHex, project, {
    timeoutMs: 9000,
  });

  if (!repository.state) {
    const errors = repository.stateRelays
      .filter((relay) => !relay.ok || relay.events === 0)
      .map((relay) => `  - ${relay.url}: ${relay.error || 'nenhum evento encontrado'}`)
      .join('\n');
    die(
      `Repositório não encontrado no Nostr.\n` +
        `  identidade: ${npub}\n  projeto: ${project}\n${errors}`
    );
  }

  const state = repository.state;
  if (!state.bundle || !state.commit) {
    die(
      'O evento de estado foi encontrado, mas não contém um bundle Git. ' +
        'Faça um novo push com uma versão recente do ngit.'
    );
  }

  const foundRelays = repository.stateRelays.filter((relay) => relay.ok).length;
  info(
    `  ${ui.green('✓')} repositório encontrado ${ui.dim(`(${foundRelays} relay(s), commit ${state.commit.slice(0, 7)})`)}`
  );

  info('Baixando bundle do Blossom...');
  const servers = [
    ...state.blossomServers,
    state.bundle.server,
    state.manifest?.server,
    ...config.blossomServers,
  ];
  const downloaded = await downloadBlob(state.bundle.hash, {
    servers,
    expectedSize: state.bundle.size,
    timeoutMs: 180000,
  });
  info(
    `  ${ui.green('✓')} ${formatBytes(downloaded.buffer.length)} ${ui.dim(`de ${downloaded.server}`)}`
  );

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ngit-clone-'));
  const bundlePath = path.join(tempDir, 'repository.bundle');

  try {
    await writeFile(bundlePath, downloaded.buffer);
    const code = await cloneBundle(bundlePath, target, process.cwd());
    if (code !== 0) {
      throw new Error('O Git não conseguiu montar o repositório a partir do bundle.');
    }

    const root = path.resolve(process.cwd(), target);
    ensureNgitExcluded(root);

    let branch = state.branch;
    try {
      branch = await currentBranch(root);
    } catch {
      branch = state.branch || 'main';
    }

    saveRepoConfig(root, {
      version: 1,
      project,
      owner: npub,
      ownerPubkey: pubkeyHex,
      defaultBranch: branch,
      description: repository.announcement?.description || '',
      lastCommit: state.commit,
      lastStateCreatedAt: state.createdAt,
      createdAt: new Date().toISOString(),
      clonedAt: new Date().toISOString(),
    });

    try {
      await setNostrRemote(root, url, { replaceOrigin: true });
    } catch {
      warn('Não foi possível configurar o remote "origin" no Git.');
    }

    console.log('');
    success(`Clone concluído em ${ui.bold(root)}`);
    info(`  ${ui.dim('remote:')} ${url}`);
    info(`  ${ui.dim('web:')}    ngit web ${npub}/${project}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
