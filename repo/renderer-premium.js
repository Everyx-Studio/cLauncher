// renderer-premium.js — Logique UI · Royaume de Valdris Launcher v2.1
// Corrections :
//   - Config chargée depuis le disque au démarrage (window.launcher.getConfig)
//   - launchGame() utilise window.launcher.launchGame() → vrai spawn IPC
//   - Ping serveur passe par window.launcher.pingServer() (IPC → no CORS)
//   - Page Forge : chemin FiveM, IP, Port, audio → sauvegardés
//   - Console branchée sur server-output / server-error IPC réels
//   - Tous les window.launcher.minimize/maximize/close fonctionnent

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
  { pct: 10,  msg: 'Invocation des runes…'           },
  { pct: 25,  msg: 'Chargement des parchemins…'      },
  { pct: 40,  msg: 'Forgeage des armures…'           },
  { pct: 58,  msg: 'Convocation des guildes…'        },
  { pct: 72,  msg: 'Ouverture des portes du château…'},
  { pct: 88,  msg: 'Connexion au Royaume…'           },
  { pct: 100, msg: 'Bienvenue, Seigneur.'            },
]

let stepIndex = 0

function runLoader () {
  const fill   = document.getElementById('loader-fill')
  const status = document.getElementById('loader-status')
  const pctEl  = document.getElementById('loader-pct')

  const interval = setInterval(() => {
    if (stepIndex >= LOADER_STEPS.length) {
      clearInterval(interval)
      setTimeout(() => {
        document.getElementById('loader').classList.add('hidden')
        const app = document.getElementById('app')
        app.style.opacity = '1'
      }, 600)
      return
    }
    const step = LOADER_STEPS[stepIndex]
    if (fill)   fill.style.width   = step.pct + '%'
    if (status) status.textContent = step.msg
    if (pctEl)  pctEl.textContent  = step.pct + '%'
    stepIndex++
  }, 420)
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────

document.querySelectorAll('.nav-tab[data-page]').forEach(btn => {
  btn.addEventListener('click', () => {
    const page = btn.dataset.page
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'))
    document.querySelectorAll('.page').forEach(p  => p.classList.remove('active'))
    btn.classList.add('active')
    const target = document.getElementById('page-' + page)
    if (target) target.classList.add('active')
  })
})

// ─── LANCEMENT DU JEU ─────────────────────────────────────────────────────────

async function launchGame (opts = {}) {
  const btn = document.getElementById('play-btn')
  if (!btn) return

  btn.classList.add('loading')
  const label = btn.querySelector('.play-label')
  if (label) label.textContent = 'CONNEXION…'

  const ip   = CONFIG.serverIp   || '127.0.0.1'
  const port = CONFIG.serverPort || 30120

  addConsoleLog('info', `[SYS] Lancement FiveM → ${ip}:${port}`)

  // ── Mode Electron ──────────────────────────────────────────────
  if (window.launcher) {
    const launchOpts = {
      ip,
      port,
      fivemPath: CONFIG.fivemPath || '',
      ...opts,
    }

    try {
      const result = await window.launcher.launchGame(launchOpts)

      if (result.ok) {
        const methodLabel = {
          'uri-scheme':        'URI scheme fivem://',
          'spawn-exe':         'exécutable direct',
          'uri-fallback':      'URI (fallback)',
          'uri-final-fallback':'URI (fallback final)',
        }[result.method] || result.method

        addConsoleLog('ok', `[OK] FiveM lancé via ${methodLabel}`)

        if (result.warning) {
          addConsoleLog('warn', `[AVERT] ${result.warning}`)
          showNotif('warning', '⚠ Avertissement', result.warning)
        } else {
          showNotif('success', '⚔ Lancement', `Connexion en cours vers ${ip}:${port}…`)
        }
      } else {
        addConsoleLog('err', `[ERR] ${result.error}`)
        showNotif('error', '✕ Échec du lancement', result.error)
      }
    } catch (err) {
      addConsoleLog('err', `[ERR] Exception : ${err.message}`)
      showNotif('error', '✕ Erreur inattendue', err.message)
    } finally {
      btn.classList.remove('loading')
      if (label) label.textContent = 'JOUER'
    }

  // ── Mode navigateur (aperçu sans Electron) ─────────────────────
  } else {
    addConsoleLog('info', '[SYS] Mode navigateur — simulation uniquement')
    showNotif('info', '📜 Simulation', 'FiveM ne peut pas être lancé hors Electron.')
    setTimeout(() => {
      btn.classList.remove('loading')
      if (label) label.textContent = 'JOUER'
      addConsoleLog('ok', '[OK] Simulation terminée')
    }, 2500)
  }
}

// ─── CONSOLE ──────────────────────────────────────────────────────────────────

function openConsole () {
  document.getElementById('console-overlay').classList.remove('hidden')
}

function closeConsole () {
  document.getElementById('console-overlay').classList.add('hidden')
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeConsole()
})

document.getElementById('console-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeConsole()
})

