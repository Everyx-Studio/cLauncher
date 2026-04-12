# Intégration discord-rpc.mjs dans main.mjs
# ─────────────────────────────────────────

## 1. Dépendance

npm install discord-rpc


## 2. Import — en haut de main.mjs, après les imports existants

import { rpc, RpcState } from './discord-rpc.mjs';


## 3. Initialisation — dans app.whenReady().then(...)

app.whenReady().then(() => {
  createWindow();
  rpc.init();          // non-bloquant, Discord peut être fermé
});


## 4. Destroy propre — dans app.on('window-all-closed', ...)

app.on('window-all-closed', () => {
  rpc.destroy();
  if (serverProcess) { try { serverProcess.kill(); } catch {} }
  if (process.platform !== 'darwin') app.quit();
});


## 5. IPC : changement d'état depuis le renderer
# Ajouter après les handlers IPC existants

ipcMain.handle('rpc-set-state', (_, { state, serverInfo }) => {
  rpc.setState(state, { serverInfo });
});


## 6. Mise à jour auto depuis fetchServerInfo
# Dans le handler 'get-server-info', après le return, on notifie le RPC :

ipcMain.handle('get-server-info', async (_, { ip, port }) => {
  const info = await fetchServerInfo({ ip, port });
  rpc.updateServerInfo(info);    // ← ajouter cette ligne
  return info;
});


## 7. État IN_GAME après un lancement réussi
# Dans doLaunchFiveM, juste avant le return { ok: true, method: 'spawn-exe' } :

rpc.setState(RpcState.IN_GAME);


## 8. preload.mjs — exposer le setter au renderer

// Dans la liste contextBridge.exposeInMainWorld('launcher', { ... }) :
setRpcState: (state, serverInfo) =>
  ipcRenderer.invoke('rpc-set-state', { state, serverInfo }),


## 9. renderer-premium.js — appels côté UI
# Quand l'utilisateur change de tab :

window.launcher.setRpcState('browsing', currentServerInfo);

# Quand il ouvre les settings :

window.launcher.setRpcState('settings');


## 10. Discord Developer Portal
# https://discord.com/developers/applications
# → Créer une application
# → Copier l'Application ID dans CLIENT_ID (discord-rpc.mjs)
# → Rich Presence > Art Assets : uploader valdris_logo, status_online, status_offline
# → Rich Presence > Whitelisted Users pendant le dev (optionnel)