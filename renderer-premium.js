// renderer-premium.js — Logique UI · Royaume de Valdris Launcher v2.2
// Améliorations :
//   - fetchServerInfo() : joueurs live, hostname, ping → sidebar + server cards
//   - stat-online, players-bar-fill, scard-main-ping mis à jour dynamiquement
//   - Liens sidebar ouvrent les URLs via window.launcher.openExternal
//   - Logs console avec horodatage
//   - patchSettingsDOM() supprimé (les IDs sont directement dans le HTML)
//   - startLocalServer retourne { ok, error } — géré proprement
//   - Version affichée depuis app.getVersion()

// ─── ÉTAT GLOBAL ──────────────────────────────────────────────────────────────

let CONFIG = {
  fivemPath:    '',
  serverIp:     '127.0.0.1',
  serverPort:   30120,
  musicEnabled: true,
  musicVolume:  65,
};

// ─── LOADER ANIMÉ ──────────────────────────────────────────────────────────────

const LOADER_STEPS = [
  { pct: 10,  msg: 'Invocation des runes…'            },
  { pct: 25,  msg: 'Chargement des parchemins…'       },
  { pct: 40,  msg: 'Forgeage des armures…'            },
  { pct: 58,  msg: 'Convocation des guildes…'         },
  { pct: 72,  msg: 'Ouverture des portes du château…' },
  { pct: 88,  msg: 'Connexion au Royaume…'            },
  { pct: 100, msg: 'Bienvenue, Seigneur.'             },
];

let stepIndex = 0;

function runLoader() {
  const fill   = document.getElementById('loader-fill');
  const status = document.getElementById('loader-status');
  const pctEl  = document.getElementById('loader-pct');

  const interval = setInterval(() => {
    if (stepIndex >= LOADER_STEPS.length) {
      clearInterval(interval);
      setTimeout(() => {
        document.getElementById('loader').classList.add('hidden');
        document.getElementById('app').style.opacity = '1';
      }, 600);
      return;
    }
    const step = LOADER_STEPS[stepIndex];
    if (fill)   fill.style.width   = step.pct + '%';
    if (status) status.textContent = step.msg;
    if (pctEl)  pctEl.textContent  = step.pct + '%';
    stepIndex++;
  }, 420);
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────

document.querySelectorAll('.nav-tab[data-page]').forEach(btn => {
  btn.addEventListener('click', () => {
    const page = btn.dataset.page;
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p  => p.classList.remove('active'));
    btn.classList.add('active');
    const target = document.getElementById('page-' + page);
    if (target) target.classList.add('active');
  });
});

// ─── LANCEMENT DU JEU ─────────────────────────────────────────────────────────

async function launchGame(opts = {}) {
  const btn = document.getElementById('play-btn');
  if (!btn) return;

  btn.classList.add('loading');
  const label = btn.querySelector('.play-label');
  if (label) label.textContent = 'CONNEXION…';

  const ip   = CONFIG.serverIp   || '127.0.0.1';
  const port = CONFIG.serverPort || 30120;

  addConsoleLog('info', `Lancement FiveM → ${ip}:${port}`);

  if (window.launcher) {
    const launchOpts = { ip, port, fivemPath: CONFIG.fivemPath || '', ...opts };

    try {
      const result = await window.launcher.launchGame(launchOpts);

      if (result.ok) {
        const methodLabel = {
          'uri-scheme':         'URI scheme fivem://',
          'spawn-exe':          'exécutable direct',
          'uri-fallback':       'URI (fallback)',
          'uri-final-fallback': 'URI (fallback final)',
        }[result.method] || result.method;

        addConsoleLog('ok', `FiveM lancé via ${methodLabel}`);

        if (result.warning) {
          addConsoleLog('warn', result.warning);
          showNotif('warning', '⚠ Avertissement', result.warning);
        } else {
          showNotif('success', '⚔ Lancement', `Connexion en cours vers ${ip}:${port}…`);
        }
      } else {
        addConsoleLog('err', result.error);
        showNotif('error', '✕ Échec du lancement', result.error);
      }
    } catch (err) {
      addConsoleLog('err', `Exception : ${err.message}`);
      showNotif('error', '✕ Erreur inattendue', err.message);
    } finally {
      btn.classList.remove('loading');
      if (label) label.textContent = 'JOUER';
    }
  } else {
    addConsoleLog('info', 'Mode navigateur — simulation uniquement');
    showNotif('info', '📜 Simulation', 'FiveM ne peut pas être lancé hors Electron.');
    setTimeout(() => {
      btn.classList.remove('loading');
      if (label) label.textContent = 'JOUER';
      addConsoleLog('ok', 'Simulation terminée');
    }, 2500);
  }
}

