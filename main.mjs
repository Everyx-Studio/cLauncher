// main.mjs — Processus principal Electron · Royaume de Valdris Launcher
// v2.2 — Améliorations :
//   - Verrou instance unique (single-instance lock)
//   - app.setAppUserModelId pour les notifications Windows
//   - IPC getServerInfo : récupère /info.json + /players.json du serveur FiveM
//   - IPC open-external avec liste blanche d'URLs
//   - IPC get-version
//   - Sécurité : will-navigate bloqué, setPermissionRequestHandler
//   - start-local-server protégé par try/catch
//   - Nettoyage à la fermeture (serverProcess.kill garantit)

import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import path    from 'path';
import fs      from 'fs';
import { spawn }      from 'child_process';
import { fileURLToPath } from 'url';
import { rpc } from './discord-rpc/discord-rpc.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const isDev      = process.argv.includes('--dev');
const SERVER_DIR = path.resolve(__dirname, '..', 'server');
const SERVER_ENTRY = path.join(SERVER_DIR, 'index.js');

// ─── INSTANCE UNIQUE ──────────────────────────────────────────────────────────
// Empêche l'ouverture de plusieurs fenêtres simultanées.

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ─── NOTIFICATIONS WINDOWS ────────────────────────────────────────────────────
// Nécessaire pour que les notifications toast Windows affichent le bon nom.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.valdris.launcher');
}

// ─── CONFIG JSON ──────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(app.getPath('userData'), 'launcher-config.json');

