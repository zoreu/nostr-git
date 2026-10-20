import { readFileSync } from 'node:fs';
import { info, printBanner, ui } from './lib/ui.js';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);

const HELP = `
${ui.bold('Uso:')} ngit <comando> [opções]

${ui.bold('Comandos:')}
  ${ui.cyan('init')} [projeto]                    Inicializa o Git e os metadados ngit
  ${ui.cyan('login')} [--generate]                Salva sua identidade Nostr (nsec)
  ${ui.cyan('add')} <arquivos...>                  Adiciona arquivos ao índice Git
  ${ui.cyan('commit')} [-m "mensagem"]             Cria um commit
  ${ui.cyan('push')}                               Publica commits, bundle e arquivos no Nostr/Blossom
  ${ui.cyan('clone')} <npub.../projeto> [pasta]    Clona um repositório a partir do Nostr
  ${ui.cyan('version')} <sub>                      Cria/lista versões e troca para uma versão ou hash
  ${ui.cyan('branch')} <sub>                       Lista/cria/troca de branch
  ${ui.cyan('web')} [npub.../projeto]              Abre a interface web para navegar nos repositórios
  ${ui.cyan('whoami')}                             Mostra a identidade logada
  ${ui.cyan('help')}                               Mostra esta ajuda

${ui.bold('Opções de login:')}
  --generate                 Cria uma identidade nova e mostra o nsec uma única vez
  --relays a,b               Define relays Nostr
  --blossom a,b              Define servidores Blossom

${ui.bold('Opções de web:')}
  --port 3737                Porta local (padrão: 3737)
  --host 127.0.0.1           Endereço de escuta
  --no-open                  Não abre o navegador automaticamente

${ui.bold('Opções de version:')}
  ngit version list                            Lista as versões (tags vSemVer)
  ngit version create [vX.Y.Z] [--patch]       Cria uma versão (tag anotada)
  ngit version switch <versão|hash|latest>     Troca o repo para uma versão/commit
  Veja todos os detalhes com: ngit version help

${ui.bold('Exemplos:')}
  ngit init
  ngit login --generate
  ngit add .
  ngit commit -m "primeiro commit"
  ngit version create v1.0.0
  ngit push
  ngit clone npub1abc.../meu-projeto
  ngit version switch v1.0.0
  ngit version switch a1b2c3d
  ngit branch list
  ngit branch new hotfix
  ngit branch switch main
  ngit web npub1abc.../meu-projeto

${ui.bold('Variáveis de ambiente:')}
  NGIT_NSEC                  Chave privada para login sem prompt
  NGIT_RELAYS                Lista de relays separada por vírgula
  NGIT_BLOSSOM_SERVERS       Lista de servidores Blossom separada por vírgula
  NGIT_CONFIG                Caminho alternativo para o config.json
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
      console.error(`\nComando desconhecido: ${command}\n`);
      info(HELP);
      process.exitCode = 1;
    }
  }
}
