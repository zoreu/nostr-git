import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { uploadBlob } from '../lib/blossom.js';
import {
  ensureRepoConfig,
  requireLogin,
  saveRepoConfig,
  validateProjectName,
} from '../lib/config.js';
import {
  createBundle,
  currentBranch,
  ensureNgitExcluded,
  headCommit,
  hasCommits,
  readLog,
  requireRepoRoot,
  setNostrRemote,
  statusPorcelain,
} from '../lib/git.js';
import { buildManifest, collectSnapshot } from '../lib/manifest.js';
import { publishEvent, signEvent } from '../lib/nostr.js';
import {
  buildAnnouncementTemplate,
  buildRepoUrl,
  buildStateTemplate,
} from '../lib/protocol.js';
import {
  createProgress,
  die,
  formatBytes,
  info,
  shortHash,
  success,
  ui,
  warn,
} from '../lib/ui.js';

function printPublishReport(label, result) {
  info(`${label} ${ui.dim(`(${result.relays.length} relay(s))`)}`);
  for (const relay of result.relays) {
    if (relay.ok) {
      info(`  ${ui.green('✓')} ${relay.url} ${ui.dim(relay.message || '')}`);
    } else {
      warn(`  ${relay.url} ${ui.dim(relay.message || 'sem resposta')}`);
    }
  }
}

function relayErrors(result) {
  return result.relays
    .filter((relay) => !relay.ok)
    .map((relay) => `  - ${relay.url}: ${relay.message || 'sem resposta'}`)
    .join('\n');
}

