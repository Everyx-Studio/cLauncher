// renderer-premium.js — Logique UI · Royaume de Valdris Launcher v2.3
// Améliorations :
//   - contrôles de fenêtre réellement branchés
//   - aperçu live du serveur sur l'accueil
//   - recherche/filtrage des royaumes
//   - roster de joueurs en direct
//   - notifications sûres (sans HTML injecté)
//   - états de connexion plus clairs dans Forge
//   - raccourcis clavier et rafraîchissement plus robustes

const DEFAULT_CONFIG = {
  fivemPath: '',
  serverIp: '127.0.0.1',
  serverPort: 30120,
  musicEnabled: true,
  musicVolume: 65,
};

const LOCAL_SERVER_PRESET = {
  ip: '127.0.0.1',
  port: 30120,
};

const REFRESH_INTERVAL_MS = 30_000;
const NEWS_REFRESH_INTERVAL_MS = 60_000;
const MAX_CONSOLE_LINES = 250;

const LOADER_STEPS = [
  { pct: 10, msg: 'Invocation des runes…' },
  { pct: 25, msg: 'Chargement des parchemins…' },
  { pct: 40, msg: 'Forgeage des armures…' },
  { pct: 58, msg: 'Convocation des guildes…' },
  { pct: 72, msg: 'Ouverture des portes du château…' },
  { pct: 88, msg: 'Connexion au Royaume…' },
  { pct: 100, msg: 'Bienvenue, Seigneur.' },
];

const FALLBACK_ACTIVITY = [
  {
    tone: 'green',
    highlight: 'Royaume prêt',
    suffix: ' à accueillir de nouveaux aventuriers',
    time: 'En attente',
  },
  {
    tone: 'gold',
    highlight: 'Forge',
    suffix: ' configuration du launcher disponible',
    time: 'Conseillé',
  },
  {
    tone: 'blood',
    highlight: 'Console',
    suffix: ' ouvre le journal complet avec Ctrl+Maj+C',
    time: 'Astuce',
  },
];

const TICKER_FALLBACK = [
  { strong: 'Mise à jour 2.3', body: 'expérience du launcher renforcée et plus fluide' },
  { strong: 'Royaumes', body: 'recherche et filtrage désormais disponibles' },
  { strong: 'Veilleurs', body: 'liste des joueurs affichée en direct quand le serveur répond' },
];

let CONFIG = { ...DEFAULT_CONFIG };
let loaderStepIndex = 0;

const STATE = {
  currentPage: 'home',
  isRefreshingServerInfo: false,
  serverInfo: null,
  lastServerStatus: null,
  refreshTimerId: null,
  newsTimerId: null,
  consoleReturnFocus: null,
};

function byId(id) {
  return document.getElementById(id);
}

function query(selector, root = document) {
  return root.querySelector(selector);
}

