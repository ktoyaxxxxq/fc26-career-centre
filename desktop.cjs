const { app, BrowserWindow, Menu, Tray, nativeImage, globalShortcut, dialog, ipcMain, protocol, net, shell, clipboard } = require('electron');
const { readFile, readdir, stat, writeFile, rename, mkdir } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { homedir } = require('node:os');
const { basename, join, resolve, sep } = require('node:path');
const { pathToFileURL } = require('node:url');
const { Worker } = require('node:worker_threads');
const { createImageStore } = require('./images.cjs');
const { findGameExecutable, focusGame, launchGame, resolveGameLauncher, watchGame } = require('./game-link.cjs');
const { gameActions, isGameBinding, verifyGameControl } = require('./game-control.cjs');
const { createWorldNews, newsArticleUrl } = require('./news-feed.cjs');
const { findArchive, rememberArchive, snapshot } = require('./ui/archive.mjs');

const ui = join(__dirname, 'ui');
const panelUrl = 'career://app/index.html';
protocol.registerSchemesAsPrivileged([{ scheme: 'career', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const verifyOverlay = process.argv.includes('--verify-overlay');
const verify = verifyOverlay || process.argv.includes('--verify');
const background = process.argv.includes('--background');
if (verify) app.setPath('userData', join(__dirname, 'preview', `test-profile-${process.pid}-${Date.now()}`));
const saveFolders = [...new Set([process.env.LOCALAPPDATA, join(homedir(), 'AppData', 'Local')].filter(Boolean))]
  .map(directory => join(directory, 'EA SPORTS FC 26', 'settings'));
const defaultFolder = saveFolders.at(-1);
const shortcut = 'F10';
const login = { name: 'FC26CareerCentre', path: process.execPath, args: app.isPackaged ? ['--background'] : [__dirname, '--background'] };
let window;
let tray;
let worker;
let source = null;
let followLatest = true;
let stamp = null;
let fingerprint;
let retryAt = 0;
let polling = false;
let importing = false;
let quitting = false;
let hotkey = false;
let history = {};
let archiveIndex = {};
let current = { state: 'demo', career: null, message: '' };
let game = { pid: null, ready: false };
let gamePath, gameWatcher, openedGame;
let gameAuto = true, openToken = 0, launchingUntil = 0;
let gameSettingsWrite = Promise.resolve();
let controls = {}, bindingAction = null, bindingTimeout, sendingControl = false;
let followGameSaveUntil = 0, checkedGameSave = '';
let armedFocus = null;
const controlMessages = {
  foreground: 'Открой окно FC 26 и проверь, что оно активно.',
  position: 'Наведи курсор на центр нужной кнопки внутри окна игры.',
  detail: 'Участок экрана слишком однородный. Наведи курсор на текст кнопки и снова нажми F8.',
  screen: 'Экран FC 26 отличается от записанного. Открой нужное меню или запиши кнопку заново.',
  size: 'Размер окна FC 26 изменился. Запиши кнопку заново в текущем режиме экрана.',
  input: 'Windows не передала клик в FC 26. Сверь уровень прав игры и панели.',
};
const { promise: firstGameState, resolve: onFirstGameState } = Promise.withResolvers();

const disk = name => join(app.getPath('userData'), name);
const artwork = createImageStore({ cache: disk('images'), nativeImage, fetch: (url, options) => net.fetch(url, options) });
const readWorldNews = createWorldNews((url, options) => net.fetch(url, options));
const identity = file => createHash('sha256').update(file.toLowerCase()).digest('hex').slice(0, 20);
const version = file => `${file.size}:${file.mtimeMs}`;
async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return {}; }
}
async function writeJson(path, data) {
  await mkdir(app.getPath('userData'), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(data), 'utf8');
  await rename(`${path}.tmp`, path);
}
function status() {
  const archives = Object.entries(archiveIndex.careers ?? {}).map(([id, { title, season, date }]) => ({ id, title, season, date }));
  return { ...current, source: source ? basename(source) : null, followLatest, hotkey, shortcut, archives, artwork: artwork.status(), startup: !verify && app.getLoginItemSettings(login).openAtLogin, game: gameStatus() };
}
function publish(value) {
  current = { ...current, ...value };
  if (window && !window.isDestroyed()) window.webContents.send('career:update', status());
  if (maybeOpenKickoff()) sendGame();
}

function gameStatus(message = '') { return { ...game, path: gamePath ?? null, autoOpen: gameAuto, openToken, message, actions: Object.keys(controls), binding: bindingAction, awaitingFocus: Boolean(armedFocus) }; }
function sendGame(message = '') {
  if (window && !window.isDestroyed()) window.webContents.send('career:game-update', gameStatus(message));
}
function maybeOpenKickoff() {
  if (!gameAuto || !game.ready || !current.career || current.state === 'loading' || openedGame === game.pid || !window || window.isDestroyed() || window.webContents.isLoadingMainFrame()) return false;
  openedGame = game.pid;
  openToken++;
  raise();
  return true;
}
function startGameWatch() {
  gameWatcher = watchGame(value => {
    if (value.pid !== game.pid) openedGame = null;
    game = value;
    onFirstGameState();
    maybeOpenKickoff();
    sendGame();
  }, () => { if (!quitting) setTimeout(startGameWatch, 5000).unref(); });
}
function saveGameSettings() {
  const settings = { path: gamePath, autoOpen: gameAuto, controls };
  gameSettingsWrite = gameSettingsWrite.catch(() => {}).then(() => writeJson(disk('game-settings.json'), settings));
  return gameSettingsWrite;
}
async function returnToGame() {
  if (!game.ready) return false;
  window.setAlwaysOnTop(false);
  const focused = await focusGame(game.pid);
  if (focused) window.hide();
  return focused;
}
function endBinding() {
  clearTimeout(bindingTimeout);
  if (bindingAction) globalShortcut.unregister('F8');
  bindingAction = null;
}
async function captureControl() {
  const action = bindingAction;
  if (!action || sendingControl) return;
  sendingControl = true;
  try {
    const result = await verifyGameControl('capture', game.pid);
    if (action !== bindingAction) return;
    if (!result.ok || !result.binding) {
      raise();
      return sendGame(controlMessages[result.code] || 'Не удалось прочитать участок игры. Используй оконный режим без рамки.');
    }
    controls = { ...controls, [action]: result.binding };
    await saveGameSettings();
    endBinding();
    raise();
    sendGame('Кнопка FC 26 записана.');
  } catch { sendGame('Не удалось сохранить кнопку FC 26.'); }
  finally { sendingControl = false; }
}
async function startBinding(action) {
  if (!gameActions.includes(action) || !game.ready || verify) return gameStatus('Сначала открой карьеру в FC 26.');
  if (sendingControl) return gameStatus('Дождись завершения текущего действия.');
  endBinding();
  if (!globalShortcut.register('F8', captureControl)) return gameStatus('F8 занята другим приложением.');
  bindingAction = action;
  bindingTimeout = setTimeout(() => { endBinding(); sendGame('Время записи кнопки истекло.'); }, 120_000);
  await returnToGame();
  return gameStatus('В FC 26 наведи курсор на текст нужной кнопки и нажми F8.');
}
function waitForGameFocus() {
  return new Promise(resolve => {
    let timeout;
    const finish = ready => {
      clearTimeout(timeout);
      globalShortcut.unregister('F9');
      armedFocus = null;
      resolve(ready);
    };
    if (!globalShortcut.register('F9', () => finish(true))) { resolve(false); return; }
    armedFocus = finish;
    timeout = setTimeout(() => finish(false), 30_000);
    sendGame('Переключись в FC 26 через Alt + Tab и нажми F9 на нужном экране.');
  });
}
async function executeGameAction(action) {
  if (!gameActions.includes(action) || !controls[action]) return { ...gameStatus('Сначала запиши эту кнопку FC 26.'), sent: false };
  if (!game.ready || verify || current.career?.kind !== 'save') return { ...gameStatus('Открой FC 26 с подключённой карьерой.'), sent: false };
  if (sendingControl || bindingAction) return { ...gameStatus('Дождись завершения настройки или текущего действия.'), sent: false };
  sendingControl = true;
  try {
    const pid = game.pid;
    if (!await returnToGame() && !await waitForGameFocus()) return { ...gameStatus('Команда отменена. Открой экран FC 26 и повтори.'), sent: false };
    await new Promise(resolve => setTimeout(resolve, 160));
    const result = await verifyGameControl('press', pid, controls[action]);
    if (!result.ok) { raise(); return { ...gameStatus(controlMessages[result.code] || 'FC 26 не приняла действие.'), sent: false }; }
    window.hide();
    if (action !== 'tactics') followGameSaveUntil = Date.now() + 30 * 60_000;
    return { ...gameStatus('Команда передана в FC 26.'), sent: true };
  } finally { sendingControl = false; }
}
async function openGame(leavePanel = true) {
  if (!verify) {
    let timer;
    await Promise.race([firstGameState, new Promise(resolve => { timer = setTimeout(resolve, 1800); })]);
    clearTimeout(timer);
  }
  if (game.ready) {
    if (!leavePanel) return gameStatus();
    if (await returnToGame()) return gameStatus();
    return gameStatus('Windows не перевела фокус в FC 26. Переключись через Alt + Tab.');
  }
  if (game.pid || Date.now() < launchingUntil) return gameStatus('FC 26 запускается.');
  if (!gamePath) return gameStatus('Укажи файл игры или ярлык запуска в настройках.');
  launchingUntil = Date.now() + 20000;
  try {
    const launcher = await resolveGameLauncher(gamePath);
    if (!launcher) throw new Error('Invalid launch path');
    if (launcher.kind === 'steam') await shell.openExternal(launcher.uri);
    else if (launcher.kind === 'shortcut') {
      if (await shell.openPath(launcher.path)) throw new Error('Shortcut launch failed');
    } else await launchGame(launcher.path);
    return gameStatus('Запускаю EA SPORTS FC 26.');
  } catch {
    launchingUntil = 0;
    return gameStatus('Не удалось запустить FC 26. Проверь файл игры или ярлык.');
  }
}

async function newestSave() {
  const entries = await Promise.all(saveFolders.map(async folder => {
    try { return (await readdir(folder, { withFileTypes: true })).filter(f => f.isFile()).map(f => ({ folder, name: f.name })); } catch { return []; }
  }));
  const confirmed = await Promise.all(entries.flat().filter(f => /^(cmmgr|cmpro|cmplr|managercareer|playercareer)/i.test(f.name) && !/^cm(mgr|pro|plr)[cl]c/i.test(f.name)).map(async f => {
    const path = join(f.folder, f.name);
    try { return { path, info: await stat(path) }; } catch { return null; }
  }));
  return confirmed.filter(Boolean).sort((a, b) => b.info.mtimeMs - a.info.mtimeMs)[0]?.path ?? null;
}

async function chooseSource(file, auto = false) {
  source = file;
  followLatest = auto;
  stamp = null;
  fingerprint = null;
  retryAt = 0;
  history = {};
  publish({ career: current.career, message: '', state: file ? 'loading' : 'demo' });
  await writeJson(disk('settings.json'), { source: file, followLatest }).catch(console.error);
  void poll();
}

function decode(file) {
  worker ??= new Worker(join(__dirname, 'save-worker.mjs'));
  return new Promise((resolve, reject) => {
    const error = failure => {
      worker?.removeListener('message', reply);
      worker = null;
      reject(failure);
    };
    const reply = value => {
      worker?.removeListener('error', error);
      resolve(value);
    };
    worker.once('message', reply);
    worker.once('error', error);
    worker.postMessage({ file, key: identity(file) });
  });
}

async function poll() {
  if (verify || polling || importing || Date.now() < retryAt) return;
  polling = true;
  let file = source;
  try {
    let prepared;
    if (followLatest) {
      const first = await newestSave();
      if (source === file && first && first !== file) {
        await chooseSource(first, true);
        return;
      }
    }
    if (!file) return;
    if (!followLatest && followGameSaveUntil > Date.now() && current.career?.archiveSignature) {
      const newer = await newestSave();
      if (source !== file) return;
      if (newer && newer !== file) {
        const info = await stat(newer).catch(() => null);
        const candidate = info && `${newer}/${version(info)}`;
        if (info && candidate !== checkedGameSave && info.mtimeMs > Date.parse(current.career.modified) && Date.now() - info.mtimeMs >= 650) {
          checkedGameSave = candidate;
          const result = await decode(newer);
          if (source !== file) return;
          if (result.career?.archiveSignature === current.career.archiveSignature && findArchive(archiveIndex, result.career) === current.career.archiveId && (result.career.date ?? 0) >= (current.career.date ?? 0)) {
            source = file = newer;
            prepared = result;
            stamp = null;
            await writeJson(disk('settings.json'), { source, followLatest }).catch(console.error);
          }
        }
      }
    }
    const info = await stat(file);
    if (version(info) === stamp || source !== file) return;
    if (Date.now() - info.mtimeMs < 650) return;
    const result = prepared ?? await decode(file);
    if (source !== file || result.retry) return;
    if (result.error) throw new Error(result.error);
    stamp = `${result.size}:${result.mtime}`;
    retryAt = 0;
    if (result.fingerprint === fingerprint) return;
    fingerprint = result.fingerprint;
    const career = result.career;
    const archiveId = findArchive(archiveIndex, career) ?? career.key;
    const knownArchive = await readJson(disk(`history-${archiveId}.json`));
    if (source !== file) return;
    history = knownArchive;
    if (career.season) {
      history[career.season] = snapshot(career, history[career.season]);
      await writeJson(disk(`history-${archiveId}.json`), history).catch(console.error);
    }
    rememberArchive(archiveIndex, archiveId, career);
    await writeJson(disk('history-index.json'), archiveIndex).catch(console.error);
    career.saveKey = career.key;
    career.archiveId = archiveId;
    career.key = archiveId;
    career.history = Object.fromEntries(Object.entries(history).filter(([season]) => season !== career.season));
    career.seasonArchive = history[career.season];
    career.telemetry = await readJson(disk(`telemetry-${archiveId}.json`));
    if (source === file) publish({ career, state: 'synced', message: '' });
  } catch (error) {
    if (source === file) {
      retryAt = Date.now() + 5000;
      publish({ state: 'error', message: error.code === 'ENOENT' ? 'Сейв перемещён или удалён. Выбери другой файл.' : `Не удалось прочитать сейв FC 26. ${error.message}` });
    }
  } finally {
    polling = false;
  }
}

function raise() {
  if (!window) return;
  window.show();
  window.setAlwaysOnTop(true, 'pop-up-menu');
  window.focus();
}
function toggle() {
  if (window?.isVisible()) window.hide();
  else raise();
}

function fromPanel(event) {
  const frame = event.senderFrame;
  return event.sender === window?.webContents && frame?.parent === null && frame.url === panelUrl;
}

async function boot() {
  const artworkSettings = await readJson(disk('image-settings.json'));
  const gameSettings = await readJson(disk('game-settings.json'));
  gameAuto = gameSettings.autoOpen !== false;
  controls = Object.fromEntries(gameActions.filter(action => isGameBinding(gameSettings.controls?.[action])).map(action => [action, gameSettings.controls[action]]));
  gamePath = (await resolveGameLauncher(gameSettings.path))?.path ?? await findGameExecutable();
  if (artworkSettings.folder) await artwork.setFolder(artworkSettings.folder);
  protocol.handle('career', async request => {
    const url = new URL(request.url);
    if (url.hostname !== 'app') return new Response(null, { status: 404 });
    const media = /^\/media\/(players|teams)\/(\d{1,9})\.png$/.exec(url.pathname);
    if (media) {
      const buffer = await artwork.image(media[1], Number(media[2]));
      const headers = { 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff' };
      return buffer ? new Response(buffer, { headers: { ...headers, 'Cache-Control': 'private, max-age=86400' } })
        : new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    const path = resolve(ui, `.${decodeURIComponent(url.pathname)}`);
    if (!path.startsWith(`${ui}${sep}`)) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(path).href);
  });
  window = new BrowserWindow({
    width: 1440, height: 960, minWidth: 580, minHeight: 500, backgroundColor: '#101512',
    title: 'Пятый тайм · FC 26', show: false, alwaysOnTop: true, autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: !verify },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('close', event => {
    if (!quitting && !verify) { event.preventDefault(); window.hide(); }
  });
  Menu.setApplicationMenu(null);
  ipcMain.handle('career:state', () => status());
  ipcMain.handle('career:hide', () => window.hide());
  ipcMain.handle('career:reveal', event => {
    if (!fromPanel(event)) return false;
    raise();
    return true;
  });
  ipcMain.handle('career:worldNews', event => fromPanel(event) ? readWorldNews() : { error: 'Новости недоступны.' });
  ipcMain.handle('career:openNews', async (event, value) => {
    if (!fromPanel(event)) return false;
    const url = newsArticleUrl(value);
    return url ? shell.openExternal(url).then(() => true, () => false) : false;
  });
  ipcMain.handle('career:copyPlan', (event, text) => {
    if (!fromPanel(event) || typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 32_768 || !text.trim()) return false;
    try {
      clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle('career:openGame', () => openGame());
  ipcMain.handle('career:returnGame', async event => {
    if (!fromPanel(event)) return { ...gameStatus(), focused: false };
    const focused = await returnToGame();
    if (focused) followGameSaveUntil = Date.now() + 30 * 60_000;
    return { ...gameStatus(focused ? '' : game.ready ? 'Windows не перевела фокус. Переключись через Alt + Tab.' : 'Сначала запусти FC 26 привычным способом.'), focused };
  });
  ipcMain.handle('career:bindGame', (event, action) => fromPanel(event) ? startBinding(action) : gameStatus());
  ipcMain.handle('career:cancelBinding', event => { if (fromPanel(event)) { endBinding(); armedFocus?.(false); } return gameStatus(); });
  ipcMain.handle('career:gameAction', (event, action) => fromPanel(event) ? executeGameAction(action) : { ...gameStatus(), sent: false });
  ipcMain.handle('career:gameAuto', async (_event, enabled) => {
    gameAuto = Boolean(enabled);
    await saveGameSettings();
    return gameStatus();
  });
  ipcMain.handle('career:chooseGame', async (_event, path) => {
    let candidate = typeof path === 'string' ? path.trim().replace(/^"(.*)"$/, '$1') : null;
    if (candidate == null) {
      const result = await dialog.showOpenDialog(window, {
        title: 'Выбери файл или ярлык запуска FC 26', properties: ['openFile'], defaultPath: gamePath ?? undefined,
        filters: [{ name: 'Файл игры или ярлык', extensions: ['exe', 'lnk', 'url'] }],
      });
      if (result.canceled) return gameStatus();
      candidate = result.filePaths[0];
    }
    const launcher = await resolveGameLauncher(candidate);
    if (!launcher) return gameStatus('Выбери FC26.exe, ярлык Windows или ярлык Steam для FC 26.');
    if (launcher.kind === 'shortcut') {
      try { shell.readShortcutLink(launcher.path); }
      catch { return gameStatus('Windows не смогла открыть этот ярлык.'); }
    }
    gamePath = launcher.path;
    await saveGameSettings();
    return gameStatus('Путь к EA SPORTS FC 26 сохранён.');
  });
  ipcMain.handle('career:choose', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Выбери сейв карьеры FC 26', properties: ['openFile'],
      defaultPath: source ?? defaultFolder ?? undefined,
    });
    if (!result.canceled && result.filePaths[0]) await chooseSource(result.filePaths[0]);
    return status();
  });
  ipcMain.handle('career:resume', async () => {
    const file = await newestSave();
    if (file) await chooseSource(file, true);
    else publish({ message: 'В стандартной папке нет сейвов FC 26. Можно выбрать файл вручную.' });
    return status();
  });
  ipcMain.handle('career:images', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Папка с экспортом портретов и эмблем FC 26', properties: ['openDirectory'],
      defaultPath: artwork.status().folder,
    });
    if (!result.canceled && result.filePaths[0]) {
      await artwork.setFolder(result.filePaths[0]);
      await writeJson(disk('image-settings.json'), { folder: result.filePaths[0] }).catch(console.error);
      const { players, teams } = artwork.status();
      publish({ message: `Найдено в папке: ${players} портретов, ${teams} эмблем.` });
    }
    return status();
  });
  ipcMain.handle('career:startup', (_event, enabled) => {
    if (!verify) app.setLoginItemSettings({ ...login, openAtLogin: Boolean(enabled) });
    return status();
  });
  ipcMain.handle('career:linkArchive', async (_event, id) => {
    if (typeof id !== 'string' || !Object.hasOwn(archiveIndex.careers ?? {}, id) || !source || !current.career?.saveKey) return status();
    archiveIndex.paths ??= {};
    archiveIndex.paths[current.career.saveKey] = id;
    await writeJson(disk('history-index.json'), archiveIndex);
    stamp = null;
    fingerprint = null;
    void poll();
    return status();
  });
  ipcMain.handle('career:importArchive', async () => {
    const career = current.career;
    if (!career?.archiveId || importing) return status();
    const result = await dialog.showOpenDialog(window, {
      title: 'Добавить старые сейвы этой карьеры в архив',
      properties: ['openFile', 'multiSelections'],
      defaultPath: defaultFolder,
    });
    if (result.canceled) return status();
    importing = true;
    try {
      const deadline = Date.now() + 15_000;
      while (polling && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 80));
      if (polling) return { ...status(), message: 'Сейв ещё читается. Попробуй снова после синхронизации.' };
      if (current.career?.archiveId !== career.archiveId) return status();
      const path = disk(`history-${career.archiveId}.json`);
      const archive = await readJson(path);
      let added = 0, skipped = 0;
      for (const file of result.filePaths) {
        const reading = await decode(file).catch(() => null);
        const old = reading?.career;
        if (!old?.season || old.mode !== career.mode || !old.archiveSignature || old.archiveSignature !== career.archiveSignature) {
          skipped++;
          continue;
        }
        archive[old.season] = snapshot(old, archive[old.season]);
        archiveIndex.paths ??= {};
        archiveIndex.paths[old.key] = career.archiveId;
        added++;
      }
      if (added) {
        await writeJson(path, archive);
        await writeJson(disk('history-index.json'), archiveIndex);
      }
      const message = `В архив добавлено файлов: ${added}.${skipped ? ` Пропущено: ${skipped}. Эти файлы не удалось отнести к текущей карьере.` : ''}`;
      if (current.career?.archiveId === career.archiveId) {
        publish({ career: { ...current.career, seasonArchive: archive[career.season], history: Object.fromEntries(Object.entries(archive).filter(([year]) => year !== career.season)) }, message });
      }
      return status();
    } finally {
      importing = false;
    }
  });
  ipcMain.handle('career:telemetry', async (_event, matchId, rows) => {
    const career = current.career;
    const match = career?.fixtures.find(m => m.id === matchId && m.played);
    if (!match || !career.archiveId || !Array.isArray(rows) || rows.length > 80) return status();
    const fields = ['passes', 'completedPasses', 'dribbles', 'completedDribbles', 'shots', 'shotsOnTarget', 'tackles', 'xg', 'xa'];
    const clean = rows.filter(row => Number.isSafeInteger(row?.playerId) && row.playerId > 0).map(row => Object.fromEntries([
      ['playerId', row.playerId], ...([match.homeId, match.awayId].includes(row.teamId) ? [['teamId', row.teamId]] : []),
      ...fields.filter(f => Number.isFinite(row[f]) && row[f] >= 0 && row[f] <= 1000).map(f => [f, row[f]]),
    ]));
    if (!clean.some(r => fields.some(f => r[f] != null))) return { ...status(), message: 'В файле нет поддерживаемых показателей.' };
    const key = `${career.season}/${match.competitionId}/${match.date}/${match.homeId}/${match.awayId}`;
    const next = { ...career.telemetry, [key]: clean };
    await writeJson(disk(`telemetry-${career.archiveId}.json`), next);
    if (current.career === career) publish({ career: { ...career, telemetry: next }, message: 'Расширенная статистика добавлена к матчу.' });
    return status();
  });
  if (!verify || verifyOverlay) {
    hotkey = globalShortcut.register(shortcut, toggle);
    if (!hotkey) window.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || input.key !== shortcut || input.alt || input.control || input.meta || input.shift) return;
      event.preventDefault();
      if (!input.isAutoRepeat) toggle();
    });
  }
  if (!verify) {
    const icon = nativeImage.createFromPath(join(ui, 'assets', 'tray.png'));
    tray = new Tray(icon);
    tray.setToolTip('Пятый тайм · FC 26');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Открыть панель', click: raise },
      { label: 'Выйти', click: () => app.quit() },
    ]));
    tray.on('double-click', raise);
    const settings = await readJson(disk('settings.json'));
    archiveIndex = await readJson(disk('history-index.json'));
    followLatest = settings.followLatest ?? !settings.source;
    source = followLatest ? await newestSave() ?? settings.source : settings.source;
    if (source) {
      current.state = 'loading';
    }
    setInterval(poll, 2400).unref();
    void poll();
  }
  await window.loadURL(panelUrl);
  if (verifyOverlay) {
    const status = await window.webContents.executeJavaScript('window.careerDesktop.state()');
    if (status.shortcut !== 'F10' || status.hotkey !== globalShortcut.isRegistered(status.shortcut)) {
      throw new Error('Reported F10 status does not match Electron global shortcut registration.');
    }
    if (!await window.webContents.executeJavaScript('window.careerDesktop.reveal()')) throw new Error('The panel could not be revealed from the renderer.');
    await new Promise(resolve => setTimeout(resolve, 100));
    if (!window.isVisible()) raise();
    if (!window.isAlwaysOnTop() || !window.isVisible()) throw new Error(`The overlay failed to open (visible: ${window.isVisible()}, topmost: ${window.isAlwaysOnTop()}).`);
    toggle();
    if (window.isVisible()) throw new Error('The overlay could not be hidden.');
    console.log(status.hotkey ? 'F10 is registered as a global shortcut.' : 'F10 is unavailable globally. The in-panel shortcut and tray remain available.');
    console.log('Desktop overlay is visible, topmost and hides on toggle.');
    app.quit();
  } else if (verify) {
    const { verifyUi } = require('./verify-ui.cjs');
    await verifyUi(window, process.env.FC26_VERIFY_SAVE ? async () => {
      const result = await decode(process.env.FC26_VERIFY_SAVE);
      if (!result.career) throw new Error(result.error || 'Save is still being written.');
      result.career.seasonArchive = snapshot(result.career);
      result.career.archiveId = 'verification';
      publish({ career: result.career, state: 'synced', message: '' });
      return result.career;
    } : undefined, career => publish({ career, state: 'synced', message: '' }));
    app.quit();
  } else {
    startGameWatch();
    if (!background) raise();
    if (process.argv.includes('--with-game')) window.webContents.send('career:game-update', await openGame(false));
  }
}

if (verify || app.requestSingleInstanceLock()) {
  app.on('second-instance', async (_event, argv) => {
    raise();
    if (window && argv.includes('--with-game')) window.webContents.send('career:game-update', await openGame(false));
  });
  app.whenReady().then(boot).catch(error => { console.error(error); app.exit(1); });
} else {
  app.quit();
}
app.on('before-quit', () => { quitting = true; endBinding(); armedFocus?.(false); gameWatcher?.kill(); globalShortcut.unregisterAll(); void worker?.terminate(); });
