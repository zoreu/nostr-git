import { requireRepoRoot, runGitInteractive } from '../lib/git.js';

export async function commitCommand(args) {
  await requireRepoRoot();
  const commitArgs = args.length > 0 ? args : [];
  const code = await runGitInteractive(['commit', ...commitArgs], {
    cwd: process.cwd(),
  });
  if (code !== 0) process.exitCode = code;
}
