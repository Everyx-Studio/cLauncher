// discord-rpc.mjs — Rich Presence Discord · Royaume de Valdris Launcher
// Dépendance : npm install discord-rpc
// Intégration : importé dans main.mjs, initialisé après app.whenReady()

import DiscordRPC from 'discord-rpc';

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

// À créer sur https://discord.com/developers/applications
// Large image key : uploadée dans l'onglet "Rich Presence > Art Assets" de votre app Discord
const CLIENT_ID     = '1492886749435789352';
const LARGE_IMAGE   = 'valdris_logo';        // clé de l'asset uploadé
const LARGE_TEXT    = 'Royaume de Valdris';
const SMALL_IMAGE_ONLINE  = 'status_online';  // asset vert
const SMALL_IMAGE_OFFLINE = 'status_offline'; // asset rouge

// Délai minimum entre deux setActivity (Discord rate-limit : 1 update / 15s)
const UPDATE_INTERVAL_MS = 15_000;

// ─── ÉTATS POSSIBLES ──────────────────────────────────────────────────────────

export const RpcState = Object.freeze({
  IDLE:        'idle',        // Launcher ouvert, pas encore sur l'accueil
  BROWSING:    'browsing',    // Navigation dans le launcher
  IN_GAME:     'in_game',     // FiveM lancé
  SETTINGS:    'settings',    // Page Forge ouverte
});

// ─── MODULE ───────────────────────────────────────────────────────────────────

class ValdrisRPC {
  #client       = null;
  #ready        = false;
  #timer        = null;
  #currentState = RpcState.IDLE;
  #serverInfo   = null;   // { online, playerCount, maxPlayers, hostname }
  #startTime    = null;

  // ── init ──────────────────────────────────────────────────────────────────
  // Appelé une seule fois depuis main.mjs après app.whenReady().
  // Retourne une promesse — l'échec est silencieux pour ne pas bloquer le launcher.

  async init() {
    try {
      DiscordRPC.register(CLIENT_ID);
      this.#client = new DiscordRPC.Client({ transport: 'ipc' });

      this.#client.on('ready', () => {
        this.#ready     = true;
        this.#startTime = Date.now();
        this.#push();
        this.#startLoop();
        console.log('[RPC] Connecté — Discord:', this.#client.user?.username);
      });

      this.#client.on('disconnected', () => {
        this.#ready = false;
        this.#stopLoop();
        console.warn('[RPC] Déconnecté, tentative de reconnexion dans 30s...');
        setTimeout(() => this.#reconnect(), 30_000);
      });

      await this.#client.login({ clientId: CLIENT_ID });
    } catch (err) {
      // Discord fermé ou pas installé → pas critique
      console.warn('[RPC] Initialisation ignorée :', err.message);
    }
  }

  // ── API publique ──────────────────────────────────────────────────────────

  // Appelé depuis main.mjs quand la page active change (ipc : 'rpc-set-state')
  setState(state, meta = {}) {
    if (!Object.values(RpcState).includes(state)) return;
    this.#currentState = state;
    if (meta.serverInfo) this.#serverInfo = meta.serverInfo;
    this.#push();
  }

  // Mise à jour des infos serveur sans changer d'état (depuis le ping loop)
  updateServerInfo(serverInfo) {
    this.#serverInfo = serverInfo;
    if (this.#currentState === RpcState.BROWSING) this.#push();
  }

  destroy() {
    this.#stopLoop();
    try { this.#client?.destroy(); } catch { /* déjà détruit */ }
    this.#ready = false;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  #startLoop() {
    this.#timer = setInterval(() => this.#push(), UPDATE_INTERVAL_MS);
  }

  #stopLoop() {
    if (this.#timer) { clearInterval(this.#timer); this.#timer = null; }
  }

  async #reconnect() {
    if (this.#ready) return;
    try {
      await this.#client?.login({ clientId: CLIENT_ID });
    } catch {
      setTimeout(() => this.#reconnect(), 60_000);
    }
  }

  #buildActivity() {
    const base = {
      largeImageKey:  LARGE_IMAGE,
      largeImageText: LARGE_TEXT,
      startTimestamp: this.#startTime,
      instance:       false,
    };

    switch (this.#currentState) {

      case RpcState.IDLE:
        return {
          ...base,
          details: 'Dans le launcher',
          state:   'Chargement en cours...',
          smallImageKey:  SMALL_IMAGE_OFFLINE,
          smallImageText: 'Non connecté',
        };

      case RpcState.BROWSING: {
        const srv = this.#serverInfo;
        const serverOnline = srv?.online;
        return {
          ...base,
          details: serverOnline
            ? `${srv.hostname ?? 'Royaume de Valdris'}`
            : 'Serveur hors ligne',
          state: serverOnline
            ? `${srv.playerCount ?? 0} / ${srv.maxPlayers ?? 127} joueurs`
            : 'En attente du serveur',
          smallImageKey:  serverOnline ? SMALL_IMAGE_ONLINE : SMALL_IMAGE_OFFLINE,
          smallImageText: serverOnline ? `Ping : ${srv.ms ?? '—'}ms` : 'Offline',
          buttons: [
            { label: '⚔ Rejoindre le serveur', url: 'https://discord.gg/VOTRE_INVITE' },
          ],
        };
      }

      case RpcState.IN_GAME: {
        const srv = this.#serverInfo;
        return {
          ...base,
          details: 'En jeu — Royaume de Valdris',
          state: srv?.playerCount != null
            ? `${srv.playerCount} / ${srv.maxPlayers ?? 127} joueurs en ligne`
            : 'Connexion au serveur...',
          smallImageKey:  SMALL_IMAGE_ONLINE,
          smallImageText: 'En jeu',
          buttons: [
            { label: '⚔ Rejoindre', url: 'https://discord.gg/VOTRE_INVITE' },
          ],
        };
      }

      case RpcState.SETTINGS:
        return {
          ...base,
          details: 'Configuration du launcher',
          state:   'Page Forge',
          smallImageKey:  SMALL_IMAGE_OFFLINE,
          smallImageText: 'Forge',
        };

      default:
        return base;
    }
  }

  #push() {
    if (!this.#ready) return;
    try {
      this.#client.setActivity(this.#buildActivity());
    } catch (err) {
      console.warn('[RPC] setActivity échoué :', err.message);
    }
  }
}

// Singleton — une seule instance pour tout le processus principal
export const rpc = new ValdrisRPC();
