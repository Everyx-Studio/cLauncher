<div align="center">

```
██╗   ██╗ █████╗ ██╗      ██████╗ ██████╗ ██╗███████╗
██║   ██║██╔══██╗██║      ██╔══██╗██╔══██╗██║██╔════╝
██║   ██║███████║██║      ██║  ██║██████╔╝██║███████╗
╚██╗ ██╔╝██╔══██║██║      ██║  ██║██╔══██╗██║╚════██║
 ╚████╔╝ ██║  ██║███████╗ ██████╔╝██║  ██║██║███████║
  ╚═══╝  ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝╚══════╝
         ROYAUME DE VALDRIS — LAUNCHER v1.0
```

![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron&logoColor=white)
![Node](https://img.shields.io/badge/Node-20+-339933?logo=node.js&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![License](https://img.shields.io/badge/License-MIT-gold)
![Build](https://img.shields.io/github/actions/workflow/status/VOTRE_USERNAME/medieval-rp-launcher/build.yml?label=build)

**Launcher desktop pour serveur FiveM médiéval RP.**  
Écran de chargement animé, navigation par onglets, lancement FiveM réel via URI scheme officiel, config persistante, ping serveur en temps réel.

</div>

---

## Aperçu

| Loader | Accueil | Forge |
|--------|---------|-------|
| Écran d'intro animé avec bouclier, anneaux rotatifs et barre de progression thématique | Vue principale avec hero animé (flammes, brume, gradient sang), stats serveur live et bouton de lancement | Page de configuration : chemin FiveM, IP/port serveur, volume — tout persisté entre les sessions |

> **Direction artistique :** Dark Medieval Fantasy, inspiré The Witcher / Dark Souls / Elden Ring.  
> Police principale : Cinzel Decorative. Fond : multi-couches avec grain film, vignetage et halo animé.

---

## Prérequis

- **Node.js** ≥ 20 (`node --version`)
- **FiveM** installé sur la machine cible
- Windows 10+ pour le lancement via URI scheme `fivem://`

---

## Installation

```bash
git clone https://github.com/VOTRE_USERNAME/medieval-rp-launcher.git
cd medieval-rp-launcher
npm install
npm run dev
```

C'est tout. Le launcher détecte automatiquement FiveM.exe dans les chemins courants au premier démarrage.

---

## Configuration

La config est stockée dans le `userData` d'Electron en JSON — pas dans le repo, pas dans le registry.

| Clé | Type | Défaut | Description |
|-----|------|--------|-------------|
| `fivemPath` | `string` | `""` | Chemin absolu vers FiveM.exe. Si vide, le launcher utilise l'URI scheme. |
| `serverIp` | `string` | `"127.0.0.1"` | IP du serveur FiveM cible |
| `serverPort` | `number` | `30120` | Port du serveur |
| `musicEnabled` | `boolean` | `true` | Musique d'ambiance du launcher |
| `musicVolume` | `number` | `65` | Volume (0–100) |

**Emplacement selon l'OS :**
```
Windows : C:\Users\<user>\AppData\Roaming\medieval-rp-launcher\launcher-config.json
macOS   : ~/Library/Application Support/medieval-rp-launcher/launcher-config.json
Linux   : ~/.config/medieval-rp-launcher/launcher-config.json
```

---

## Comment fonctionne le lancement

Deux stratégies, dans l'ordre :

**1. Spawn direct** — si un chemin vers FiveM.exe est configuré :
```
FiveM.exe +connect IP:PORT
```

**2. URI scheme** — mécanisme officiel CFX, aucun chemin requis :
```
fivem://connect/IP:PORT
```

FiveM gère lui-même l'authentification Rockstar/CFX dans les deux cas. Ce launcher n'intervient pas dans ce flux — et c'est intentionnel.

---

## Structure du projet

```
medieval-rp-launcher/
│
├── main.mjs               # Processus principal Electron
│                          # Window controls, IPC handlers, détection FiveM,
│                          # lancement, ping serveur, persistance config
│
├── preload.mjs            # Bridge contextBridge → window.launcher
│                          # Expose l'API au renderer avec isolation stricte
│
├── renderer-premium.js    # Logique UI
│                          # Loader animé, navigation, lancement, console,
│                          # notifications, ping, settings page
│
├── index.html             # Structure HTML complète
│                          # Loader, titlebar, sidebar, pages, console overlay
│
├── css/
│   ├── rules.css          # Design tokens (:root variables) + reset
│   ├── loader.css         # Styles de l'écran de chargement
│   └── style.css          # Tout le reste — ~2300 lignes
│
├── assets/                # Icônes pour le build (à fournir)
│   ├── icon.ico           # Windows
│   ├── icon.icns          # macOS
│   └── icon.png           # Linux (512×512)
│
└── .github/workflows/
    └── build.yml          # CI : build Win/Mac/Linux + release automatique
```

---

## Build & distribution

```bash
# Toutes les plateformes depuis la machine courante
npm run build

# Ciblé
npm run build:win    # → dist/*.exe (NSIS installer)
npm run build:mac    # → dist/*.dmg
npm run build:linux  # → dist/*.AppImage
```

Les artifacts sont générés dans `dist/`. La CI GitHub Actions fait le même travail à chaque push de tag `v*` et crée la release automatiquement.

**Pour déclencher une release :**
```bash
git tag v2.1.0
git push origin v2.1.0
```

---

## Adapter le launcher à votre serveur

Trois fichiers à modifier, rien d'autre :

**1. Nom et identité** (`index.html`) :
```html
<!-- Titre loader -->
<div class="loader-title">VOTRE ROYAUME</div>
<div class="loader-subtitle">Votre accroche</div>

<!-- Sidebar -->
<div class="sidebar-kingdom">MON SERVEUR RP</div>
```

**2. Serveur par défaut** (`package.json` → `build` ou directement dans la config runtime) :
```json
{ "serverIp": "mon.serveur.com", "serverPort": 30120 }
```

**3. Ticker et news** (`index.html`) — remplacer les `<span class="ticker-item">` et les `<article class="ncard">`.

Le design (couleurs, polices, animations) se contrôle entièrement via les variables CSS dans `css/rules.css` :
```css
:root {
  --gold:        #C9A84C;  /* couleur principale */
  --blood:       #7A1A1A;  /* accents sang */
  --parchment:   #EDE0C4;  /* texte principal */
}
```

---

## IPC Reference

Tout ce qui passe entre le renderer et le main process :

| Handler | Direction | Paramètres | Retour |
|---------|-----------|------------|--------|
| `win-minimize` | renderer → main | — | — |
| `win-maximize` | renderer → main | — | — |
| `win-close` | renderer → main | — | — |
| `get-config` | renderer → main | — | `Config` object |
| `set-config` | renderer → main | `Partial<Config>` | `boolean` |
| `detect-fivem` | renderer → main | — | `string \| null` |
| `select-fivem-path` | renderer → main | — | `string \| null` |
| `launch-fivem` | renderer → main | `{ ip, port, fivemPath? }` | `{ ok, method?, error?, warning? }` |
| `ping-server` | renderer → main | `{ ip, port }` | `{ online, ms }` |
| `server-output` | main → renderer | `string` | — |
| `server-error` | main → renderer | `string` | — |
| `server-closed` | main → renderer | `number` | — |

---

## Ajouter une icône

Sans icône, electron-builder génère quand même le build mais affiche un warning. Pour en ajouter une :

```bash
# Préparer l'icône source (PNG 1024×1024 recommandé)
# Ensuite selon l'OS cible :

# Windows → .ico (multi-résolution : 16, 32, 48, 256)
# Outil en ligne : icoconvert.com ou ImageMagick :
magick icon.png -define icon:auto-resize=256,48,32,16 assets/icon.ico

# macOS → .icns
iconutil -c icns icon.iconset   # après avoir créé le .iconset

# Linux → .png (512×512 suffit)
cp icon.png assets/icon.png
```

---

## Changelog

### v1.0
- **Fix critique** : `preload.mjs` exposait `window.launcherAPI` mais tout le code appelait `window.launcher` — corrigé, l'API est maintenant unifiée sous `window.launcher`
- **Fix critique** : window controls (minimize/maximize/close) étaient des appels dans le vide — handlers IPC ajoutés dans `main.mjs`
- Lancement FiveM réel via `spawn` + fallback URI scheme `fivem://connect/`
- Config persistante JSON dans `userData` (IP, port, chemin FiveM, volume)
- Ping serveur via IPC → plus de contrainte CORS côté renderer
- Bouton "Parcourir" de la page Forge câblé sur `dialog.showOpenDialog`
- Détection auto de FiveM.exe au premier démarrage (scan des chemins courants Windows)
- IDs HTML explicites sur tous les champs de settings — plus de `querySelector` fragile

### v2.0.0
- Refonte complète ESM (`.mjs`)
- Loader animé multi-étapes
- Navigation par onglets
- Design tokens CSS complets
- Console overlay

---

## License

MIT — faites-en ce que vous voulez, gardez juste le copyright.
