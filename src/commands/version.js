import {
  checkoutRef,
  currentBranch,
  hasCommits,
  headCommit,
  isDetachedHead,
  listTags,
  requireRepoRoot,
  resolveCommit,
  runGit,
  statusPorcelain,
} from '../lib/git.js';
import {
  bumpVersion,
  compareVersions,
  isVersionLabel,
  parseVersion,
  sortVersions,
  versionToString,
} from '../lib/semver.js';
import { die, info, shortHash, success, ui, warn } from '../lib/ui.js';

const VERSION_HELP = `
${ui.bold('Uso:')} ngit version <subcomando> [opções]

${ui.bold('Subcomandos:')}
  ${ui.cyan('list')}                                   Lista as versões criadas (tags vSemVer)
  ${ui.cyan('create')} [vX.Y.Z] [hash] [-m "msg"]      Cria uma versão em um commit
  ${ui.cyan('switch')} <versão|hash|latest>            Troca para uma versão ou commit específico
  ${ui.cyan('checkout')} <versão|hash|latest>          Apelido para o switch
  ${ui.cyan('current')}                                 Mostra a versão e o commit atuais

${ui.bold('Opções de create:')}
  --major, --minor, --patch   Incrementa a última versão (padrão: patch) em vez de informar vX.Y.Z
  -m "mensagem"               Mensagem da versão (tag anotada)

${ui.bold('Opções de switch:')}
  -b, --branch <nome>         Cria uma branch nova no commit escolhido (permite publicar depois)
  --force, -f                 Descarta conflitos com alterações pendentes

${ui.bold('Exemplos:')}
  ngit version create v1.0.0
  ngit version create
  ngit version create --patch -m "correção"
  ngit version list
  ngit version switch a1b2c3d
  ngit version switch v1.2.3
  ngit version switch v1.2.3 --branch correcao-1.2.3
  ngit version switch latest
`;

function parseArgs(tokens) {
  const positional = [];
  const flags = new Map();

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === '-m' || token === '--message') {
      const value = tokens[index + 1];
      if (!value || value.startsWith('-')) {
        die(`A opção ${token} exige uma mensagem. Exemplo: -m "primeira versão"`);
      }
      flags.set('message', value);
      index += 1;
      continue;
    }
    if (token === '-b' || token === '--branch') {
      const value = tokens[index + 1];
      if (!value || value.startsWith('-')) {
        die(`A opção ${token} exige um nome de branch.`);
      }
      flags.set('branch', value);
      index += 1;
      continue;
    }
    if (token === '--major' || token === '--minor' || token === '--patch') {
      flags.set('bump', token.slice(2));
      continue;
    }
    if (token === '--force' || token === '-f') {
      flags.set('force', true);
      continue;
    }
    if (token.startsWith('-')) {
      die(`Opção desconhecida: ${token}`);
    }
    positional.push(token);
  }

  return { positional, flags };
}

async function versionEntries(root) {
  const tags = await listTags(root);
  return sortVersions(tags.filter((tag) => isVersionLabel(tag.name)));
}

function versionAtCommit(versions, commit) {
  return versions.find((version) => version.commit === commit) || null;
}

async function readLocation(root) {
  let branch = null;
  try {
    branch = await currentBranch(root);
  } catch {
    branch = null;
  }
  return { branch, detached: branch === null };
}

function parseVersionLabel(value, kind = 'versão') {
  const label = versionToString(parseVersion(value));
  if (!label) {
    die(`Formato de ${kind} inválido: "${value}". Use o padrão vX.Y.Z (v0.1.0, v1.2.3...).`);
  }
  return label;
}

async function resolveRefArg(root, value) {
  const direct = await resolveCommit(root, value);
  if (direct) return { commit: direct, candidate: value };

  const version = parseVersion(value);
  if (version) {
    const label = versionToString(version);
    const match = (await listTags(root)).find(
      (tag) => isVersionLabel(tag.name) && compareVersions(tag.name, label) === 0
    );
    if (match) {
      const commit = await resolveCommit(root, match.name);
      if (commit) return { commit, candidate: match.name };
    }
  }

  return null;
}

async function assertHasCommits(root) {
  if (!(await hasCommits(root))) {
    die('Nenhum commit ainda. Use "ngit add ." e "ngit commit -m \\"mensagem\\"" antes de versionar.');
  }
}

