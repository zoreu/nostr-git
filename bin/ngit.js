#!/usr/bin/env node
import { main } from '../src/cli.js';

main(process.argv.slice(2)).catch((error) => {
  const message = error?.message || String(error);
  console.error(`\x1b[31mngit: erro:\x1b[0m ${message}`);
  if (!error?.ngitHandled && process.env.NGIT_DEBUG) {
    console.error(error?.stack || error);
  }
  process.exitCode = error?.exitCode || 1;
});