// ─── CONSOLE ──────────────────────────────────────────────────────────────────

function openConsole() {
  document.getElementById('console-overlay').classList.remove('hidden');
}

function closeConsole() {
  document.getElementById('console-overlay').classList.add('hidden');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeConsole();
});

document.getElementById('console-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeConsole();
});

function timestamp() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function addConsoleLog(type, text) {
  const body = document.getElementById('console-body');
  if (!body) return;

  const line = document.createElement('div');
  line.className = 'clog ' + type;

  const ts = document.createElement('span');
  ts.className = 'clog-ts';
  ts.textContent = timestamp();

  const prefix = document.createElement('span');
  prefix.className = 'clog-prefix';
  const prefixMap = { ok: '[OK]', err: '[ERR]', info: '[SYS]', warn: '[AVERT]' };
  prefix.textContent = prefixMap[type] || '[LOG]';

  const cleanText = text.replace(/^\[(OK|ERR|SYS|AVERT|LOG|WLD|PLR)\]\s*/i, '');

  line.appendChild(ts);
  line.appendChild(prefix);
  line.appendChild(document.createTextNode(' ' + cleanText));
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

function showNotif(type, title, body) {
  const stack = document.getElementById('notif-stack');
  if (!stack) return;

  const el = document.createElement('div');
  el.className = `notif ${type}`;
  el.innerHTML = `
    <div class="notif-timer"></div>
    <div class="notif-icon">${{ success: '⚔', error: '✕', warning: '⚠', info: '📜' }[type] || '📜'}</div>
    <div class="notif-content">
      <span class="notif-title">${title}</span>
      <span class="notif-body">${body}</span>
    </div>
    <button class="notif-close" onclick="this.parentElement.remove()">✕</button>
  `;
  stack.appendChild(el);
  setTimeout(() => el.classList.add('fade-out'), 4000);
  setTimeout(() => el.remove(), 4500);
}

// ─── INFO SERVEUR (live) ──────────────────────────────────────────────────────
// Récupère joueurs, ping et métadonnées → met à jour toute l'UI en une passe.

async function refreshServerInfo() {
  const ip   = CONFIG.serverIp   || '127.0.0.1';
  const port = CONFIG.serverPort || 30120;

  // Éléments sidebar
  const pingEl        = document.getElementById('server-ping-display');
  const pill          = document.getElementById('server-pill');
  const pillTxt       = pill?.querySelector('.status-text');
  const statOnline    = document.getElementById('stat-online');

  // Éléments server card (page Royaumes)
  const scardPing     = document.getElementById('scard-main-ping');
  const playersBar    = document.querySelector('.players-bar-fill');
  const playersTxt    = document.querySelector('.players-count-text');

  let info;

  try {
    if (window.launcher) {
      info = await window.launcher.getServerInfo(ip, port);
    } else {
      // Fallback navigateur (CORS peut bloquer)
      const start = Date.now();
      const [ir, pr] = await Promise.allSettled([
        fetch(`http://${ip}:${port}/info.json`,    { signal: AbortSignal.timeout(4000) }),
        fetch(`http://${ip}:${port}/players.json`, { signal: AbortSignal.timeout(4000) }),
      ]);
      const ms = Date.now() - start;
      const infoData    = ir.status === 'fulfilled' && ir.value.ok    ? await ir.value.json()    : null;
      const playersData = pr.status === 'fulfilled' && pr.value.ok    ? await pr.value.json()    : [];
      info = {
        online:      !!infoData,
        ms,
        playerCount: Array.isArray(playersData) ? playersData.length : 0,
        maxPlayers:  infoData?.vars?.sv_maxClients ?? 127,
        hostname:    infoData?.vars?.sv_projectName || 'Royaume de Valdris',
      };
    }
  } catch {
    info = { online: false, ms: null, playerCount: 0, maxPlayers: 127 };
  }

  if (info.online) {
    // Sidebar — status pill
    if (pill)    { pill.classList.remove('offline'); pill.classList.add('online'); }
    if (pillTxt)   pillTxt.textContent = 'Serveur actif';
    if (pingEl)    pingEl.textContent  = info.ms != null ? `${info.ms}ms` : '—';

    // Sidebar — compteur joueurs
    if (statOnline) statOnline.textContent = String(info.playerCount ?? '—');

    // Server card — ping badge
    if (scardPing) scardPing.textContent = info.ms != null ? `${info.ms}ms` : '—';

    // Server card — barre joueurs
    const max = info.maxPlayers || 127;
    const pct = Math.round(((info.playerCount ?? 0) / max) * 100);
    if (playersBar) playersBar.style.width = pct + '%';
    if (playersTxt) playersTxt.textContent = `${info.playerCount ?? 0} / ${max}`;
  } else {
    if (pill)    { pill.classList.remove('online'); pill.classList.add('offline'); }
    if (pillTxt)   pillTxt.textContent = 'Hors ligne';
    if (pingEl)    pingEl.textContent  = '—';
    if (statOnline) statOnline.textContent = '—';
    if (scardPing)  scardPing.textContent  = 'Hors ligne';
  }
}

// ─── LIENS SIDEBAR (ouverts dans le navigateur système) ───────────────────────
// Les URLs configurables via data-url sur les éléments .slink.

function initSidebarLinks() {
  document.querySelectorAll('.slink[data-url]').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const url = link.dataset.url;
      if (!url) return;

      if (window.launcher) {
        const result = await window.launcher.openExternal(url);
        if (!result.ok) {
          showNotif('error', '✕ Lien invalide', result.error || 'URL non autorisée');
        }
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    });
  });
}

