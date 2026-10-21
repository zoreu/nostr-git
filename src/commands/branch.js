import {
  checkoutRef,
  currentBranch,
  headCommit,
  isDetachedHead,
  listBranches,
  requireRepoRoot,
} from '../lib/git.js';
import { die, info, shortHash, success, ui, warn } from '../lib/ui.js';

const BRANCH_HELP = `
${ui.bold('Usage:')} ngit branch <subcommand> [options]

${ui.bold('Subcommands:')}
  ${ui.cyan('list')}                 Lists local branches (default when no subcommand)
  ${ui.cyan('new')} <name>           Creates a new branch from the current commit and switches to it
  ${ui.cyan('switch')} <name>        Switches to an existing branch
  ${ui.cyan('checkout')} <name>      Switches if the branch exists; otherwise creates and switches

${ui.bold('Examples:')}
  ngit branch list
  ngit branch new hotfix
  ngit branch switch main
  ngit branch checkout experiment
`;

async function located(root) {
  try {
    return await currentBranch(root);
  } catch {
    return null;
  }
}

export async function branchCommand(args) {
  const first = args[0];
  const sub = first && !first.startsWith('-') ? first : null;
  const rest = sub ? args.slice(1) : [];

  if (!sub || sub === 'help' || sub === '--help' || sub === '-h') {
    console.log(BRANCH_HELP);
    return;
  }

  const root = await requireRepoRoot();
  const branches = await listBranches(root);
  const current = await located(root);
  const detached = await isDetachedHead(root);
  const head = await headCommit(root);

  switch (sub) {
    case 'list': {
      console.log('');
      info(ui.bold('Branches:') + ` ${ui.dim(`${branches.length} branch(es) · @ ${shortHash(head)}`)}`);
      if (branches.length === 0) {
        info(`${ui.dim('(no branch yet — make a commit or use')} ${ui.cyan('ngit branch new main')}${ui.dim(')')}`);
      }
      for (const branch of branches) {
        const marker = !detached && branch === current ? ui.green('→') : ' ';
        info(`${marker} ${branch === current && !detached ? ui.cyan(branch) : branch}`);
      }
      if (detached) {
        warn(`HEAD is detached at ${shortHash(head)}. Go back with: ngit branch switch <name>`);
      }
      break;
    }

    case 'new': {
      const name = rest.find((arg) => !arg.startsWith('-'));
      if (!name) {
        die('Provide the branch name. Example: ngit branch new hotfix');
      }
      if (branches.includes(name)) {
        die(`The branch "${name}" already exists. To switch: ${ui.cyan(`ngit branch switch ${name}`)}`);
      }
      const code = await checkoutRef(root, head, { newBranch: name });
      if (code !== 0) {
        process.exitCode = code || 1;
        return;
      }
      console.log('');
      success(`Branch ${ui.bold(name)} created at ${shortHash(head)} (you are already on it)`);
      info(`  ${ui.dim('next steps:')} ${ui.cyan('ngit add .')}, ${ui.cyan('ngit commit -m "msg"')} and ${ui.cyan('ngit push')}`);
      break;
    }

    case 'switch': {
      const name = rest.find((arg) => !arg.startsWith('-'));
      if (!name) {
        die('Provide the branch. Example: ngit branch switch main');
      }
      if (!branches.includes(name)) {
        die(
          `The branch "${name}" does not exist.${branches.length ? ` Existing: ${branches.join(', ')}.` : ''}\n` +
            `To create it from the current commit: ${ui.cyan(`ngit branch new ${name}`)}`
        );
      }
      if (!detached && name === current) {
        info(`Already on ${ui.cyan(name)}. Nothing to do.`);
        return;
      }
      const code = await checkoutRef(root, name);
      if (code !== 0) {
        process.exitCode = code || 1;
        return;
      }
      console.log('');
      success(`Switched to branch ${ui.bold(name)}`);
      break;
    }

    case 'checkout': {
      const name = rest.find((arg) => !arg.startsWith('-'));
      if (!name) {
        die('Provide the branch. Example: ngit branch checkout main');
      }
      if (branches.includes(name)) {
        const code = await checkoutRef(root, name);
        if (code !== 0) {
          process.exitCode = code || 1;
          return;
        }
        console.log('');
        success(`Switched to branch ${ui.bold(name)}`);
      } else {
        const code = await checkoutRef(root, head, { newBranch: name });
        if (code !== 0) {
          process.exitCode = code || 1;
          return;
        }
        console.log('');
        success(`Branch ${ui.bold(name)} created at ${shortHash(head)} (you are already on it)`);
      }
      break;
    }

    default:
      die(`Unknown branch subcommand: "${sub}". Use: list, new, switch, checkout or help.`);
  }
}