function queryAll(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function setText(target, text) {
  const element = typeof target === 'string' ? byId(target) : target;
  if (!element) return;
  element.textContent = text;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function sanitizeHost(value) {
  const host = String(value ?? '').trim();
  if (!host) return '';
  if (host === 'localhost') return host;
  if (/^\[[0-9a-fA-F:]+\]$/.test(host)) return host;
  return /^[a-zA-Z0-9.-]+$/.test(host) ? host : '';
}

function normalizePort(value, fallback = DEFAULT_CONFIG.serverPort) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : fallback;
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function getConnection(overrides = {}) {
  return {
    ip: sanitizeHost(overrides.ip ?? CONFIG.serverIp) || DEFAULT_CONFIG.serverIp,
    port: normalizePort(overrides.port ?? CONFIG.serverPort),
    fivemPath: typeof overrides.fivemPath === 'string' ? overrides.fivemPath : (CONFIG.fivemPath || ''),
  };
}

function formatTime(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('fr-BE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatNewsDate(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfTarget - startOfToday) / 86_400_000);

  if (diffDays === 0) return `Aujourd'hui · ${formatTime(date)}`;
  if (diffDays === -1) return `Hier · ${formatTime(date)}`;
  if (diffDays > -7 && diffDays < 7) {
    const rel = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
    return `${rel.format(diffDays, 'day')} · ${formatTime(date)}`;
  }

  return `${date.toLocaleDateString('fr-BE', {
    day: '2-digit',
    month: 'short',
  })} · ${formatTime(date)}`;
}

function formatPing(ms) {
  return Number.isFinite(ms) ? `${Math.round(ms)}ms` : '—';
}

function formatAddress(connection) {
  return `${connection.ip}:${connection.port}`;
}

function timestamp() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function beginButtonLoading(button, loadingText) {
  if (!button) return () => {};

  const label = button.querySelector('.play-label');
  const originalText = label ? label.textContent : button.textContent;
  const originalDisabled = button.disabled;

  button.classList.add('loading');
  button.disabled = true;

  if (label) label.textContent = loadingText;
  else button.textContent = loadingText;

  return () => {
    button.classList.remove('loading');
    button.disabled = originalDisabled;
    if (label) label.textContent = originalText;
    else button.textContent = originalText;
  };
}

function persistConfig(fragment) {
  if (!window.launcher?.setConfig) return Promise.resolve(true);
  return window.launcher.setConfig(fragment).catch(() => false);
}

function saveField(key, value) {
  CONFIG[key] = value;
  return persistConfig({ [key]: value });
}

function updateConnectionDisplays(connection = getConnection()) {
  const address = formatAddress(connection);

  setText('home-server-address', address);
  setText('server-main-address', address);

  const pathDisplay = byId('fivem-path-display');
  if (pathDisplay) pathDisplay.title = CONFIG.fivemPath || '';
}

function setConnectionStatusBadge(mode, text) {
  const badge = byId('setting-connection-status');
  if (!badge) return;

  badge.className = `set-status-badge ${mode}`;
  badge.textContent = text;
}

function addConsoleLog(type, text) {
  const body = byId('console-body');
  if (!body) return;

  const line = document.createElement('div');
  line.className = `clog ${type}`;

  const ts = document.createElement('span');
  ts.className = 'clog-ts';
  ts.textContent = timestamp();

  const prefix = document.createElement('span');
  prefix.className = 'clog-prefix';
  prefix.textContent = ({
    ok: '[OK]',
    err: '[ERR]',
    info: '[SYS]',
    warn: '[AVERT]',
  })[type] || '[LOG]';

  const cleanText = String(text ?? '').replace(/^\[(OK|ERR|SYS|AVERT|LOG)\]\s*/i, '');

  line.append(ts, prefix, document.createTextNode(` ${cleanText}`));
  body.appendChild(line);

  while (body.children.length > MAX_CONSOLE_LINES) {
    body.removeChild(body.firstElementChild);
  }

  body.scrollTop = body.scrollHeight;
}

function removeNotification(node) {
  if (!node?.parentElement) return;
  node.parentElement.removeChild(node);
}

function showNotif(type, title, body) {
  const stack = byId('notif-stack');
  if (!stack) return;

  const notif = document.createElement('div');
  notif.className = `notif ${type}`;

  const timer = document.createElement('div');
  timer.className = 'notif-timer';

  const icon = document.createElement('div');
  icon.className = 'notif-icon';
  icon.textContent = ({
    success: '⚔',
    error: '✕',
    warning: '⚠',
    info: '📜',
  })[type] || '📜';

  const content = document.createElement('div');
  content.className = 'notif-content';

  const titleNode = document.createElement('span');
  titleNode.className = 'notif-title';
  titleNode.textContent = title;

  const bodyNode = document.createElement('span');
  bodyNode.className = 'notif-body';
  bodyNode.textContent = body;

  const close = document.createElement('button');
  close.className = 'notif-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Fermer la notification');
  close.textContent = '✕';

  content.append(titleNode, bodyNode);
  notif.append(timer, icon, content, close);
  stack.appendChild(notif);

  const fadeTimer = window.setTimeout(() => notif.classList.add('fade-out'), 4000);
  const removeTimer = window.setTimeout(() => removeNotification(notif), 4500);

  close.addEventListener('click', () => {
    window.clearTimeout(fadeTimer);
    window.clearTimeout(removeTimer);
    removeNotification(notif);
  });

  while (stack.children.length > 4) {
    removeNotification(stack.firstElementChild);
  }
}

function openConsole(trigger) {
  const overlay = byId('console-overlay');
  if (!overlay) return;

  STATE.consoleReturnFocus = trigger instanceof HTMLElement ? trigger : document.activeElement;
  overlay.classList.remove('hidden');
  byId('btn-close-console')?.focus();
}

function closeConsole() {
  const overlay = byId('console-overlay');
  if (!overlay) return;

  overlay.classList.add('hidden');
  if (STATE.consoleReturnFocus instanceof HTMLElement) {
    STATE.consoleReturnFocus.focus();
  }
}

function updateWindowState(isMaximized) {
  const button = query('.wm-max');
  if (!button) return;

  button.classList.toggle('is-maximized', Boolean(isMaximized));
  button.textContent = isMaximized ? '❐' : '□';
  button.title = isMaximized ? 'Restaurer' : 'Agrandir';
  button.setAttribute('aria-label', isMaximized ? 'Restaurer' : 'Agrandir');
}

function setActivePage(pageId) {
  const targetPage = byId(`page-${pageId}`);
  if (!targetPage) return;

  STATE.currentPage = pageId;

  queryAll('.nav-tab[data-page]').forEach((button) => {
    const isActive = button.dataset.page === pageId;
    button.classList.toggle('active', isActive);
    if (isActive) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  queryAll('.page').forEach((page) => {
    page.classList.toggle('active', page.id === `page-${pageId}`);
  });
}

function runLoader() {
  const fill = byId('loader-fill');
  const status = byId('loader-status');
  const percent = byId('loader-pct');
  const loader = byId('loader');
  const app = byId('app');

  const intervalId = window.setInterval(() => {
    if (loaderStepIndex >= LOADER_STEPS.length) {
      window.clearInterval(intervalId);
      window.setTimeout(() => {
        loader?.classList.add('hidden');
        loader?.setAttribute('aria-hidden', 'true');
        if (app) {
          app.style.opacity = '1';
          app.setAttribute('aria-hidden', 'false');
        }
        window.setTimeout(() => {
          if (loader) loader.style.display = 'none';
        }, 700);
      }, 600);
      return;
    }

    const step = LOADER_STEPS[loaderStepIndex];

    if (fill) fill.style.width = `${step.pct}%`;
    if (status) status.textContent = step.msg;
    if (percent) percent.textContent = `${step.pct}%`;
    query('.loader-track')?.setAttribute('aria-valuenow', String(step.pct));

    loaderStepIndex += 1;
  }, 420);
}

function applyConfigToUI() {
  const ipInput = byId('setting-ip');
  const portInput = byId('setting-port');
  const pathDisplay = byId('fivem-path-display');
  const musicToggle = byId('setting-music');
  const volumeSlider = byId('setting-volume');
  const volumeValue = byId('setting-volume-val');

  if (ipInput) ipInput.value = CONFIG.serverIp;
  if (portInput) portInput.value = String(CONFIG.serverPort);
  if (pathDisplay) {
    pathDisplay.textContent = CONFIG.fivemPath || 'Non détecté — cliquez sur Détecter ou Parcourir';
    pathDisplay.title = CONFIG.fivemPath || '';
  }
  if (musicToggle) musicToggle.checked = Boolean(CONFIG.musicEnabled);
  if (volumeSlider) {
    volumeSlider.value = String(CONFIG.musicVolume);
    volumeSlider.style.setProperty('--pct', `${CONFIG.musicVolume}%`);
  }
  if (volumeValue) volumeValue.textContent = `${CONFIG.musicVolume}%`;

  updateConnectionDisplays();
}

function normalizePlayer(player, index) {
  if (player && typeof player === 'object') {
    const name = String(player.name ?? player.Name ?? `Joueur ${index + 1}`).trim();
    const id = player.id ?? player.Id ?? null;
    const ping = Number.isFinite(player.ping) ? Math.round(player.ping) : null;
    return { name, id, ping };
  }

  return {
    name: String(player ?? `Joueur ${index + 1}`).trim(),
    id: null,
    ping: null,
  };
}

function normalizeServerInfo(rawInfo, connection) {
  const rawPlayers = Array.isArray(rawInfo?.players) ? rawInfo.players : [];
  const players = rawPlayers
    .map((player, index) => normalizePlayer(player, index))
    .filter((player) => player.name)
    .slice(0, 8);

  const playerCount = normalizePositiveInt(rawInfo?.playerCount, players.length);
  const maxPlayers = normalizePositiveInt(rawInfo?.maxPlayers, 127);
  const tags = Array.isArray(rawInfo?.tags)
    ? rawInfo.tags
    : String(rawInfo?.info?.vars?.sv_tags || rawInfo?.info?.vars?.tags || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

  return {
    online: Boolean(rawInfo?.online),
    ms: Number.isFinite(rawInfo?.ms) ? Math.round(rawInfo.ms) : null,
    players,
    playerCount,
    maxPlayers,
    hostname: String(rawInfo?.hostname || 'Royaume de Valdris').trim(),
    description: String(
      rawInfo?.description ||
      rawInfo?.info?.vars?.sv_projectDesc ||
      'Serveur RP médiéval principal — Guildes, politique, sièges de châteaux',
    ).trim(),
    mapname: String(rawInfo?.mapname || 'Valdris').trim(),
    gametype: String(rawInfo?.gametype || 'Medieval RP').trim(),
    connectAddress: String(rawInfo?.connectAddress || formatAddress(connection)),
    resources: normalizePositiveInt(rawInfo?.resources, 0),
    locale: String(rawInfo?.locale || '').trim(),
    tags,
  };
}

async function requestServerInfo(connection) {
  if (window.launcher?.getServerInfo) {
    return window.launcher.getServerInfo(connection.ip, connection.port);
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 4000);
  const baseUrl = `http://${connection.ip}:${connection.port}`;

  try {
    const start = Date.now();
    const [infoResult, playersResult] = await Promise.allSettled([
      fetch(`${baseUrl}/info.json`, { signal: controller.signal }),
      fetch(`${baseUrl}/players.json`, { signal: controller.signal }),
    ]);

    let info = null;
    let players = [];

    if (infoResult.status === 'fulfilled' && infoResult.value.ok) {
      info = await infoResult.value.json();
    }

    if (playersResult.status === 'fulfilled' && playersResult.value.ok) {
      players = await playersResult.value.json();
    }

    if (!info && !players.length) {
      return { online: false, connectAddress: formatAddress(connection) };
    }

    return {
      online: true,
      ms: Date.now() - start,
      playerCount: Array.isArray(players) ? players.length : 0,
      players,
      hostname: info?.vars?.sv_projectName || info?.hostname || 'Royaume de Valdris',
      maxPlayers: info?.vars?.sv_maxClients ?? 127,
      gametype: info?.vars?.gametype || 'Medieval RP',
      mapname: info?.vars?.mapname || 'Valdris',
      description: info?.vars?.sv_projectDesc || '',
      connectAddress: formatAddress(connection),
      info,
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function renderActivityFeed(info) {
  const container = byId('activity-items');
  if (!container) return;

  const items = [];

  if (info.online) {
    info.players.slice(0, 2).forEach((player) => {
      items.push({
        tone: 'green',
        highlight: player.name,
        suffix: ' patrouille actuellement le royaume',
        time: player.ping != null ? `${player.ping}ms` : 'En ligne',
      });
    });

    items.push({
      tone: info.playerCount > Math.max(10, Math.round(info.maxPlayers * 0.6)) ? 'blood' : 'gold',
      highlight: `${info.playerCount}/${info.maxPlayers}`,
      suffix: ` aventuriers actifs sur ${info.mapname}`,
      time: formatPing(info.ms),
    });
  } else {
    items.push({
      tone: 'blood',
      highlight: 'Serveur hors ligne',
      suffix: ` pour ${info.connectAddress}`,
      time: 'À vérifier',
    });
  }

  const feedItems = (items.length ? items : FALLBACK_ACTIVITY).slice(0, 3);

  container.replaceChildren();

  feedItems.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'act-item';

    const dot = document.createElement('span');
    dot.className = `act-dot ${item.tone}`;
    dot.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.className = 'act-text';

    if (item.highlight) {
      const strong = document.createElement('strong');
      strong.textContent = item.highlight;
      text.append(strong, document.createTextNode(item.suffix || ''));
    } else {
      text.textContent = item.suffix || '';
    }

    const time = document.createElement('span');
    time.className = 'act-time';
    time.textContent = item.time || '';

    row.append(dot, text, time);
    container.appendChild(row);
  });
}

function renderTicker(info) {
  const track = byId('ticker-inner');
  if (!track) return;

  const items = [];

  if (info.online) {
    items.push(
      { strong: `${info.playerCount} aventuriers`, body: `en ligne sur ${info.maxPlayers}` },
      { strong: 'Adresse', body: info.connectAddress },
      { strong: 'Monde actif', body: `${info.mapname} · ${info.gametype}` },
    );

    if (info.resources > 0) {
      items.push({ strong: 'Ressources', body: `${info.resources} chargées côté serveur` });
    }
  } else {
    items.push(
      { strong: 'Serveur hors ligne', body: `vérifie ${info.connectAddress}` },
      { strong: 'Forge', body: 'teste la connexion depuis les paramètres' },
    );
  }

  const finalItems = [...items, ...TICKER_FALLBACK];
  const duplicated = [...finalItems, ...finalItems];

  track.replaceChildren();

  duplicated.forEach((item, index) => {
    const entry = document.createElement('span');
    entry.className = 'ticker-item';

    const dot = document.createElement('span');
    dot.className = 'tdot';
    dot.setAttribute('aria-hidden', 'true');

    const strong = document.createElement('strong');
    strong.textContent = item.strong;

    entry.append(dot, strong, document.createTextNode(` — ${item.body}`));
    track.appendChild(entry);

    if (index < duplicated.length - 1) {
      const separator = document.createElement('span');
      separator.className = 'ticker-sep';
      separator.setAttribute('aria-hidden', 'true');
      separator.textContent = '✦';
      track.appendChild(separator);
    }
  });
}

function renderPlayerRoster(info) {
  const roster = byId('player-roster');
  const summary = byId('roster-summary');
  if (!roster || !summary) return;

  roster.replaceChildren();

  if (!info.online) {
    summary.textContent = `Serveur indisponible · ${info.connectAddress}`;

    const empty = document.createElement('div');
    empty.className = 'player-empty';
    empty.textContent = 'Impossible de récupérer la présence en direct tant que le serveur ne répond pas.';
    roster.appendChild(empty);
    return;
  }

  summary.textContent = `${info.playerCount} aventuriers connectés · ${formatPing(info.ms)} · ${info.mapname}`;

  if (!info.players.length) {
    const empty = document.createElement('div');
    empty.className = 'player-empty';
    empty.textContent = 'Le serveur répond mais aucun joueur n’est connecté pour le moment.';
    roster.appendChild(empty);
    return;
  }

  info.players.forEach((player) => {
    const card = document.createElement('div');
    card.className = 'player-card';

    const avatar = document.createElement('div');
    avatar.className = 'player-avatar';
    avatar.textContent = player.name.charAt(0).toUpperCase();

    const main = document.createElement('div');
    main.className = 'player-main';

    const name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = player.name;

    const meta = document.createElement('span');
    meta.className = 'player-meta';

    if (player.id != null && player.ping != null) meta.textContent = `ID #${player.id} · ${player.ping}ms`;
    else if (player.id != null) meta.textContent = `ID #${player.id}`;
    else if (player.ping != null) meta.textContent = `${player.ping}ms`;
    else meta.textContent = 'Connecté';

    main.append(name, meta);
    card.append(avatar, main);
    roster.appendChild(card);
  });
}

function renderServerSnapshot(info) {
  const pill = byId('server-pill');
  const pillText = pill?.querySelector('.status-text');
  const pingDisplay = byId('server-ping-display');
  const statOnline = byId('stat-online');
  const statCapacity = byId('stat-capacity');
  const heroDot = byId('hero-status-dot');
  const heroText = byId('hero-status-text');
  const mainCard = byId('server-card-main');
  const mainStatus = byId('scard-main-status');
  const mainPlayersBar = byId('server-main-players-bar');
  const mainPlayersCount = byId('server-main-players-count');
  const playSub = query('.play-sub');

  const isOnline = info.online;
  const statusText = isOnline ? 'Serveur actif' : 'Hors ligne';

  if (pill) {
    pill.classList.toggle('online', isOnline);
    pill.classList.toggle('offline', !isOnline);
  }
  if (pillText) pillText.textContent = statusText;
  if (pingDisplay) pingDisplay.textContent = isOnline ? formatPing(info.ms) : '—';

  setText(statOnline, isOnline ? String(info.playerCount) : '—');
  setText(statCapacity, String(info.maxPlayers));

  if (heroDot) heroDot.classList.toggle('online', isOnline);
  if (heroText) {
    heroText.classList.toggle('online', isOnline);
    heroText.textContent = isOnline
      ? `${statusText} · ${formatPing(info.ms)}`
      : `Serveur indisponible · ${info.connectAddress}`;
  }

  if (mainCard) {
    mainCard.dataset.online = String(isOnline);
    mainCard.classList.toggle('live-online', isOnline);
    mainCard.classList.toggle('live-offline', !isOnline);
    mainCard.dataset.tags = [
      'official',
      isOnline ? 'online' : 'offline',
      info.gametype,
      info.mapname,
      ...info.tags,
    ].join(' ').toLowerCase();
  }

  if (mainStatus) {
    mainStatus.classList.toggle('online', isOnline);
    mainStatus.classList.toggle('offline-status', !isOnline);
  }

  setText('scard-main-ping', isOnline ? formatPing(info.ms) : 'Hors ligne');
  setText('server-main-name', `🏰 ${info.hostname}`);
  setText('server-main-desc', info.description);
  setText('server-main-address', info.connectAddress);
  setText('server-main-map', info.mapname);
  setText('server-main-mode', info.gametype);
  setText('home-server-address', info.connectAddress);
  setText('home-server-players', `${info.playerCount} / ${info.maxPlayers}`);
  setText('home-server-map', info.mapname);
  setText('home-server-mode', info.gametype);

  if (playSub) playSub.textContent = `FiveM · ${info.gametype}`;

  const fillPercent = clamp(Math.round((info.playerCount / Math.max(info.maxPlayers, 1)) * 100), 0, 100);
  if (mainPlayersBar) mainPlayersBar.style.width = `${fillPercent}%`;
  if (mainPlayersCount) mainPlayersCount.textContent = `${info.playerCount} / ${info.maxPlayers}`;

  renderPlayerRoster(info);
  renderActivityFeed(info);
  renderTicker(info);
  setConnectionStatusBadge(isOnline ? 'online' : 'offline', isOnline ? 'En ligne' : 'Hors ligne');
  applyServerFilters();
}

async function refreshServerInfo(options = {}) {
  const { force = false, origin = 'auto' } = options;

  if (STATE.isRefreshingServerInfo && !force) return STATE.serverInfo;

  const refreshButton = byId('btn-refresh-server');
  const stopLoading = beginButtonLoading(refreshButton, 'Actualisation…');
  const connection = getConnection();

  STATE.isRefreshingServerInfo = true;
  setConnectionStatusBadge('sync', 'Analyse…');

  try {
    const rawInfo = await requestServerInfo(connection);
    const normalized = normalizeServerInfo(rawInfo, connection);
    const previousStatus = STATE.lastServerStatus;

    STATE.serverInfo = normalized;
    STATE.lastServerStatus = normalized.online;

    renderServerSnapshot(normalized);

    if (previousStatus === null) {
      addConsoleLog(
        normalized.online ? 'ok' : 'warn',
        normalized.online
          ? `Serveur détecté : ${normalized.hostname} (${normalized.connectAddress})`
          : `Serveur injoignable : ${normalized.connectAddress}`,
      );
    } else if (previousStatus !== normalized.online) {
      addConsoleLog(
        normalized.online ? 'ok' : 'warn',
        normalized.online ? `Le serveur est revenu en ligne (${formatPing(normalized.ms)})` : 'Le serveur ne répond plus.',
      );
      showNotif(
        normalized.online ? 'success' : 'warning',
        normalized.online ? 'Serveur de retour' : 'Serveur indisponible',
        normalized.online ? `${normalized.hostname} répond à nouveau.` : `Aucune réponse de ${normalized.connectAddress}.`,
      );
    } else if (origin === 'manual') {
      showNotif(
        normalized.online ? 'success' : 'warning',
        normalized.online ? 'Serveur joignable' : 'Toujours hors ligne',
        normalized.online
          ? `${normalized.hostname} répond en ${formatPing(normalized.ms)}.`
          : `Le diagnostic n'a reçu aucune réponse de ${normalized.connectAddress}.`,
      );
    }

    return normalized;
  } catch (error) {
    const offlineInfo = normalizeServerInfo({ online: false }, connection);
    STATE.serverInfo = offlineInfo;
    renderServerSnapshot(offlineInfo);
    addConsoleLog('err', `Erreur lors du rafraîchissement serveur : ${error.message}`);
    showNotif('error', 'Erreur serveur', error.message);
    return offlineInfo;
  } finally {
    STATE.isRefreshingServerInfo = false;
    stopLoading();
  }
}

function applyServerFilters() {
  const search = String(byId('server-search')?.value || '').trim().toLowerCase();
  const filter = String(byId('server-filter')?.value || 'all').toLowerCase();
  const cards = queryAll('[data-server-card]');
  const emptyState = byId('servers-empty');

  let visibleCount = 0;

  cards.forEach((card) => {
    const haystack = `${card.dataset.tags || ''} ${card.textContent || ''}`.toLowerCase();
    const matchesSearch = !search || haystack.includes(search);

    let matchesFilter = true;
    if (filter === 'online') matchesFilter = card.dataset.online === 'true';
    else if (filter !== 'all') matchesFilter = (card.dataset.tags || '').toLowerCase().includes(filter);

    const visible = matchesSearch && matchesFilter;
    card.classList.toggle('is-hidden-filter', !visible);
    if (visible) visibleCount += 1;
  });

  if (emptyState) emptyState.classList.toggle('hidden', visibleCount !== 0);
}

function updateNewsTimes() {
  queryAll('.ncard-date[datetime]').forEach((node) => {
    const datetime = node.getAttribute('datetime');
    if (!datetime) return;
    node.textContent = formatNewsDate(datetime);
  });
}

async function copyText(text, successTitle) {
  try {
    let copied = false;

    if (window.launcher?.copyText) {
      copied = await window.launcher.copyText(text);
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      copied = true;
    }

    if (!copied) throw new Error('API de copie indisponible.');

    showNotif('success', successTitle, text);
    addConsoleLog('ok', `Copié dans le presse-papiers : ${text}`);
    return true;
  } catch (error) {
    showNotif('error', 'Copie impossible', error.message);
    addConsoleLog('err', `Impossible de copier : ${error.message}`);
    return false;
  }
}

function copyConnectionAddress() {
  const info = STATE.serverInfo;
  const address = info?.connectAddress || formatAddress(getConnection());
  return copyText(address, 'Adresse copiée');
}

async function launchGame(options = {}) {
  const trigger = options.trigger instanceof HTMLElement ? options.trigger : byId('play-btn');
  const stopLoading = beginButtonLoading(
    trigger,
    trigger?.id === 'play-btn' ? 'CONNEXION…' : 'Connexion…',
  );

  const connection = getConnection(options);
  addConsoleLog('info', `Lancement FiveM → ${connection.ip}:${connection.port}`);

  try {
    if (!window.launcher?.launchGame) {
      showNotif('info', 'Mode aperçu', 'FiveM ne peut être lancé que dans Electron.');
      addConsoleLog('warn', 'Lancement simulé hors Electron.');
      return;
    }

    const result = await window.launcher.launchGame(connection);
    if (!result?.ok) throw new Error(result?.error || 'Le lancement a échoué.');

    const methodLabel = ({
      'uri-scheme': 'URI FiveM',
      'spawn-exe': 'exécutable direct',
      'uri-fallback': 'URI de secours',
      'uri-final-fallback': 'URI finale de secours',
    })[result.method] || result.method || 'méthode inconnue';

    addConsoleLog('ok', `FiveM lancé via ${methodLabel}`);

    if (result.warning) {
      addConsoleLog('warn', result.warning);
      showNotif('warning', 'Lancement avec avertissement', result.warning);
    } else {
      showNotif('success', 'Connexion en cours', `FiveM tente de rejoindre ${connection.ip}:${connection.port}.`);
    }
  } catch (error) {
    addConsoleLog('err', error.message);
    showNotif('error', 'Échec du lancement', error.message);
  } finally {
    stopLoading();
  }
}

async function handleAutoDetectFiveM({ notifyIfMissing = false } = {}) {
  if (!window.launcher?.detectFiveM) return null;

  try {
    const detected = await window.launcher.detectFiveM();
    if (!detected) {
      if (notifyIfMissing) showNotif('warning', 'Détection introuvable', 'Aucun FiveM.exe détecté automatiquement.');
      return null;
    }

    CONFIG.fivemPath = detected;
    await persistConfig({ fivemPath: detected });
    applyConfigToUI();
    addConsoleLog('ok', `FiveM détecté automatiquement : ${detected}`);

    if (notifyIfMissing) showNotif('success', 'FiveM détecté', detected);
    return detected;
  } catch (error) {
    addConsoleLog('err', `Détection FiveM impossible : ${error.message}`);
    showNotif('error', 'Détection impossible', error.message);
    return null;
  }
}

function initWindowControls() {
  query('.wm-min')?.addEventListener('click', () => window.launcher?.minimize?.());
  query('.wm-max')?.addEventListener('click', () => window.launcher?.maximize?.());
  query('.wm-cls')?.addEventListener('click', () => window.launcher?.close?.());

  if (window.launcher?.on) {
    window.launcher.on('window-state', (state) => updateWindowState(state?.isMaximized));
  }

  window.launcher?.getWindowState?.()
    .then((state) => updateWindowState(state?.isMaximized))
    .catch(() => {});
}

function initNavigation() {
  queryAll('.nav-tab[data-page]').forEach((button) => {
    button.addEventListener('click', () => setActivePage(button.dataset.page));
  });
}

function initConsole() {
  byId('btn-open-console')?.addEventListener('click', (event) => openConsole(event.currentTarget));
  byId('btn-close-console')?.addEventListener('click', closeConsole);

  byId('console-overlay')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeConsole();
  });
}

function initSidebarLinks() {
  queryAll('.slink[data-url]').forEach((link) => {
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      const url = link.dataset.url || '';

      if (!url || url.includes('VOTRE_')) {
        showNotif('warning', 'Lien de démonstration', 'Remplace les URLs de démonstration avant la release.');
        return;
      }

      if (window.launcher?.openExternal) {
        const result = await window.launcher.openExternal(url);
        if (!result?.ok) showNotif('error', 'Lien refusé', result?.error || 'URL non autorisée');
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    });
  });
}

function initServerLogs() {
  if (!window.launcher?.on) return;

  window.launcher.on('server-output', (data) => {
    String(data).split('\n').map((line) => line.trim()).filter(Boolean).forEach((line) => addConsoleLog('info', line));
  });

  window.launcher.on('server-error', (data) => {
    String(data).split('\n').map((line) => line.trim()).filter(Boolean).forEach((line) => addConsoleLog('err', line));
  });

  window.launcher.on('server-closed', (code) => {
    addConsoleLog('warn', `Serveur local terminé (code ${code})`);
  });
}

function initSettingsPage() {
  const ipInput = byId('setting-ip');
  const portInput = byId('setting-port');
  const volumeSlider = byId('setting-volume');
  const volumeValue = byId('setting-volume-val');

  ipInput?.addEventListener('change', () => {
    const value = sanitizeHost(ipInput.value);
    if (!value) {
      ipInput.value = CONFIG.serverIp;
      showNotif('error', 'Adresse invalide', 'Utilise une IP, localhost ou un nom de domaine simple.');
      return;
    }

    saveField('serverIp', value);
    updateConnectionDisplays();
    addConsoleLog('info', `Adresse serveur mise à jour : ${value}:${CONFIG.serverPort}`);
    void refreshServerInfo({ force: true, origin: 'manual' });
  });

  portInput?.addEventListener('change', () => {
    const value = normalizePort(portInput.value, -1);
    if (value === -1) {
      portInput.value = String(CONFIG.serverPort);
      showNotif('error', 'Port invalide', 'Le port doit être compris entre 1 et 65535.');
      return;
    }

    saveField('serverPort', value);
    updateConnectionDisplays();
    addConsoleLog('info', `Port serveur mis à jour : ${CONFIG.serverIp}:${value}`);
    void refreshServerInfo({ force: true, origin: 'manual' });
  });

  byId('btn-autodetect-fivem')?.addEventListener('click', () => {
    void handleAutoDetectFiveM({ notifyIfMissing: true });
  });

  byId('btn-browse-fivem')?.addEventListener('click', async () => {
    if (!window.launcher?.selectPath) return;

    const selected = await window.launcher.selectPath();
    if (!selected) return;

    CONFIG.fivemPath = selected;
    await persistConfig({ fivemPath: selected });
    applyConfigToUI();
    addConsoleLog('ok', `FiveM.exe sélectionné : ${selected}`);
    showNotif('success', 'Chemin enregistré', selected);
  });

  byId('btn-test-connection')?.addEventListener('click', () => {
    void refreshServerInfo({ force: true, origin: 'manual' });
  });

  byId('btn-copy-address')?.addEventListener('click', () => {
    void copyConnectionAddress();
  });

  byId('setting-music')?.addEventListener('change', (event) => {
    void saveField('musicEnabled', Boolean(event.currentTarget.checked));
  });

  volumeSlider?.addEventListener('input', () => {
    const value = clamp(Number.parseInt(volumeSlider.value, 10) || 0, 0, 100);
    volumeSlider.style.setProperty('--pct', `${value}%`);
    if (volumeValue) volumeValue.textContent = `${value}%`;
    void saveField('musicVolume', value);
  });
}

function initPrimaryActions() {
  byId('play-btn')?.addEventListener('click', (event) => {
    void launchGame({ trigger: event.currentTarget });
  });

  byId('btn-join-main')?.addEventListener('click', (event) => {
    void launchGame({ trigger: event.currentTarget });
  });

  byId('btn-join-local')?.addEventListener('click', (event) => {
    addConsoleLog('info', `Preset local activé → ${LOCAL_SERVER_PRESET.ip}:${LOCAL_SERVER_PRESET.port}`);
    showNotif('info', 'Preset local', 'Connexion vers 127.0.0.1:30120.');
    void launchGame({ ...LOCAL_SERVER_PRESET, trigger: event.currentTarget });
  });

  byId('btn-refresh-server')?.addEventListener('click', () => {
    void refreshServerInfo({ force: true, origin: 'manual' });
  });

  byId('btn-copy-connect')?.addEventListener('click', () => {
    void copyConnectionAddress();
  });
}

function initServerFilters() {
  byId('server-search')?.addEventListener('input', applyServerFilters);
  byId('server-filter')?.addEventListener('change', applyServerFilters);
  applyServerFilters();
}

function initVersion() {
  if (!window.launcher?.getVersion) return;

  window.launcher.getVersion()
    .then((version) => {
      if (!version) return;
      setText(query('.tb-version'), `v${version}`);
      setText(query('.loader-version'), `v${version}`);
    })
    .catch(() => {});
}

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeConsole();
      return;
    }

    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      openConsole(byId('btn-open-console'));
      return;
    }

    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault();
      void launchGame({ trigger: byId('play-btn') });
      return;
    }

    if (event.ctrlKey && /^[1-4]$/.test(event.key)) {
      event.preventDefault();
      const pages = ['home', 'servers', 'news', 'settings'];
      setActivePage(pages[Number(event.key) - 1]);
    }
  });
}

function startTimers() {
  STATE.refreshTimerId = window.setInterval(() => {
    void refreshServerInfo();
  }, REFRESH_INTERVAL_MS);

  STATE.newsTimerId = window.setInterval(updateNewsTimes, NEWS_REFRESH_INTERVAL_MS);
}

window.addEventListener('DOMContentLoaded', async () => {
  if (window.launcher?.getConfig) {
    try {
      const saved = await window.launcher.getConfig();
      CONFIG = { ...DEFAULT_CONFIG, ...saved };
    } catch {
      CONFIG = { ...DEFAULT_CONFIG };
    }
  }

  initVersion();
  applyConfigToUI();
  runLoader();

  initWindowControls();
  initNavigation();
  initConsole();
  initSidebarLinks();
  initSettingsPage();
  initPrimaryActions();
  initServerFilters();
  initServerLogs();
  initKeyboardShortcuts();
  updateNewsTimes();
  startTimers();

  updateConnectionDisplays();
  setConnectionStatusBadge('sync', 'Analyse…');

  window.setTimeout(() => {
    void refreshServerInfo({ origin: 'init' });
  }, 1600);

  window.setTimeout(() => {
    if (!CONFIG.fivemPath) void handleAutoDetectFiveM();
  }, 2200);
});