export async function pushCommand() {
  const config = requireLogin();
  const root = await requireRepoRoot();
  ensureNgitExcluded(root);
  const repo = ensureRepoConfig(root);
  const project = validateProjectName(repo.project);
  const branch = await currentBranch(root);

  if (repo.owner && repo.owner !== config.npub) {
    warn(
      `Este clone pertence a ${repo.owner}; o push será publicado sob a sua identidade ${config.npub}.`
    );
  }

  if (!(await hasCommits(root))) {
    die('Nenhum commit para enviar. Use "ngit add ." e "ngit commit -m \\"mensagem\\"" primeiro.');
  }
  if (!branch) {
    die('Faça checkout de uma branch antes do push (HEAD destacado não é suportado).');
  }

  const commit = await headCommit(root);
  const previousCommit = repo.lastCommit || null;

  if (await statusPorcelain(root)) {
    warn('Existem alterações não commitadas. Apenas os commits serão enviados.');
  }

  info(ui.bold('Enumerando objetos...'));
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ngit-push-'));
  const bundlePath = path.join(tempDir, 'repository.bundle');

  try {
    const files = await collectSnapshot(root, commit);
    info(`  ${files.length} arquivo(s), ${formatBytes(files.reduce((sum, file) => sum + file.size, 0))}`);

    await createBundle(root, bundlePath);
    const bundleBuffer = await readFile(bundlePath);
    info(`  bundle Git: ${formatBytes(bundleBuffer.length)}`);

    info(ui.bold('Enviando conteúdo para o Blossom...'));
    const fileProgress = createProgress('  arquivos', files.length);
    let reused = 0;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const uploaded = await uploadBlob(file.buffer, {
        secretKeyHex: config.secretKeyHex,
        servers: config.blossomServers,
        contentType: file.mime,
        reuse: true,
      });
      file.servers = [uploaded.server];
      if (uploaded.existing) reused += 1;
      fileProgress.update(index + 1, file.path);
    }
    fileProgress.done(
      `${files.length} arquivo(s), ${reused} reaproveitado(s) do Blossom`
    );

    const bundleUpload = await uploadBlob(bundleBuffer, {
      secretKeyHex: config.secretKeyHex,
      servers: config.blossomServers,
      contentType: 'application/x-git-bundle',
      reuse: true,
    });
    info(
      `  ${ui.green('✓')} bundle ${formatBytes(bundleUpload.size)} ${ui.dim(bundleUpload.server)}`
    );

    const commits = await readLog(root, commit, 200);
    const manifest = buildManifest({
      project,
      npub: config.npub,
      pubkey: config.pubkeyHex,
      branch,
      commit,
      commits,
      files,
      description: repo.description || '',
    });
    const manifestBuffer = Buffer.from(JSON.stringify(manifest), 'utf8');
    const manifestUpload = await uploadBlob(manifestBuffer, {
      secretKeyHex: config.secretKeyHex,
      servers: config.blossomServers,
      contentType: 'application/json',
      reuse: false,
    });
    info(
      `  ${ui.green('✓')} manifesto ${formatBytes(manifestUpload.size)} ${ui.dim(manifestUpload.server)}`
    );

    const blossomServers = [
      ...new Set([
        ...files.flatMap((file) => file.servers || []),
        manifestUpload.server,
        bundleUpload.server,
      ]),
    ];

    const now = Math.floor(Date.now() / 1000);
    const stateCreatedAt = Math.max(now, Number(repo.lastStateCreatedAt || 0) + 1);
    const manifestDescriptor = {
      hash: manifestUpload.hash,
      size: manifestUpload.size,
      server: manifestUpload.server,
      servers: blossomServers,
    };
    const bundleDescriptor = {
      hash: bundleUpload.hash,
      size: bundleUpload.size,
      server: bundleUpload.server,
    };

    const stateEvent = signEvent(
      config.secretKeyHex,
      buildStateTemplate({
        project,
        branch,
        commit,
        manifest: manifestDescriptor,
        bundle: bundleDescriptor,
        blossomServers,
        createdAt: stateCreatedAt,
      })
    );

    const announcementEvent = signEvent(
      config.secretKeyHex,
      buildAnnouncementTemplate({
        project,
        pubkey: config.pubkeyHex,
        npub: config.npub,
        description: repo.description || '',
        relays: config.relays,
        blossomServers,
        createdAt: stateCreatedAt,
      })
    );

    info(ui.bold('Publicando referências no Nostr...'));
    const [stateResult, announcementResult] = await Promise.all([
      publishEvent(config.relays, stateEvent),
      publishEvent(config.relays, announcementEvent),
    ]);

    printPublishReport('  estado do repositório', stateResult);
    printPublishReport('  anúncio do repositório', announcementResult);

    if (!stateResult.ok) {
      die(
        `Nenhum relay aceitou o estado do repositório.\n${relayErrors(stateResult)}`
      );
    }
    if (!announcementResult.ok) {
      warn('O estado foi publicado, mas o anúncio do repositório não foi aceito por nenhum relay.');
    }

    saveRepoConfig(root, {
      ...repo,
      project,
      owner: config.npub,
      ownerPubkey: config.pubkeyHex,
      defaultBranch: branch,
      lastCommit: commit,
      lastStateCreatedAt: stateCreatedAt,
      lastPushAt: new Date().toISOString(),
    });

    try {
      const remoteName = await setNostrRemote(root, buildRepoUrl(config.npub, project));
      if (remoteName !== 'origin') {
        info(`  ${ui.dim(`remote "${remoteName}" configurado (o origin existente foi mantido).`)}`);
      }
    } catch {
      // Non-fatal: Git remotes are only displayed for convenience.
    }

    const url = buildRepoUrl(config.npub, project);
    console.log('');
    info(`To ${ui.cyan(url)}`);
    if (!previousCommit) {
      info(`   ${ui.dim('* [new branch]')}      ${branch} -> ${branch}`);
    } else if (previousCommit !== commit) {
      info(`   ${shortHash(previousCommit)}..${shortHash(commit)}  ${branch} -> ${branch}`);
    } else {
      info(`   ${branch} -> ${branch} ${ui.dim('(sem novos commits)')}`);
    }
    info('');
    success('Push concluído. Arquivos e histórico estão no Nostr + Blossom.');
    info(`  ${ui.dim('Visualize com:')} ngit web ${config.npub}/${project}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
