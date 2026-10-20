import path from 'node:path';
import {
  loadRepoConfig,
  sanitizeProjectName,
  saveRepoConfig,
  validateProjectName,
} from '../lib/config.js';
import { ensureGitInstalled, ensureNgitExcluded, findRepoRoot, runGitInteractive } from '../lib/git.js';
import { info, success, ui } from '../lib/ui.js';

export async function initCommand(args) {
  await ensureGitInstalled();

  const projectArg = args.find((arg) => !arg.startsWith('-'));
  const cwd = process.cwd();
  let root = await findRepoRoot(cwd);

  if (!root) {
    let code = await runGitInteractive(['init', '-b', 'main'], { cwd });
    if (code !== 0) {
      code = await runGitInteractive(['init'], { cwd });
    }
    if (code !== 0) throw new Error('Não foi possível inicializar o repositório Git.');
    root = cwd;
  } else if (path.resolve(cwd) !== path.resolve(root)) {
    throw new Error(
      `Você já está dentro de um repositório em ${root}. Rode ngit init na raiz do projeto.`
    );
  } else {
    const code = await runGitInteractive(['init'], { cwd: root });
    if (code !== 0) throw new Error('Não foi possível inicializar o repositório Git.');
  }

  ensureNgitExcluded(root);
  const existing = loadRepoConfig(root);
  const project = projectArg
    ? validateProjectName(projectArg)
    : existing?.project || sanitizeProjectName(path.basename(root));

  const config = saveRepoConfig(root, {
    ...(existing || {}),
    version: 1,
    project,
    createdAt: existing?.createdAt || new Date().toISOString(),
  });

  console.log('');
  success(`Repositório ngit configurado: ${ui.bold(`${config.owner || 'local'}/${project}`)}`);
  info(`  ${ui.dim('raiz:')}      ${root}`);
  info(`  ${ui.dim('metadata:')}  ${path.join(root, '.ngit', 'repo.json')}`);
  info('');
  info(`${ui.dim('Próximos passos:')} ngit login, ngit add ., ngit commit -m "primeiro commit"`);
}