const DEFAULT_CONFIG = {
  fivemPath:     '',
  serverIp:      '127.0.0.1',
  serverPort:    30120,
  musicEnabled:  true,
  musicVolume:   65,
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
    }
  } catch { /* fichier corrompu → reset */ }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(updates) {
  try {
    const merged = { ...loadConfig(), ...updates };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

// ─── DÉTECTION AUTO FIVEM ─────────────────────────────────────────────────────

function detectFiveMPath() {
  const localApp  = process.env.LOCALAPPDATA  || '';
  const progFiles = process.env.ProgramFiles  || 'C:\\Program Files';
  const progX86   = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const userProf  = process.env.USERPROFILE   || '';

  const candidates = [
    path.join(localApp,  'FiveM', 'FiveM.exe'),
    path.join(localApp,  'FiveM Application Data', 'FiveM.exe'),
    path.join('C:\\FiveM', 'FiveM.exe'),
    path.join('D:\\FiveM', 'FiveM.exe'),
    path.join(progFiles,  'FiveM', 'FiveM.exe'),
    path.join(progX86,    'FiveM', 'FiveM.exe'),
    path.join(userProf, 'Desktop', 'FiveM.exe'),
    path.join(userProf, 'Documents', 'FiveM', 'FiveM.exe'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function sanitizeHost(value) {
  const host = String(value ?? '').trim();
  if (!host) return '';
  if (host === 'localhost') return host;
  if (/^\[[0-9a-fA-F:]+\]$/.test(host)) return host;
  return /^[a-zA-Z0-9.-]+$/.test(host) ? host : '';
}

function normalizePort(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536
    ? parsed
    : DEFAULT_CONFIG.serverPort;
}

function normalizeConnection(input = {}) {
  return {
    ip: sanitizeHost(input.ip) || DEFAULT_CONFIG.serverIp,
    port: normalizePort(input.port),
    fivemPath: typeof input.fivemPath === 'string' ? input.fivemPath : '',
  };
}

function emitWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('window-state', {
    isMaximized: mainWindow.isMaximized(),
  });
}

// ─── LANCEMENT FIVEM ──────────────────────────────────────────────────────────

async function doLaunchFiveM(options) {
  const { ip, port, fivemPath } = normalizeConnection(options);
  const connectStr = `${ip}:${port}`;
  const uriConnect = `fivem://connect/${connectStr}`;

  if (!fivemPath) {
    try {
      await shell.openExternal(uriConnect);
      return { ok: true, method: 'uri-scheme' };
    } catch (err) {
      return { ok: false, error: `URI scheme échoué : ${err.message}` };
    }
  }

  if (!fs.existsSync(fivemPath)) {
    try {
      await shell.openExternal(uriConnect);
      return { ok: true, method: 'uri-fallback', warning: 'Chemin FiveM.exe introuvable, fallback URI utilisé.' };
    } catch {
      return { ok: false, error: `FiveM.exe introuvable : ${fivemPath}` };
    }
  }

  try {
    const proc = spawn(fivemPath, ['+connect', connectStr], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    proc.unref();
    return { ok: true, method: 'spawn-exe' };
  } catch (err) {
    try {
      await shell.openExternal(uriConnect);
      return { ok: true, method: 'uri-final-fallback' };
    } catch {
      return { ok: false, error: `Lancement échoué : ${err.message}` };
    }
  }
}

// ─── INFO SERVEUR FIVEM ───────────────────────────────────────────────────────
// Récupère les données publiques du serveur FiveM (/info.json + /players.json)
// sans contrainte CORS puisque tout passe par le processus principal.

async function fetchServerInfo(options) {
  const { ip, port } = normalizeConnection(options);
  const base = `http://${ip}:${port}`;
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);

  try {
    const start = Date.now();

    const [infoRes, playersRes] = await Promise.allSettled([
      fetch(`${base}/info.json`,    { signal: ctrl.signal }),
      fetch(`${base}/players.json`, { signal: ctrl.signal }),
    ]);

    const ms = Date.now() - start;
    clearTimeout(timer);

    let info    = null;
    let players = [];

    if (infoRes.status === 'fulfilled' && infoRes.value.ok) {
      try { info = await infoRes.value.json(); } catch { /* json invalide */ }
    }

    if (playersRes.status === 'fulfilled' && playersRes.value.ok) {
      try { players = await playersRes.value.json(); } catch { /* json invalide */ }
    }

    if (!info && players.length === 0) {
      return {
        online: false,
        ms: null,
        players: [],
        info: null,
        connectAddress: `${ip}:${port}`,
      };
    }

    const maxPlayers = Number.parseInt(
      info?.vars?.sv_maxClients ?? info?.vars?.sv_maxclients ?? 127,
      10,
    ) || 127;
    const tags = String(info?.vars?.sv_tags || info?.vars?.tags || '')
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean)
      .slice(0, 8);

    return {
      online:      true,
      ms,
      playerCount: Array.isArray(players) ? players.length : 0,
      players:     Array.isArray(players) ? players.slice(0, 20) : [],  // 20 premiers suffisent à l'UI
      hostname:    info?.vars?.sv_projectName || info?.hostname || 'Royaume de Valdris',
      maxPlayers,
      gametype:    info?.vars?.gametype        || 'Medieval RP',
      mapname:     info?.vars?.mapname         || 'Valdris',
      description: info?.vars?.sv_projectDesc || info?.vars?.sv_projectDescription || info?.description || '',
      resources:   Array.isArray(info?.resources) ? info.resources.length : 0,
      locale:      info?.vars?.locale || '',
      tags,
      connectAddress: `${ip}:${port}`,
      info,
    };
  } catch {
    clearTimeout(timer);
    return {
      online: false,
      ms: null,
      players: [],
      info: null,
      connectAddress: `${ip}:${port}`,
    };
  }
}

// ─── LISTE BLANCHE URLs EXTERNES ─────────────────────────────────────────────
// Seules ces origines peuvent être ouvertes via openExternal depuis le renderer.

const EXTERNAL_ORIGINS_WHITELIST = [
  'https://discord.gg',
  'https://discord.com',
  'https://cfx.re',
  'https://fivem.net',
  'https://github.com',
  'https://docs.fivem.net',
];

function isUrlAllowed(url) {
  try {
    const { origin, protocol } = new URL(url);
    if (protocol !== 'https:') return false;
    return EXTERNAL_ORIGINS_WHITELIST.some(o => origin === o || origin.startsWith(o));
  } catch {
    return false;
  }
}

// ─── FENÊTRE PRINCIPALE ───────────────────────────────────────────────────────

let mainWindow;
let serverProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1400,
    height: 900,
    minWidth:  1100,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0A0806',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,          // nécessaire pour les imports ESM dans preload
      webSecurity: true,
    },
    show: false,
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    emitWindowState();
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  mainWindow.on('maximize', emitWindowState);
  mainWindow.on('unmaximize', emitWindowState);

  // Bloquer toute navigation sortante (XSS / redirection malveillante)
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
    }
  });

  // Bloquer les popups
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Refuser les permissions sensibles (micro, caméra, etc.)
  mainWindow.webContents.session.setPermissionRequestHandler((_, permission, cb) => {
    const allowed = ['notifications'];
    cb(allowed.includes(permission));
  });
}