// ─── PAGE FORGE (SETTINGS) ────────────────────────────────────────────────────

function applyConfigToUI() {
  const ipInput   = document.getElementById('setting-ip');
  const portInput = document.getElementById('setting-port');
  const pathDisp  = document.getElementById('fivem-path-display');
  const musicChk  = document.getElementById('setting-music');
  const volSlider = document.getElementById('setting-volume');
  const volVal    = document.getElementById('setting-volume-val');

  if (ipInput)   ipInput.value       = CONFIG.serverIp;
  if (portInput) portInput.value     = CONFIG.serverPort;
  if (pathDisp)  pathDisp.textContent = CONFIG.fivemPath || 'Non détecté — cliquez sur Parcourir';
  if (musicChk)  musicChk.checked    = CONFIG.musicEnabled;
  if (volSlider) {
    volSlider.value = CONFIG.musicVolume;
    volSlider.style.setProperty('--pct', CONFIG.musicVolume + '%');
  }
  if (volVal) volVal.textContent = CONFIG.musicVolume + '%';
}

function saveField(key, value) {
  CONFIG[key] = value;
  if (window.launcher) window.launcher.setConfig({ [key]: value });
}

function initSettingsPage() {
  const ipInput = document.getElementById('setting-ip');
  if (ipInput) {
    ipInput.addEventListener('change', () => {
      saveField('serverIp', ipInput.value.trim());
      // Relancer une info serveur avec la nouvelle IP
      setTimeout(refreshServerInfo, 300);
    });
  }

  const portInput = document.getElementById('setting-port');
  if (portInput) {
    portInput.addEventListener('change', () => {
      const v = parseInt(portInput.value, 10);
      if (v > 0 && v < 65536) {
        saveField('serverPort', v);
        setTimeout(refreshServerInfo, 300);
      }
    });
  }

  const browseBtn = document.getElementById('btn-browse-fivem');
  if (browseBtn && window.launcher) {
    browseBtn.addEventListener('click', async () => {
      const chosen = await window.launcher.selectPath();
      if (chosen) {
        saveField('fivemPath', chosen);
        const pathDisp = document.getElementById('fivem-path-display');
        if (pathDisp) pathDisp.textContent = chosen;
        showNotif('success', '⚔ Chemin enregistré', chosen);
        addConsoleLog('ok', `FiveM.exe → ${chosen}`);
      }
    });
  }

  const musicChk = document.getElementById('setting-music');
  if (musicChk) {
    musicChk.addEventListener('change', () => saveField('musicEnabled', musicChk.checked));
  }

  const volSlider = document.getElementById('setting-volume');
  const volVal    = document.getElementById('setting-volume-val');
  if (volSlider) {
    volSlider.addEventListener('input', () => {
      const v = parseInt(volSlider.value, 10);
      volSlider.style.setProperty('--pct', v + '%');
      if (volVal) volVal.textContent = v + '%';
      saveField('musicVolume', v);
    });
  }
}

