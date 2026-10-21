import { readFileSync } from 'node:fs';
import { info, printBanner, ui } from './lib/ui.js';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);

const HELP = `
${ui.bold('Usage:')} ngit <command> [options]

${ui.bold('Commands:')}
  ${ui.cyan('init')} [project] [-d "description"]    Initializes Git and the ngit metadata
  ${ui.cyan('login')} [--generate]                 Saves your Nostr identity (nsec)
  ${ui.cyan('add')} <files...>                     Adds files to the Git index
  ${ui.cyan('commit')} [-m "message"]              Creates a commit
  ${ui.cyan('push')}                               Publishes commits, bundle and files to Nostr/Blossom
  ${ui.cyan('describe')} "text" [--clear]          Updates the repository description and republishes it
  ${ui.cyan('clone')} <npub.../project> [folder]   Clones a repository from Nostr
  ${ui.cyan('version')} <sub>                      Creates/lists versions and switches to a version or hash
  ${ui.cyan('branch')} <sub>                       List/create/switch branch
  ${ui.cyan('web')} [npub.../project]              Opens the web interface to browse repositories
  ${ui.cyan('whoami')}                             Shows the logged-in identity
  ${ui.cyan('help')}                               Shows this help

${ui.bold('Login options:')}
  --generate                 Creates a new identity and shows the nsec once
  --relays a,b               Sets Nostr relays
  --blossom a,b              Sets Blossom servers

${ui.bold('Web options:')}
  --port 3737                Local port (default: 3737)
  --host 127.0.0.1           Listen address
  --no-open                  Does not open the browser automatically

${ui.bold('Version options:')}
  ngit version list                            Lists the versions (vSemVer tags)
  ngit version create [vX.Y.Z] [--patch]       Creates a version (annotated tag)
  ngit version switch <version|hash|latest>    Switches the repo to a version/commit
  See all details with: ngit version help

${ui.bold('Examples:')}
  ngit init -d "My decentralized project"
  ngit describe "A tool for publishing on Nostr"
  ngit login --generate
  ngit add .
  ngit commit -m "first commit"
  ngit version create v1.0.0
  ngit push
  ngit clone npub1abc.../my-project
  ngit version switch v1.0.0
  ngit version switch a1b2c3d
  ngit branch list
  ngit branch new hotfix
  ngit branch switch main
  ngit web npub1abc.../my-project

${ui.bold('Environment variables:')}
  NGIT_NSEC                  Private key for login without prompt
  NGIT_RELAYS                Comma-separated list of relays
  NGIT_BLOSSOM_SERVERS       Comma-separated list of Blossom servers
  NGIT_CONFIG                Alternative path for config.json
`;

function wantsHelp(args) {
  return args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h';
}

export async function main(argv) {
  if (argv[0] === '--version' || argv[0] === '-v') {
    info(packageJson.version);
    return;
  }

  if (wantsHelp(argv)) {
    printBanner();
    info(HELP);
    return;
  }

  const [command, ...args] = argv;

  switch (command) {
    case 'init': {
      const { initCommand } = await import('./commands/init.js');
      await initCommand(args);
      break;
    }
    case 'login': {
      const { loginCommand } = await import('./commands/login.js');
      await loginCommand(args);
      break;
    }
    case 'whoami': {
      const { whoamiCommand } = await import('./commands/login.js');
      whoamiCommand(args);
      break;
    }
    case 'add': {
      const { addCommand } = await import('./commands/add.js');
      await addCommand(args);
      break;
    }
    case 'commit': {
      const { commitCommand } = await import('./commands/commit.js');
      await commitCommand(args);
      break;
    }
    case 'push': {
      const { pushCommand } = await import('./commands/push.js');
      await pushCommand(args);
      break;
    }
    case 'describe': {
      const { describeCommand } = await import('./commands/describe.js');
      await describeCommand(args);
      break;
    }
    case 'clone': {
      const { cloneCommand } = await import('./commands/clone.js');
      await cloneCommand(args);
      break;
    }
    case 'version': {
      const { versionCommand } = await import('./commands/version.js');
      await versionCommand(args);
      break;
    }
    case 'branch': {
      const { branchCommand } = await import('./commands/branch.js');
      await branchCommand(args);
      break;
    }
    case 'web': {
      const { webCommand } = await import('./commands/web.js');
      await webCommand(args);
      break;
    }
    default: {
      printBanner();
      console.error(`\nUnknown command: ${command}\n`);
      info(HELP);
      process.exitCode = 1;
    }
  }
}