function addConsoleLog (type, text) {
  const body = document.getElementById('console-body')
  if (!body) return
  const line = document.createElement('div')
  line.className = 'clog ' + type

  const prefix = document.createElement('span')
  prefix.className = 'clog-prefix'

  const prefixMap = { ok: '[OK]', err: '[ERR]', info: '[SYS]', warn: '[AVERT]' }
  prefix.textContent = prefixMap[type] || '[LOG]'

  // Retire le préfixe du texte s'il est déjà inclus
  const cleanText = text.replace(/^\[(OK|ERR|SYS|AVERT|LOG|WLD|PLR)\]\s*/i, '')

  line.appendChild(prefix)
  line.appendChild(document.createTextNode(' ' + cleanText))
  body.appendChild(line)
  body.scrollTop = body.scrollHeight
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

function showNotif (type, title, body) {
  const stack = document.getElementById('notif-stack')
  if (!stack) return

  const el = document.createElement('div')
  el.className = `notif ${type}`
  el.innerHTML = `
    <div class="notif-timer"></div>
    <div class="notif-icon">${{ success: '⚔', error: '✕', warning: '⚠', info: '📜' }[type] || '📜'}</div>
    <div class="notif-content">
      <span class="notif-title">${title}</span>
      <span class="notif-body">${body}</span>
    </div>
    <button class="notif-close" onclick="this.parentElement.remove()">✕</button>
  `
  stack.appendChild(el)
  setTimeout(() => el.classList.add('fade-out'), 4000)
  setTimeout(() => el.remove(), 4500)
}

// ─── PING SERVEUR ─────────────────────────────────────────────────────────────

async function pingServer () {
  const pingEl = document.getElementById('server-ping-display')
  const pill   = document.getElementById('server-pill')
  const txt    = pill?.querySelector('.status-text')

  try {
    let result

    if (window.launcher) {
      // Ping via IPC (processus principal) — pas de CORS
      result = await window.launcher.pingServer(CONFIG.serverIp, CONFIG.serverPort)
    } else {
      // Fallback navigateur
      const start = Date.now()
      await fetch(`http://${CONFIG.serverIp}:${CONFIG.serverPort}/info.json`, {
        signal: AbortSignal.timeout(2500),
      })
      result = { online: true, ms: Date.now() - start }
    }

    if (result.online) {
      if (pingEl) pingEl.textContent = result.ms + 'ms'
      if (pill) { pill.classList.remove('offline'); pill.classList.add('online') }
      if (txt)  txt.textContent = 'Serveur actif'
    } else {
      throw new Error('offline')
    }
  } catch {
    if (pingEl) pingEl.textContent = '—'
    if (pill)  { pill.classList.remove('online'); pill.classList.add('offline') }
    if (txt)    txt.textContent = 'Hors ligne'
  }
}

// ─── PAGE FORGE (SETTINGS) ────────────────────────────────────────────────────

function applyConfigToUI () {
  const ipInput   = document.getElementById('setting-ip')
  const portInput = document.getElementById('setting-port')
  const pathDisp  = document.getElementById('fivem-path-display')
  const musicChk  = document.getElementById('setting-music')
  const volSlider = document.getElementById('setting-volume')
  const volVal    = document.getElementById('setting-volume-val')

  if (ipInput)   ipInput.value       = CONFIG.serverIp
  if (portInput) portInput.value     = CONFIG.serverPort
  if (pathDisp)  pathDisp.textContent = CONFIG.fivemPath || 'Non détecté — cliquez sur Parcourir'
  if (musicChk)  musicChk.checked    = CONFIG.musicEnabled
  if (volSlider) {
    volSlider.value = CONFIG.musicVolume
    volSlider.style.setProperty('--pct', CONFIG.musicVolume + '%')
  }
  if (volVal)    volVal.textContent  = CONFIG.musicVolume + '%'
}

function saveField (key, value) {
  CONFIG[key] = value
  if (window.launcher) {
    window.launcher.setConfig({ [key]: value })
  }
}

function initSettingsPage () {
  // Champ IP
  const ipInput = document.getElementById('setting-ip')
  if (ipInput) {
    ipInput.addEventListener('change', () => saveField('serverIp', ipInput.value.trim()))
  }

  // Champ Port
  const portInput = document.getElementById('setting-port')
  if (portInput) {
    portInput.addEventListener('change', () => {
      const v = parseInt(portInput.value, 10)
      if (v > 0 && v < 65536) saveField('serverPort', v)
    })
  }

  // Bouton Parcourir FiveM
  const browseBtn = document.getElementById('btn-browse-fivem')
  if (browseBtn && window.launcher) {
    browseBtn.addEventListener('click', async () => {
      const chosen = await window.launcher.selectPath()
      if (chosen) {
        saveField('fivemPath', chosen)
        const pathDisp = document.getElementById('fivem-path-display')
        if (pathDisp) pathDisp.textContent = chosen
        showNotif('success', '⚔ Chemin enregistré', chosen)
        addConsoleLog('ok', `[OK] FiveM.exe → ${chosen}`)
      }
    })
  }

  // Toggle musique
  const musicChk = document.getElementById('setting-music')
  if (musicChk) {
    musicChk.addEventListener('change', () => saveField('musicEnabled', musicChk.checked))
  }

  // Slider volume
  const volSlider = document.getElementById('setting-volume')
  const volVal    = document.getElementById('setting-volume-val')
  if (volSlider) {
    volSlider.addEventListener('input', () => {
      const v = parseInt(volSlider.value, 10)
      volSlider.style.setProperty('--pct', v + '%')
      if (volVal) volVal.textContent = v + '%'
      saveField('musicVolume', v)
    })
  }
}

// ─── ÉCOUTE LOGS SERVEUR LOCAL (IPC) ──────────────────────────────────────────

function initServerLogs () {
  if (!window.launcher) return

  window.launcher.on('server-output', data => {
    data.split('\n').filter(Boolean).forEach(line => addConsoleLog('info', line))
  })
  window.launcher.on('server-error', data => {
    data.split('\n').filter(Boolean).forEach(line => addConsoleLog('err', line))
  })
  window.launcher.on('server-closed', code => {
    addConsoleLog('warn', `[AVERT] Serveur local terminé (code ${code})`)
  })
}

// ─── DÉTECTION AUTO FIVEM AU DÉMARRAGE ───────────────────────────────────────

async function autoDetectFiveM () {
  if (!window.launcher) return
  if (CONFIG.fivemPath) return  // déjà configuré

  const detected = await window.launcher.detectFiveM()
  if (detected) {
    CONFIG.fivemPath = detected
    await window.launcher.setConfig({ fivemPath: detected })
    const pathDisp = document.getElementById('fivem-path-display')
    if (pathDisp) pathDisp.textContent = detected
    addConsoleLog('ok', `[OK] FiveM détecté automatiquement : ${detected}`)
  } else {
    addConsoleLog('info', '[SYS] FiveM non détecté — configurez le chemin dans Forge.')
  }
}

// ─── MISE À JOUR DES IDS HTML (pour éviter les querySelector nuls) ────────────
// Les IDs des champs settings dans le HTML d'origine n'ont pas d'ID.
// On les injecte dynamiquement pour rester compatible sans toucher le HTML.

function patchSettingsDOM () {
  // Champs dans .set-group (chemin FiveM, IP, Port, musique, volume)
  const inputs = document.querySelectorAll('.set-input')
  const toggles = document.querySelectorAll('.toggle-label input[type="checkbox"]')
  const slider  = document.querySelector('.set-slider')
  const sliderVal = document.querySelector('.slider-val')
  const pathDiv   = document.querySelector('.path-display')
  const browseBtns = document.querySelectorAll('.set-btn')

  // IP (1er input texte), Port (2e input)
  const textInputs   = [...inputs].filter(i => i.type === 'text')
  const numberInputs = [...inputs].filter(i => i.type === 'number')

  if (textInputs[0] && !textInputs[0].id)   textInputs[0].id   = 'setting-ip'
  if (numberInputs[0] && !numberInputs[0].id) numberInputs[0].id = 'setting-port'
  if (pathDiv && !pathDiv.id)                pathDiv.id          = 'fivem-path-display'
  if (browseBtns[0] && !browseBtns[0].id)   browseBtns[0].id    = 'btn-browse-fivem'
  if (toggles[0] && !toggles[0].id)         toggles[0].id       = 'setting-music'
  if (slider && !slider.id)                  slider.id           = 'setting-volume'
  if (sliderVal && !sliderVal.id)            sliderVal.id        = 'setting-volume-val'
}

// ─── INIT PRINCIPAL ───────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {

  // 1. Charger la config persistante
  if (window.launcher) {
    try {
      const saved = await window.launcher.getConfig()
      CONFIG = { ...CONFIG, ...saved }
    } catch {
      // config introuvable → valeurs par défaut
    }
  }

  // 2. Lancer le loader visuel
  runLoader()

  // 3. Préparer les IDs DOM manquants dans les settings
  patchSettingsDOM()

  // 4. Appliquer la config à l'UI
  applyConfigToUI()

  // 5. Brancher les événements de la page Forge
  initSettingsPage()

  // 6. Brancher les logs serveur IPC
  initServerLogs()

  // 7. Premier ping (décalé pour laisser l'interface s'afficher)
  setTimeout(pingServer, 1800)
  setInterval(pingServer, 30_000)

  // 8. Détection auto FiveM (en arrière-plan)
  setTimeout(autoDetectFiveM, 2500)
})

// ─── EXPORTS GLOBAUX (appelés depuis les onclick HTML) ────────────────────────
// Ces fonctions doivent rester globales car elles sont référencées
// directement dans les attributs onclick du HTML.

window.launchGame  = launchGame
window.openConsole = openConsole
window.closeConsole = closeConsole