// ─── LOGS SERVEUR LOCAL (IPC) ─────────────────────────────────────────────────

function initServerLogs() {
  if (!window.launcher) return;

  window.launcher.on('server-output', data => {
    data.split('\n').filter(Boolean).forEach(line => addConsoleLog('info', line));
  });
  window.launcher.on('server-error', data => {
    data.split('\n').filter(Boolean).forEach(line => addConsoleLog('err', line));
  });
  window.launcher.on('server-closed', code => {
    addConsoleLog('warn', `Serveur local terminé (code ${code})`);
  });
}

// ─── DÉTECTION AUTO FIVEM AU DÉMARRAGE ───────────────────────────────────────

async function autoDetectFiveM() {
  if (!window.launcher || CONFIG.fivemPath) return;

  const detected = await window.launcher.detectFiveM();
  if (detected) {
    CONFIG.fivemPath = detected;
    await window.launcher.setConfig({ fivemPath: detected });
    const pathDisp = document.getElementById('fivem-path-display');
    if (pathDisp) pathDisp.textContent = detected;
    addConsoleLog('ok', `FiveM détecté automatiquement : ${detected}`);
  } else {
    addConsoleLog('info', 'FiveM non détecté — configurez le chemin dans Forge.');
  }
}

// ─── VERSION DANS LA TITLEBAR ─────────────────────────────────────────────────

async function initVersion() {
  if (!window.launcher) return;
  try {
    const ver = await window.launcher.getVersion();
    const vEl = document.querySelector('.tb-version');
    if (vEl && ver) vEl.textContent = `v${ver}`;
    const ldrVer = document.querySelector('.loader-version');
    if (ldrVer && ver) ldrVer.textContent = `v${ver}`;
  } catch { /* optionnel */ }
}

// ─── INIT PRINCIPAL ───────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {

  // 1. Charger la config persistante
  if (window.launcher) {
    try {
      const saved = await window.launcher.getConfig();
      CONFIG = { ...CONFIG, ...saved };
    } catch { /* config absente → valeurs par défaut */ }
  }

  // 2. Version dans la titlebar / loader
  initVersion();

  // 3. Lancer le loader visuel
  runLoader();

  // 4. Appliquer la config à l'UI
  applyConfigToUI();

  // 5. Brancher la page Forge
  initSettingsPage();

  // 6. Brancher les liens sidebar
  initSidebarLinks();

  // 7. Brancher les logs serveur IPC
  initServerLogs();

  // 8. Premier chargement des infos serveur (décalé pour laisser le loader jouer)
  setTimeout(refreshServerInfo, 1800);
  setInterval(refreshServerInfo, 30_000);

  // 9. Détection auto FiveM (arrière-plan)
  setTimeout(autoDetectFiveM, 2500);
});

// ─── EXPORTS GLOBAUX (appelés depuis les onclick HTML) ────────────────────────

