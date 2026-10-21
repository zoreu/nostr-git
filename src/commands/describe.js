
import {
  ensureRepoConfig,
  requireLogin,
  saveRepoConfig,
  validateProjectName,
  validateDescription,
} from '../lib/config.js';
import { requireRepoRoot } from '../lib/git.js';
import {
  buildAnnouncementTemplate,
  buildRepoUrl,
  fetchRepository,
} from '../lib/protocol.js';
import { publishEvent, signEvent } from '../lib/nostr.js';
import { die, info, success, ui, warn } from '../lib/ui.js';

function parseDescribeArgs(args) {
  let clear = false;
  const text = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--clear' || arg === '-c') {
      clear = true;
      continue;
    }
    if (!arg.startsWith('-')) text.push(arg);
  }
  return { clear, text: text.join(' ') };
}

export async function describeCommand(args) {
  const { clear, text: rawText } = parseDescribeArgs(args);
  if (!clear && !rawText.trim()) {
    die(
      'Provide the new description. Usage: ngit describe "My project description" (or --clear to remove it).'
    );
  }

  const config = requireLogin();
  const root = await requireRepoRoot();
  const repo = ensureRepoConfig(root);
  const project = validateProjectName(repo.project);
  const description = validateDescription(clear ? '' : rawText);

  saveRepoConfig(root, {
    ...repo,
    description,
  });

  info(ui.bold(`Setting description for ${config.npub}/${project}...`));
  if (description) {
    info(`  ${ui.dim('new description:')} ${description}`);
  } else {
    warn('  description removed.');
  }

  const previous = await fetchRepository(config.relays, config.pubkeyHex, project, {
    timeoutMs: 9000,
  });
  if (!previous.state) {
    warn(
      'The repository is not published yet. Run "ngit push" so the description reaches the relays.'
    );
  }

  const previousAnnouncement = previous.announcement;
  const now = Math.floor(Date.now() / 1000);
  const createdAt = Math.max(
    now,
    Number(previousAnnouncement?.createdAt || 0) + 1
  );

  const announcementEvent = signEvent(
    config.secretKeyHex,
    buildAnnouncementTemplate({
      project,
      pubkey: config.pubkeyHex,
      npub: config.npub,
      description,
      relays: config.relays,
      blossomServers: config.blossomServers,
      createdAt,
    })
  );

  const result = await publishEvent(config.relays, announcementEvent);
  for (const relay of result.relays) {
    if (relay.ok) {
      info(`  ${ui.green('✓')} ${relay.url} ${ui.dim(relay.message || '')}`);
    } else {
      warn(`  ${relay.url} ${ui.dim(relay.message || 'no response')}`);
    }
  }

  if (!result.ok) {
    die(
      'The description was saved locally, but no relay accepted the announcement. Try again later.'
    );
  }

  console.log('');
  success('Description updated on the relays.');
  info(`  ${ui.dim('View with:')} ngit web ${buildRepoUrl(config.npub, project)}`);
}