app.whenReady().then(() => {
  createWindow();
  rpc.init();
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    try { serverProcess.kill(); } catch { /* déjà terminé */ }
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ─── IPC : CONTRÔLES FENÊTRE ──────────────────────────────────────────────────

ipcMain.handle('win-minimize', () => mainWindow?.minimize());
ipcMain.handle('win-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle('win-close', () => mainWindow?.close());
ipcMain.handle('get-window-state', () => ({
  isMaximized: mainWindow?.isMaximized() ?? false,
}));

// ─── IPC : CONFIG ─────────────────────────────────────────────────────────────

ipcMain.handle('get-config',  ()           => loadConfig());
ipcMain.handle('set-config',  (_, updates) => saveConfig(updates));

// ─── IPC : VERSION ────────────────────────────────────────────────────────────

ipcMain.handle('get-version', () => app.getVersion());
ipcMain.handle('copy-text', (_, text) => {
  if (typeof text !== 'string' || !text.trim() || text.length > 4096) return false;
  clipboard.writeText(text);
  return true;
});

// ─── IPC : FIVEM ──────────────────────────────────────────────────────────────

ipcMain.handle('detect-fivem',      ()        => detectFiveMPath());
ipcMain.handle('launch-fivem',      (_, opts) => doLaunchFiveM(opts));

ipcMain.handle('select-fivem-path', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Sélectionner FiveM.exe',
    filters: [{ name: 'Exécutables Windows', extensions: ['exe'] }],
    properties: ['openFile'],
  });
  return result.canceled ? null : result.filePaths[0];
});

// ─── IPC : INFO SERVEUR (players + metadata) ──────────────────────────────────

ipcMain.handle('get-server-info', (_, { ip, port }) => fetchServerInfo({ ip, port }));

// ─── IPC : PING SERVEUR ───────────────────────────────────────────────────────
// Ping léger (HEAD /info.json) — distinct de get-server-info pour rapidité.

ipcMain.handle('ping-server', async (_, { ip, port }) => {
  try {
    const connection = normalizeConnection({ ip, port });
    const url   = `http://${connection.ip}:${connection.port}/info.json`;
    const start = Date.now();
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res   = await fetch(url, { method: 'GET', signal: ctrl.signal });
    clearTimeout(timer);
    return { online: res.ok, ms: Date.now() - start };
  } catch {
    return { online: false, ms: null };
  }
});

// ─── IPC : OUVERTURE URL EXTERNE (liste blanche) ─────────────────────────────

ipcMain.handle('open-external', async (_, url) => {
  if (!isUrlAllowed(url)) {
    return { ok: false, error: `URL non autorisée : ${url}` };
  }
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ─── IPC : SERVEUR LOCAL (dev) ────────────────────────────────────────────────

ipcMain.handle('start-local-server', async () => {
  if (serverProcess) return { ok: false, error: 'Serveur déjà en cours.' };
  if (!fs.existsSync(SERVER_DIR) || !fs.existsSync(SERVER_ENTRY)) {
    return { ok: false, error: 'Répertoire serveur introuvable à côté du launcher.' };
  }

  return new Promise((resolve) => {
    try {
      serverProcess = spawn('node', [SERVER_ENTRY], {
        cwd: SERVER_DIR,
        stdio: 'pipe',
      });

      serverProcess.stdout.on('data', d => mainWindow?.webContents.send('server-output', d.toString()));
      serverProcess.stderr.on('data', d => mainWindow?.webContents.send('server-error',  d.toString()));
      serverProcess.on('close', code => {
        mainWindow?.webContents.send('server-closed', code);
        serverProcess = null;
        resolve({ ok: true, code });
      });
      serverProcess.on('error', err => {
        mainWindow?.webContents.send('server-error', `Erreur spawn : ${err.message}`);
        serverProcess = null;
        resolve({ ok: false, error: err.message });
      });
    } catch (err) {
      serverProcess = null;
      resolve({ ok: false, error: err.message });
    }
  });
});

ipcMain.handle('stop-server', () => {
  if (!serverProcess) return false;
  try { serverProcess.kill(); } catch { /* déjà terminé */ }
  return true;
});