async function listSub() {
  const root = await requireRepoRoot();
  await assertHasCommits(root);

  const versions = await versionEntries(root);
  const head = await headCommit(root);
  const { branch, detached } = await readLocation(root);

  console.log('');
  info(
    ui.bold('Versões:') +
      ` ${ui.dim(`${versions.length} versão(ões) · em`)} ` +
      (detached ? ui.cyan('(commit destacado)') : ui.cyan(branch)) +
      ui.dim(` @ ${shortHash(head)}`)
  );

  if (versions.length === 0) {
    info(
      `${ui.dim('(nenhuma versão criada — começe com')} ${ui.cyan('ngit version create v0.1.0')}${ui.dim(')')}`
    );
  }

  for (const version of versions) {
    const marker = version.commit === head ? ui.green('→') : ' ';
    const date = version.createdAt ? version.createdAt.slice(0, 10) : '';
    const detail = version.message ? `  ${version.message}` : '';
    info(
      `${marker} ${ui.cyan(version.name.padEnd(12, ' '))} ${shortHash(version.commit)}  ${ui.dim(`${date}${detail}`)}`
    );
  }

  console.log('');
  info(
    `${ui.dim('troque de versão com:')} ${ui.cyan('ngit version switch <versão|hash|latest>')}`
  );
}

async function currentSub() {
  const root = await requireRepoRoot();
  await assertHasCommits(root);

  const head = await headCommit(root);
  const versions = await versionEntries(root);
  const current = versionAtCommit(versions, head);
  const { branch, detached } = await readLocation(root);

  console.log('');
  info(`${ui.dim('commit:')}       ${ui.cyan(head)}`);
  info(
    `${ui.dim('localização:')}  ${
      current ? ui.cyan(current.name) : detached ? ui.cyan('(commit destacado)') : ui.cyan(branch)
    } ${ui.dim(`@ ${shortHash(head)}`)}`
  );
  info(
    `${ui.dim('versões de referência:')} ${ui.cyan('ngit version list')}`
  );

  if (detached) {
    warn('HEAD destacado. Para publicar este estado depois, use --branch ao trocar de versão.');
  }
}

async function createSub(args) {
  const root = await requireRepoRoot();
  await assertHasCommits(root);

  const { positional, flags } = parseArgs(args);
  const versions = await versionEntries(root);
  const latest = versions[0] || null;
  const bump = flags.get('bump') || null;

  const firstIsVersion = positional.length > 0 && isVersionLabel(positional[0]);

  if (bump && firstIsVersion) {
    die('Informe a versão OU uma opção --major/--minor/--patch, não as duas coisas.');
  }

  let label = null;
  let refArg = null;

  if (firstIsVersion) {
    label = parseVersionLabel(positional[0]);
    refArg = positional[1] || 'HEAD';
  } else if (bump) {
    refArg = positional[0] || 'HEAD';
    label = versionToString(bumpVersion(latest?.name || 'v0.0.0', bump));
  } else {
    if (positional.length > 0) {
      die(`Formato de versão inválido: "${positional[0]}". Use vX.Y.Z (ex.: v1.2.3).`);
    }
    refArg = 'HEAD';
    label = latest ? versionToString(bumpVersion(latest.name, 'patch')) : 'v0.1.0';
  }

  const existing = versions.find((version) => version.name === label);
  if (existing) {
    die(
      `A versão ${label} já existe em ${shortHash(existing.commit)}. Escolha outro número ou use --major/--minor/--patch.`
    );
  }

  const resolved = await resolveRefArg(root, refArg);
  if (!resolved) {
    die(
      `Commit ou referência desconhecida: "${refArg}". Informe um hash válido ou use "ngit version list".`
    );
  }
  const { commit: targetCommit } = resolved;

  const message = flags.get('message') || `versão ${label} (commit ${shortHash(targetCommit)})`;
  const result = await runGit(['tag', '-a', label, '-m', message, targetCommit], { cwd: root });
  if (result.code !== 0) {
    const reason = result.stderr.toString('utf8').trim();
    if (/user\.name|user\.email|who you are/i.test(reason)) {
      die(
        'Sem identidade Git para criar a tag anotada. Configure antes:\n' +
          `  ${ui.dim('git config --global user.name "Seu Nome"')}\n` +
          `  ${ui.dim('git config --global user.email "voce@exemplo.com"')}`
      );
    }
    die(`Falha ao criar a versão: ${reason}`);
  }

  const head = await headCommit(root);
  console.log('');
  success(`Versão ${ui.bold(label)} criada em ${ui.cyan(shortHash(targetCommit))}`);
  info(`  ${ui.dim('mensagem:')} ${message}`);
  if (targetCommit === head) {
    info(
      `  ${ui.dim('próximo passo:')} ${ui.cyan('ngit push')} ${ui.dim('(o manifesto publicado incluirá as versões)')}`
    );
  } else {
    info(
      `  ${ui.dim('para trocar para essa base depois:')} ${ui.cyan(`ngit version switch ${label}`)}`
    );
  }
}

