// preload.mjs — Pont contextBridge · Royaume de Valdris Launcher
// v2.2 — Améliorations :
//   - getServerInfo(ip, port) : infos live du serveur (joueurs, hostname, ping)
//   - openExternal(url)       : ouverture sécurisée via liste blanche IPC
//   - getVersion()            : version de l'app depuis Electron
//   - startLocalServer retourne maintenant { ok, error } au lieu d'un simple code

import { contextBridge, ipcRenderer } from 'electron';

// Canaux IPC autorisés en écoute (whitelist sécurité)
const ALLOWED_CHANNELS = ['server-output', 'server-error', 'server-closed', 'window-state'];

contextBridge.exposeInMainWorld('launcher', {

  // ── Contrôles fenêtre ─────────────────────────────────────────
  minimize: () => ipcRenderer.invoke('win-minimize'),
  maximize: () => ipcRenderer.invoke('win-maximize'),
  close:    () => ipcRenderer.invoke('win-close'),
  getWindowState: () => ipcRenderer.invoke('get-window-state'),

  // ── Version de l'application ──────────────────────────────────
  getVersion: () => ipcRenderer.invoke('get-version'),
  copyText:   (text) => ipcRenderer.invoke('copy-text', text),

  // ── Configuration persistante ─────────────────────────────────
  // Retourne { fivemPath, serverIp, serverPort, musicEnabled, musicVolume }
  getConfig: ()        => ipcRenderer.invoke('get-config'),
  setConfig: (updates) => ipcRenderer.invoke('set-config', updates),

  // ── FiveM ─────────────────────────────────────────────────────
  detectFiveM: () => ipcRenderer.invoke('detect-fivem'),
  selectPath:  () => ipcRenderer.invoke('select-fivem-path'),

  // opts = { ip, port, fivemPath? }
  // → { ok, method?, error?, warning? }
  launchGame: (opts) => ipcRenderer.invoke('launch-fivem', opts),

  // ── Ping serveur léger (HEAD /info.json) ──────────────────────
  // → { online: boolean, ms: number|null }
  pingServer: (ip, port) => ipcRenderer.invoke('ping-server', { ip, port }),

  // ── Info serveur complète ─────────────────────────────────────
  // → { online, ms, playerCount, players, hostname, maxPlayers, gametype, mapname }
  getServerInfo: (ip, port) => ipcRenderer.invoke('get-server-info', { ip, port }),

  // ── Ouverture URL externe (liste blanche) ─────────────────────
  // → { ok: boolean, error?: string }
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // ── Abonnement aux événements IPC ─────────────────────────────
  // Usage : const unsub = window.launcher.on('server-output', fn)
  // Retourne une fonction de désinscription.
  on: (channel, callback) => {
    if (!ALLOWED_CHANNELS.includes(channel)) return () => {};
    const handler = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  // ── Serveur local dev ─────────────────────────────────────────
  // → { ok: boolean, code?: number, error?: string }
  startLocalServer: () => ipcRenderer.invoke('start-local-server'),
  stopServer:       () => ipcRenderer.invoke('stop-server'),
});
