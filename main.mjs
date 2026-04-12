// main.mjs — Processus principal Electron · Royaume de Valdris Launcher
// Corrections v2.1 :
//   - window controls IPC (minimize / maximize / close)
//   - détection auto FiveM.exe (chemins Windows courants)
//   - lancement réel via URI scheme fivem:// ou spawn direct
//   - persistance config JSON dans userData
//   - ping serveur via IPC (évite les contraintes CORS du renderer)

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path    from 'path';
import fs      from 'fs';
import { spawn }      from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const isDev      = process.argv.includes('--dev');

// ─── CONFIG JSON ──────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(app.getPath('userData'), 'launcher-config.json');

const DEFAULT_CONFIG = {
  fivemPath:     '',          // chemin absolu vers FiveM.exe (optionnel)
  serverIp:      '127.0.0.1',
  serverPort:    30120,
  musicEnabled:  true,
  musicVolume:   65,
};

function loadConfig () {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
    }
  } catch { /* fichier corrompu → reset */ }
  return { ...DEFAULT_CONFIG };
}

function saveConfig (updates) {
  try {
    const merged = { ...loadConfig(), ...updates };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

// ─── DÉTECTION AUTO FIVEM ─────────────────────────────────────────────────────

function detectFiveMPath () {
  const localApp  = process.env.LOCALAPPDATA  || '';
  const progFiles = process.env.ProgramFiles  || 'C:\\Program Files';
  const progX86   = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const userProf  = process.env.USERPROFILE   || '';

  const candidates = [
    // Installation par défaut FiveM
    path.join(localApp,  'FiveM', 'FiveM.exe'),
    path.join(localApp,  'FiveM Application Data', 'FiveM.exe'),
    // Emplacements manuels courants
    path.join('C:\\FiveM', 'FiveM.exe'),
    path.join('D:\\FiveM', 'FiveM.exe'),
    path.join(progFiles,  'FiveM', 'FiveM.exe'),
    path.join(progX86,    'FiveM', 'FiveM.exe'),
    // Bureau
    path.join(userProf, 'Desktop', 'FiveM.exe'),
    path.join(userProf, 'Documents', 'FiveM', 'FiveM.exe'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ─── LANCEMENT FIVEM ──────────────────────────────────────────────────────────
// Mécanismes officiels uniquement :
//   1. URI scheme  → fivem://connect/IP:PORT  (FiveM détecte et se lance seul)
//   2. Spawn direct → FiveM.exe +connect IP:PORT  (si chemin connu)
// Aucun contournement d'authentification Rockstar/CFX.

async function doLaunchFiveM ({ ip, port, fivemPath }) {
  const connectStr = `${ip}:${port}`;
  const uriConnect = `fivem://connect/${connectStr}`;

  // Stratégie 1 — URI scheme (recommandée, pas besoin du chemin)
  if (!fivemPath) {
    try {
      await shell.openExternal(uriConnect);
      return { ok: true, method: 'uri-scheme' };
    } catch (err) {
      return { ok: false, error: `URI scheme échoué : ${err.message}` };
    }
  }

  // Stratégie 2 — Chemin explicite fourni
  if (!fs.existsSync(fivemPath)) {
    // Tentative de fallback sur URI même si chemin fourni mais invalide
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
    // Dernier fallback sur URI
    try {
      await shell.openExternal(uriConnect);
      return { ok: true, method: 'uri-final-fallback' };
    } catch {
      return { ok: false, error: `Lancement échoué : ${err.message}` };
    }
  }
}

// ─── FENÊTRE PRINCIPALE ───────────────────────────────────────────────────────

let mainWindow;
let serverProcess = null;

function createWindow () {
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
      sandbox: false,                // nécessaire pour les imports ESM dans preload
      webSecurity: true,
    },
    show: false,
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  // Empêcher la navigation vers des URL externes dans la fenêtre principale
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  serverProcess?.kill();
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
ipcMain.handle('win-close',   () => mainWindow?.close());

// ─── IPC : CONFIG ─────────────────────────────────────────────────────────────

ipcMain.handle('get-config', ()          => loadConfig());
ipcMain.handle('set-config', (_, updates) => saveConfig(updates));

// ─── IPC : FIVEM ──────────────────────────────────────────────────────────────

ipcMain.handle('detect-fivem',    ()       => detectFiveMPath());
ipcMain.handle('launch-fivem',    (_, opts) => doLaunchFiveM(opts));

ipcMain.handle('select-fivem-path', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Sélectionner FiveM.exe',
    filters: [{ name: 'Exécutables Windows', extensions: ['exe'] }],
    properties: ['openFile'],
  });
  return result.canceled ? null : result.filePaths[0];
});

// ─── IPC : PING SERVEUR (via processus principal — pas de CORS) ───────────────

ipcMain.handle('ping-server', async (_, { ip, port }) => {
  // Node n'a pas fetch natif avant v18, et Electron 28 l'a
  // On tente un simple HEAD sur /info.json de FiveM
  try {
    const url   = `http://${ip}:${port}/info.json`;
    const start = Date.now();
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    await fetch(url, { method: 'GET', signal: ctrl.signal });
    clearTimeout(timer);
    return { online: true, ms: Date.now() - start };
  } catch {
    return { online: false, ms: null };
  }
});

// ─── IPC : SERVEUR LOCAL (dev) ────────────────────────────────────────────────

ipcMain.handle('start-local-server', async () => {
  return new Promise((resolve) => {
    serverProcess = spawn('node', ['../server/index.js'], {
      cwd: path.join(__dirname, '../server'),
      stdio: 'pipe',
    });

    serverProcess.stdout.on('data', d => mainWindow?.webContents.send('server-output', d.toString()));
    serverProcess.stderr.on('data', d => mainWindow?.webContents.send('server-error',  d.toString()));
    serverProcess.on('close', code => {
      mainWindow?.webContents.send('server-closed', code);
      serverProcess = null;
      resolve(code);
    });
  });
});

ipcMain.handle('stop-server', () => { serverProcess?.kill(); return true; });
