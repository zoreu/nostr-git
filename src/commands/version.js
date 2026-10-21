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
${ui.bold('Usage:')} ngit version <subcommand> [options]

${ui.bold('Subcommands:')}
  ${ui.cyan('list')}                                   Lists the created versions (vSemVer tags)
  ${ui.cyan('create')} [vX.Y.Z] [hash] [-m "msg"]      Creates a version on a commit
  ${ui.cyan('switch')} <version|hash|latest>           Switches to a version or a specific commit
  ${ui.cyan('checkout')} <version|hash|latest>         Alias for switch
  ${ui.cyan('current')}                                Shows the current version and commit

${ui.bold('Create options:')}
  --major, --minor, --patch   Bumps the latest version (default: patch) instead of providing vX.Y.Z
  -m "message"                Version message (annotated tag)

${ui.bold('Switch options:')}
  -b, --branch <name>         Creates a new branch on the chosen commit (allows publishing later)
  --force, -f                 Discards conflicts with pending changes

${ui.bold('Examples:')}
  ngit version create v1.0.0
  ngit version create
  ngit version create --patch -m "fix"
  ngit version list
  ngit version switch a1b2c3d
  ngit version switch v1.2.3
  ngit version switch v1.2.3 --branch fix-1.2.3
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
        die(`The option ${token} requires a message. Example: -m "first version"`);
      }
      flags.set('message', value);
      index += 1;
      continue;
    }
    if (token === '-b' || token === '--branch') {
      const value = tokens[index + 1];
      if (!value || value.startsWith('-')) {
        die(`The option ${token} requires a branch name.`);
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
      die(`Unknown option: ${token}`);
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

function parseVersionLabel(value, kind = 'version') {
  const label = versionToString(parseVersion(value));
  if (!label) {
    die(`Invalid ${kind} format: "${value}". Use the vX.Y.Z pattern (v0.1.0, v1.2.3...).`);
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
    die('No commits yet. Use "ngit add ." and "ngit commit -m \\"message\\"" before creating versions.');
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
    ui.bold('Versions:') +
      ` ${ui.dim(`${versions.length} version(s) · on`)} ` +
      (detached ? ui.cyan('(detached commit)') : ui.cyan(branch)) +
      ui.dim(` @ ${shortHash(head)}`)
  );

  if (versions.length === 0) {
    info(
      `${ui.dim('(no version yet — start with')} ${ui.cyan('ngit version create v0.1.0')}${ui.dim(')')}`
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
    `${ui.dim('switch version with:')} ${ui.cyan('ngit version switch <version|hash|latest>')}`
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
    `${ui.dim('location:')}  ${
      current ? ui.cyan(current.name) : detached ? ui.cyan('(detached commit)') : ui.cyan(branch)
    } ${ui.dim(`@ ${shortHash(head)}`)}`
  );
  info(
    `${ui.dim('reference versions:')} ${ui.cyan('ngit version list')}`
  );

  if (detached) {
    warn('HEAD is detached. To publish this state later, use --branch when switching versions.');
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
    die('Provide the version OR a --major/--minor/--patch option, not both.');
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
      die(`Invalid version format: "${positional[0]}". Use vX.Y.Z (e.g. v1.2.3).`);
    }
    refArg = 'HEAD';
    label = latest ? versionToString(bumpVersion(latest.name, 'patch')) : 'v0.1.0';
  }

  const existing = versions.find((version) => version.name === label);
  if (existing) {
    die(
      `Version ${label} already exists at ${shortHash(existing.commit)}. Choose another number or use --major/--minor/--patch.`
    );
  }

  const resolved = await resolveRefArg(root, refArg);
  if (!resolved) {
    die(
      `Unknown commit or reference: "${refArg}". Provide a valid hash or use "ngit version list".`
    );
  }
  const { commit: targetCommit } = resolved;

  const message = flags.get('message') || `version ${label} (commit ${shortHash(targetCommit)})`;
  const result = await runGit(['tag', '-a', label, '-m', message, targetCommit], { cwd: root });
  if (result.code !== 0) {
    const reason = result.stderr.toString('utf8').trim();
    if (/user\.name|user\.email|who you are/i.test(reason)) {
      die(
        'No Git identity to create the annotated tag. Configure it first:\n' +
          `  ${ui.dim('git config --global user.name "Your Name"')}\n` +
          `  ${ui.dim('git config --global user.email "you@example.com"')}`
      );
    }
    die(`Failed to create the version: ${reason}`);
  }

  const head = await headCommit(root);
  console.log('');
  success(`Version ${ui.bold(label)} created at ${ui.cyan(shortHash(targetCommit))}`);
  info(`  ${ui.dim('message:')} ${message}`);
  if (targetCommit === head) {
    info(
      `  ${ui.dim('next step:')} ${ui.cyan('ngit push')} ${ui.dim('(the published manifest will include the versions)')}`
    );
  } else {
    info(
      `  ${ui.dim('to switch to this base later:')} ${ui.cyan(`ngit version switch ${label}`)}`
    );
  }
}

async function switchSub(args, { subcommand = 'switch' } = {}) {
  const root = await requireRepoRoot();
  await assertHasCommits(root);

  const { positional, flags } = parseArgs(args);
  if (positional.length === 0) {
    die(`Provide a version, hash or "latest". Example: ngit version ${subcommand} v1.2.3`);
  }

  const requested = positional[0];
  const versions = await versionEntries(root);

  let resolved = null;
  if (requested === 'latest') {
    const latest = versions[0];
    if (!latest) {
      die('No version created. Create one with "ngit version create".');
    }
    const commit = await resolveCommit(root, latest.name);
    resolved = commit ? { commit, candidate: latest.name } : null;
  } else {
    resolved = await resolveRefArg(root, requested);
  }

  if (!resolved) {
    const known = versions.map((entry) => entry.name).join(', ');
    die(
      `"${requested}" does not match any known version, branch or commit.` +
        (known ? `\nKnown versions: ${known}` : '\nNo versions created yet.') +
        `\nSee: ${ui.cyan('ngit version list')}`
    );
  }

  const { commit, candidate } = resolved;

  const head = await headCommit(root);
  if (commit === head && !flags.has('branch')) {
    const current = versionAtCommit(versions, commit);
    info(
      `Already at ${ui.cyan(shortHash(commit))}${current ? ` ${ui.dim(`(${current.name})`)}` : ''}. Nothing to do.`
    );
    return;
  }

  const dirty = await statusPorcelain(root);
  if (dirty && !flags.has('force')) {
    die(
      'There are uncommitted changes. Commit first ("ngit add .", "ngit commit -m \\"msg\\"")' +
        ' or use --force to discard conflicts.'
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
    `Switched to ${ui.bold(candidate)} ${ui.dim(`(${shortHash(commit)})`)}` +
      (versionEntry ? ` ${ui.dim(`· ${versionEntry.name}`)}` : '')
  );

  const detached = await isDetachedHead(root);
  if (newBranch) {
    info(`  ${ui.dim('branch created:')} ${ui.cyan(newBranch)} ${ui.dim('— now just "ngit add .", commit and "ngit push"')}`);
  } else if (detached) {
    warn('Detached HEAD: commits from here may be lost.');
    info(`  ${ui.dim('to publish this state:')} ${ui.cyan(`ngit version switch ${candidate} --branch <name>`)}`);
    info(`  ${ui.dim('to go back to the branch tip:')} ${ui.cyan('ngit version switch <branch|latest>')}`);
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
      die(`Unknown version subcommand: "${sub}". Use: list, create, switch, current or help.`);
  }
}
