import { spawn } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const colorEnabled =
  Boolean(output.isTTY) &&
  !process.env.NO_COLOR &&
  process.env.TERM !== 'dumb' &&
  !process.env.NGIT_NO_COLOR;

function ansi(code, text) {
  if (!colorEnabled) return String(text);
  return `\u001b[${code}m${text}\u001b[0m`;
}

export const ui = {
  bold: (text) => ansi('1', text),
  dim: (text) => ansi('2', text),
  red: (text) => ansi('31', text),
  green: (text) => ansi('32', text),
  yellow: (text) => ansi('33', text),
  blue: (text) => ansi('34', text),
  magenta: (text) => ansi('35', text),
  cyan: (text) => ansi('36', text),
  white: (text) => ansi('37', text),
};

export function info(message) {
  console.log(message);
}

export function success(message) {
  console.log(`${ui.green('✓')} ${message}`);
}

export function warn(message) {
  console.log(`${ui.yellow('!')} ${message}`);
}

export function fail(message) {
  console.error(`${ui.red('✗')} ${message}`);
}

export function die(message, code = 1) {
  const error = new Error(message);
  error.ngitHandled = true;
  error.exitCode = code;
  throw error;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let index = -1;
  do {
    value /= 1024;
    index += 1;
  } while (value >= 1024 && index < units.length - 1);
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
}

export function shortHash(hash, length = 7) {
  return hash ? String(hash).slice(0, length) : '';
}

export async function prompt(question, { defaultValue = '' } = {}) {
  const rl = readline.createInterface({ input, output });
  try {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    const answer = await rl.question(`${question}${suffix} `);
    return answer.trim() || defaultValue;
  } finally {
    rl.close();
  }
}

export function promptSecret(question) {
  if (!input.isTTY) {
    return prompt(question);
  }

  return new Promise((resolve, reject) => {
    let value = '';
    let settled = false;
    const wasRaw = input.isRaw;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      input.removeListener('data', onData);
      input.setRawMode(Boolean(wasRaw));
      input.pause();
      output.write('\n');
    };

    const finish = () => {
      if (settled) return;
      cleanup();
      resolve(value.trim());
    };

    const cancel = () => {
      if (settled) return;
      cleanup();
      const error = new Error('Login cancelled.');
      error.ngitHandled = true;
      reject(error);
    };

    const onData = (chunk) => {
      const text = String(chunk);
      for (const char of text) {
        if (char === '\u0003') {
          cancel();
          return;
        }
        if (char === '\r' || char === '\n') {
          finish();
          return;
        }
        if (char === '\u007f' || char === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            output.write('\b \b');
          }
          continue;
        }
        if (char === '\u001b') continue;
        if (char >= ' ') {
          value += char;
          output.write('*');
        }
      }
    };

    output.write(question);
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');
    input.on('data', onData);
  });
}

export function openBrowser(url) {
  let command;
  let args;

  if (process.platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', url];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch {
    return false;
  }
  return true;
}

export function printBanner() {
  console.log(`${ui.magenta('nostr')}${ui.bold('-git')} ${ui.dim('· decentralized git on Nostr + Blossom')}`);
}

export function createProgress(label, total) {
  const width = 28;
  let lastPercent = -1;
  let lastDetail = '';
  const enabled = Boolean(output.isTTY) && !process.env.NO_COLOR && process.env.TERM !== 'dumb';

  const render = (done, detail = '') => {
    const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 100;
    if (enabled) {
      const filled = Math.round((percent / 100) * width);
      const bar = `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
      const shownDetail = detail.length > 42 ? `${detail.slice(0, 39)}...` : detail;
      output.write(`\r${label} ${ui.cyan(bar)} ${String(percent).padStart(3)}% ${ui.dim(shownDetail)}`);
    } else if (percent !== lastPercent && (percent === 100 || percent - lastPercent >= 10)) {
      console.log(`${label} ${percent}%${detail ? ` · ${detail}` : ''}`);
    }
    lastPercent = percent;
    lastDetail = detail;
  };

  return {
    update(done, detail = '') {
      if (done >= total) return;
      if (detail !== lastDetail) render(done, detail);
    },
    done(detail = '') {
      if (enabled) {
        output.write(`\r${label} ${ui.cyan('█'.repeat(width))} 100% ${ui.dim(detail)}\n`);
      } else if (total > 0) {
        console.log(`${label} 100%${detail ? ` · ${detail}` : ''}`);
      }
    },
  };
}
