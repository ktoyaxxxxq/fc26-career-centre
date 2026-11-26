const { spawn } = require('node:child_process');
const { readFile, stat } = require('node:fs/promises');
const { basename, dirname, extname, isAbsolute, join, normalize } = require('node:path');
const { createInterface } = require('node:readline');

const gameNames = ['FC26', 'FC26_Trial', 'FC26_Showcase'];
const executableNames = new Set(gameNames.map(name => `${name.toLowerCase()}.exe`));

async function isGameExecutable(path) {
  return typeof path === 'string' && isAbsolute(path) && executableNames.has(basename(path).toLowerCase()) &&
    await stat(path).then(item => item.isFile(), () => false);
}

async function resolveGameLauncher(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) return null;
  const extension = extname(path).toLowerCase();
  if (extension === '.exe') return await isGameExecutable(path) ? { path, kind: 'exe' } : null;
  const file = await stat(path).catch(() => null);
  if (!file?.isFile()) return null;
  if (extension === '.lnk') return { path, kind: 'shortcut' };
  if (extension !== '.url' || file.size > 8192) return null;
  const text = await readFile(path, 'utf8').catch(() => '');
  const uri = /^URL=(steam:\/\/(?:rungameid|run)\/3405690)\s*$/im.exec(text)?.[1];
  return uri ? { path, kind: 'steam', uri } : null;
}

async function findGameExecutable(configured) {
  const installs = [
    ...['C', 'D', 'E'].flatMap(drive => [
      `${drive}:/GAMES/EA SPORTS FC 26`, `${drive}:/EA Games/EA SPORTS FC 26`,
      `${drive}:/SteamLibrary/steamapps/common/EA SPORTS FC 26`, `${drive}:/Steam/steamapps/common/EA SPORTS FC 26`,
    ]),
    process.env.ProgramFiles && join(process.env.ProgramFiles, 'EA Games', 'EA SPORTS FC 26'),
    process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'Steam', 'steamapps', 'common', 'EA SPORTS FC 26'),
  ].filter(Boolean);
  for (const candidate of [configured, process.env.FC26_GAME_EXE, ...installs.map(directory => join(directory, 'FC26.exe'))]) {
    if (await isGameExecutable(candidate)) return normalize(candidate);
  }
  return null;
}

function powershell(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
}

function watchGame(onChange, onExit = () => {}) {
  if (process.platform !== 'win32') return null;
  const names = gameNames.map(name => `'${name}'`).join(',');
  const child = powershell(`
    $ErrorActionPreference = 'SilentlyContinue'
    $last = ''
    while (Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue) {
      $games = @(Get-Process -Name ${names} -ErrorAction SilentlyContinue)
      $game = $games | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
      if (!$game) { $game = $games | Select-Object -First 1 }
      $line = if ($game) { '{ "pid": ' + $game.Id + ', "ready": ' + (($game.MainWindowHandle -ne 0).ToString().ToLowerInvariant()) + ' }' } else { '{ "pid": null, "ready": false }' }
      if ($line -ne $last) { [Console]::WriteLine($line); $last = $line }
      Start-Sleep -Milliseconds 1700
    }
  `);
  const stream = createInterface({ input: child.stdout });
  stream.on('line', line => {
    let value;
    try { value = JSON.parse(line.trim()); } catch { return; }
    if ((value.pid === null || Number.isSafeInteger(value.pid) && value.pid > 0) && typeof value.ready === 'boolean') onChange(value);
  });
  child.once('error', () => {});
  child.once('close', onExit);
  return child;
}

async function launchGame(path) {
  if (!await isGameExecutable(path)) throw new Error('Нужен исполняемый файл FC 26.');
  return new Promise((resolve, reject) => {
    const game = spawn(path, [], { cwd: dirname(path), detached: true, stdio: 'ignore', windowsHide: false });
    game.once('error', reject);
    game.once('spawn', () => { game.unref(); resolve(); });
  });
}

function focusGame(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0 || process.platform !== 'win32') return Promise.resolve(false);
  const names = gameNames.map(name => `'${name}'`).join(',');
  return new Promise(resolve => {
    const helper = powershell(`
      $game = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
      if (!$game -or $game.ProcessName -notin @(${names}) -or $game.MainWindowHandle -eq 0) { exit 1 }
      Add-Type @'
      using System;
      using System.Runtime.InteropServices;
      public static class GameWindow {
        [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
        [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr window, int command);
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
        public static bool IsForeground(int expected) {
          uint pid;
          return GetWindowThreadProcessId(GetForegroundWindow(), out pid) != 0 && pid == expected;
        }
      }
'@
      $window = $game.MainWindowHandle
      if ([GameWindow]::IsForeground($game.Id)) { exit 0 }
      if ([GameWindow]::IsIconic($window)) { [void][GameWindow]::ShowWindowAsync($window, 9) }
      [void][GameWindow]::SetForegroundWindow($window)
      Start-Sleep -Milliseconds 110
      if (![GameWindow]::IsForeground($game.Id)) {
        $shell = New-Object -ComObject WScript.Shell
        [void]$shell.AppActivate($game.Id)
        Start-Sleep -Milliseconds 120
      }
      if ([GameWindow]::IsForeground($game.Id)) { exit 0 }
      exit 1
    `);
    helper.stdout.resume();
    const timer = setTimeout(() => { helper.kill(); resolve(false); }, 6500);
    helper.once('error', () => { clearTimeout(timer); resolve(false); });
    helper.once('exit', code => { clearTimeout(timer); resolve(code === 0); });
  });
}

module.exports = { findGameExecutable, focusGame, launchGame, resolveGameLauncher, watchGame };
