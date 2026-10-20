import { requireRepoRoot, runGitInteractive } from '../lib/git.js';
import { die } from '../lib/ui.js';

export async function addCommand(args) {
  await requireRepoRoot();
  if (args.length === 0) {
    die('Nada especificado. Use por exemplo: ngit add .');
  }
  const code = await runGitInteractive(['add', ...args], { cwd: process.cwd() });
  if (code !== 0) process.exitCode = code;
}
