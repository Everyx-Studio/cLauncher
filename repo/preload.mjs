// preload.mjs — Pont contextBridge · Royaume de Valdris Launcher
// Expose window.launcher dans le renderer avec isolation stricte.
// Correction v2.1 : l'ancienne version exposait window.launcherAPI
// mais tout le code HTML/renderer référençait window.launcher → bug silencieux.

import { contextBridge, ipcRenderer } from 'electron';

// Canaux IPC autorisés en écoute (whitelist sécurité)
const ALLOWED_CHANNELS = ['server-output', 'server-error', 'server-closed'];

contextBridge.exposeInMainWorld('launcher', {

  // ── Contrôles fenêtre ─────────────────────────────────────────
  minimize: () => ipcRenderer.invoke('win-minimize'),
  maximize: () => ipcRenderer.invoke('win-maximize'),
  close:    () => ipcRenderer.invoke('win-close'),

  // ── Configuration persistante ─────────────────────────────────
  // Retourne un objet { fivemPath, serverIp, serverPort, musicEnabled, musicVolume }
  getConfig: ()        => ipcRenderer.invoke('get-config'),
  setConfig: (updates) => ipcRenderer.invoke('set-config', updates),

  // ── FiveM ─────────────────────────────────────────────────────
  // Tente de détecter automatiquement FiveM.exe sur le système
  detectFiveM: () => ipcRenderer.invoke('detect-fivem'),

  // Ouvre un sélecteur de fichier natif → retourne le chemin choisi ou null
  selectPath: () => ipcRenderer.invoke('select-fivem-path'),

  // Lance FiveM et connecte au serveur
  // opts = { ip: string, port: number, fivemPath?: string }
  // Retourne { ok: boolean, method?: string, error?: string, warning?: string }
  launchGame: (opts) => ipcRenderer.invoke('launch-fivem', opts),

  // ── Ping serveur (via IPC → pas de contrainte CORS renderer) ──
  // Retourne { online: boolean, ms: number|null }
  pingServer: (ip, port) => ipcRenderer.invoke('ping-server', { ip, port }),

  // ── Abonnement aux événements IPC ─────────────────────────────
  // Usage : window.launcher.on('server-output', (data) => { ... })
  on: (channel, callback) => {
    if (!ALLOWED_CHANNELS.includes(channel)) return;
    // Wrapper pour ne pas exposer ipcRenderer directement
    const handler = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, handler);
    // Retourne une fonction de désinscription
    return () => ipcRenderer.removeListener(channel, handler);
  },

  // ── Serveur local dev ─────────────────────────────────────────
  startLocalServer: () => ipcRenderer.invoke('start-local-server'),
  stopServer:       () => ipcRenderer.invoke('stop-server'),
});
