const { spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const script = readFileSync(join(__dirname, 'game-control.ps1'), 'utf8');
const gameActions = Object.freeze(['day', 'next', 'play', 'sim', 'tactics']);

function isGameBinding(value) {
  return Boolean(value && ['x', 'y', 'width', 'height'].every(key => Number.isInteger(value[key])) && value.x >= 0 && value.y >= 0 &&
    value.x < value.width && value.y < value.height && value.width >= 640 && value.height >= 400 && value.width <= 12000 && value.height <= 12000 &&
    typeof value.sample === 'string' && /^[A-Za-z0-9+/]{1536}$/.test(value.sample));
}

function verifyGameControl(mode, pid, binding) {
  if (process.platform !== 'win32' || !Number.isSafeInteger(pid) || pid <= 0 || !['capture', 'press'].includes(mode) || mode === 'press' && !isGameBinding(binding)) {
    return Promise.resolve({ ok: false, code: 'unavailable' });
  }
  const options = Buffer.from(JSON.stringify({ mode, pid, binding }), 'utf8').toString('base64');
  const inline = `$payload='${options}'\n${script}`;
  const encoded = Buffer.from(inline, 'utf16le').toString('base64');
  return new Promise(resolve => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { if (output.length < 8192) output += chunk; });
    const timeout = setTimeout(() => { child.kill(); resolve({ ok: false, code: 'timeout' }); }, 6500);
    child.once('error', () => { clearTimeout(timeout); resolve({ ok: false, code: 'unavailable' }); });
    child.once('close', () => {
      clearTimeout(timeout);
      try {
        const value = JSON.parse(output.trim());
        if (value.binding && !isGameBinding(value.binding)) throw new Error('Invalid sample');
        resolve(value);
      } catch { resolve({ ok: false, code: 'unavailable' }); }
    });
  });
}

module.exports = { gameActions, isGameBinding, verifyGameControl };