async function switchSub(args, { subcommand = 'switch' } = {}) {
  const root = await requireRepoRoot();
  await assertHasCommits(root);

  const { positional, flags } = parseArgs(args);
  if (positional.length === 0) {
    die(`Informe uma versão, hash ou "latest". Exemplo: ngit version ${subcommand} v1.2.3`);
  }

  const requested = positional[0];
  const versions = await versionEntries(root);

  let resolved = null;
  if (requested === 'latest') {
    const latest = versions[0];
    if (!latest) {
      die('Nenhuma versão criada. Crie uma com "ngit version create".');
    }
    const commit = await resolveCommit(root, latest.name);
    resolved = commit ? { commit, candidate: latest.name } : null;
  } else {
    resolved = await resolveRefArg(root, requested);
  }

  if (!resolved) {
    const known = versions.map((entry) => entry.name).join(', ');
    die(
      `"${requested}" não corresponde a nenhuma versão, branch ou commit conhecido.` +
        (known ? `\nVersões conhecidas: ${known}` : '\nNenhuma versão criada ainda.') +
        `\nVeja com: ${ui.cyan('ngit version list')}`
    );
  }

  const { commit, candidate } = resolved;

  const head = await headCommit(root);
  if (commit === head && !flags.has('branch')) {
    const current = versionAtCommit(versions, commit);
    info(
      `Já está em ${ui.cyan(shortHash(commit))}${current ? ` ${ui.dim(`(${current.name})`)}` : ''}. Nada a fazer.`
    );
    return;
  }

  const dirty = await statusPorcelain(root);
  if (dirty && !flags.has('force')) {
    die(
      'Existem alterações não commitadas. Faça um commit ("ngit add .", "ngit commit -m \\"msg\\"")' +
        ' ou use --force para descartar conflitos.'
    );
  }

  const newBranch = flags.get('branch') || null;
  const code = await checkoutRef(root, candidate, { newBranch, force: flags.has('force') });
  if (code !== 0) {
    process.exitCode = code || 1;
    return;
  }

  const versionEntry = versionAtCommit(versions, commit);
  console.log('');
  success(
    `Trocou para ${ui.bold(candidate)} ${ui.dim(`(${shortHash(commit)})`)}` +
      (versionEntry ? ` ${ui.dim(`· ${versionEntry.name}`)}` : '')
  );

  const detached = await isDetachedHead(root);
  if (newBranch) {
    info(`  ${ui.dim('branch criada:')} ${ui.cyan(newBranch)} ${ui.dim('— agora é só "ngit add .", commit e "ngit push"')}`);
  } else if (detached) {
    warn('HEAD destacado: commits a partir daqui podem ser perdidos.');
    info(`  ${ui.dim('para publicar este estado:')} ${ui.cyan(`ngit version switch ${candidate} --branch <nome>`)}`);
    info(`  ${ui.dim('para voltar à ponta da branch:')} ${ui.cyan('ngit version switch <branch|latest>')}`);
  }
}

export async function versionCommand(args) {
  const first = args[0];
  const sub = first && !first.startsWith('-') ? first : null;
  const rest = sub ? args.slice(1) : [];

  if (!sub || sub === 'help' || sub === '--help' || sub === '-h') {
    console.log(VERSION_HELP);
    return;
  }

  switch (sub) {
    case 'list':
    case 'versoes':
    case 'versões':
      await listSub();
      break;
    case 'create':
    case 'nova':
      await createSub(rest);
      break;
    case 'switch':
    case 'checkout':
    case 'trocar':
      await switchSub(rest, { subcommand: sub });
      break;
    case 'current':
    case 'atual':
      await currentSub();
      break;
    default:
      die(`Subcomando de versão desconhecido: "${sub}". Use: list, create, switch, current ou help.`);
  }
}
