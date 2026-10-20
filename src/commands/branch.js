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
${ui.bold('Uso:')} ngit branch <subcomando> [opções]

${ui.bold('Subcomandos:')}
  ${ui.cyan('list')}                 Lista as branches locais (padrão quando sem subcomando)
  ${ui.cyan('new')} <nome>           Cria uma branch nova a partir do commit atual e troca para ela
  ${ui.cyan('switch')} <nome>        Troca para uma branch existente
  ${ui.cyan('checkout')} <nome>      Troca se a branch existir; senão cria e troca

${ui.bold('Exemplos:')}
  ngit branch list
  ngit branch new hotfix
  ngit branch switch main
  ngit branch checkout experimento
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
        info(`${ui.dim('(nenhuma branch ainda — faça um commit ou use')} ${ui.cyan('ngit branch new main')}${ui.dim(')')}`);
      }
      for (const branch of branches) {
        const marker = !detached && branch === current ? ui.green('→') : ' ';
        info(`${marker} ${branch === current && !detached ? ui.cyan(branch) : branch}`);
      }
      if (detached) {
        warn(`HEAD destacado em ${shortHash(head)}. Volte com: ngit branch switch <nome>`);
      }
      break;
    }

    case 'new': {
      const name = rest.find((arg) => !arg.startsWith('-'));
      if (!name) {
        die('Informe o nome da branch. Exemplo: ngit branch new hotfix');
      }
      if (branches.includes(name)) {
        die(`A branch "${name}" já existe. Para trocar: ${ui.cyan(`ngit branch switch ${name}`)}`);
      }
      const code = await checkoutRef(root, head, { newBranch: name });
      if (code !== 0) {
        process.exitCode = code || 1;
        return;
      }
      console.log('');
      success(`Branch ${ui.bold(name)} criada em ${shortHash(head)} (você já está nela)`);
      info(`  ${ui.dim('próximos passos:')} ${ui.cyan('ngit add .')}, ${ui.cyan('ngit commit -m "msg"')} e ${ui.cyan('ngit push')}`);
      break;
    }

    case 'switch': {
      const name = rest.find((arg) => !arg.startsWith('-'));
      if (!name) {
        die('Informe a branch. Exemplo: ngit branch switch main');
      }
      if (!branches.includes(name)) {
        die(
          `A branch "${name}" não existe.${branches.length ? ` Existentes: ${branches.join(', ')}.` : ''}\n` +
            `Para criar a partir do commit atual: ${ui.cyan(`ngit branch new ${name}`)}`
        );
      }
      if (!detached && name === current) {
        info(`Já está em ${ui.cyan(name)}. Nada a fazer.`);
        return;
      }
      const code = await checkoutRef(root, name);
      if (code !== 0) {
        process.exitCode = code || 1;
        return;
      }
      console.log('');
      success(`Trocou para a branch ${ui.bold(name)}`);
      break;
    }

    case 'checkout': {
      const name = rest.find((arg) => !arg.startsWith('-'));
      if (!name) {
        die('Informe a branch. Exemplo: ngit branch checkout main');
      }
      if (branches.includes(name)) {
        const code = await checkoutRef(root, name);
        if (code !== 0) {
          process.exitCode = code || 1;
          return;
        }
        console.log('');
        success(`Trocou para a branch ${ui.bold(name)}`);
      } else {
        const code = await checkoutRef(root, head, { newBranch: name });
        if (code !== 0) {
          process.exitCode = code || 1;
          return;
        }
        console.log('');
        success(`Branch ${ui.bold(name)} criada em ${shortHash(head)} (você já está nela)`);
      }
      break;
    }

    default:
      die(`Subcomando de branch desconhecido: "${sub}". Use: list, new, switch, checkout ou help.`);
  }
}
