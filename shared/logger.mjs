/**
 * logger.mjs — Shared logger utility
 * ES2020+ · no dependencies · ANSI color codes · zero pattern bloat
 */

/** COLOR CODES ANSI */

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';

const FG = {
  black:   '\x1b[30m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
  gray:    '\x1b[90m',
};

const BG = {
  red:     '\x1b[41m',
  green:   '\x1b[42m',
  yellow:  '\x1b[43m',
  blue:    '\x1b[44m',
  magenta: '\x1b[45m',
  cyan:    '\x1b[46m',
};

/** LEVELS */

const LEVELS = {
  trace: { value: 0, label: 'TRACE', color: FG.gray   },
  debug: { value: 1, label: 'DEBUG', color: FG.cyan   },
  info:  { value: 2, label: 'INFO ', color: FG.green  },
  warn:  { value: 3, label: 'WARN ', color: FG.yellow },
  error: { value: 4, label: 'ERROR', color: FG.red    },
  fatal: { value: 5, label: 'FATAL', color: BG.red + FG.white },
};

/** CONFIG */

const config = {
  level:      process.env.LOG_LEVEL ?? 'debug',
  noColor:    process.env.NO_COLOR !== undefined || !process.stdout.isTTY,
  timestamp:  true,
  showCaller: false,
};

/** HELPERS */

/**
 * Colorize a string — strips codes when color is disabled.
 * @param {string} str
 * @param {...string} codes
 * @returns {string}
 */
const paint = (str, ...codes) =>
  config.noColor ? str : `${codes.join('')}${str}${RESET}`;

/**
 * ISO timestamp, trimmed to milliseconds.
 * @returns {string}  e.g. "2026-04-13T14:32:05.123Z"
 */
const timestamp = () => new Date().toISOString();

/**
 * Extract caller location from a fresh Error stack.
 * Skips frames inside this module.
 * @returns {string}  e.g. "app.mjs:42"
 */
const callerLocation = () => {
  const frames = new Error().stack?.split('\n') ?? [];
  const external = frames.find(
    (f) => f.includes('at ') && !f.includes('logger.mjs')
  );
  const match = external?.match(/\((.+):(\d+):\d+\)/) ??
                external?.match(/at (.+):(\d+):\d+/);
  return match ? `${match[1].split('/').at(-1)}:${match[2]}` : '?';
};

/** Serializers */

/**
 * Serialize an extra payload (object / Error / primitive) to string.
 * @param {unknown} value
 * @returns {string}
 */
const serialize = (value) => {
  if (value === undefined) return '';
  if (value instanceof Error) {
    return `\n  ${paint(value.stack ?? value.message, FG.gray)}`;
  }
  if (typeof value === 'object') {
    try {
      return '\n  ' + paint(JSON.stringify(value, null, 2), DIM);
    } catch {
      return '\n  [unserializable object]';
    }
  }
  return ` ${String(value)}`;
};

// ─── Core write ───────────────────────────────────────────────────────────────

/**
 * @param {keyof LEVELS} levelKey
 * @param {string} message
 * @param {unknown} [extra]
 */
const write = (levelKey, message, extra) => {
  const def        = LEVELS[levelKey];
  const minDef     = LEVELS[config.level] ?? LEVELS.debug;

  if (def.value < minDef.value) return;

  const ts         = config.timestamp
    ? paint(`[${timestamp()}] `, FG.gray)
    : '';
  const badge      = paint(`[${def.label}]`, BOLD, def.color);
  const caller     = config.showCaller
    ? paint(` (${callerLocation()})`, FG.gray)
    : '';
  const body       = message + serialize(extra);

  const line       = `${ts}${badge}${caller} ${body}`;

  if (levelKey === 'error' || levelKey === 'fatal') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
};

// ─── Public API ───────────────────────────────────────────────────────────────

export const logger = {
  /** Lowest-level diagnostic info. */
  trace: (msg, extra) => write('trace', msg, extra),

  /** Debug details during development. */
  debug: (msg, extra) => write('debug', msg, extra),

  /** Normal informational events. */
  info:  (msg, extra) => write('info',  msg, extra),

  /** Recoverable problems worth attention. */
  warn:  (msg, extra) => write('warn',  msg, extra),

  /** Errors that break a request or operation. */
  error: (msg, extra) => write('error', msg, extra),

  /** Process-level failures — call process.exit after if needed. */
  fatal: (msg, extra) => write('fatal', msg, extra),

  // ── Configuration mutators ────────────────────────────────────────────────

  /**
   * Set minimum log level at runtime.
   * @param {keyof typeof LEVELS} level
   */
  setLevel:      (level)   => { config.level      = level; },

  /** Disable ANSI color codes globally. */
  disableColor:  ()        => { config.noColor     = true; },

  /** Enable ANSI color codes globally. */
  enableColor:   ()        => { config.noColor     = false; },

  /** Toggle caller file:line annotation. */
  showCaller:    (on = true) => { config.showCaller = on; },

  /** Toggle timestamp prefix. */
  showTimestamp: (on = true) => { config.timestamp  = on; },

  // ── Utility formatters ────────────────────────────────────────────────────

  /**
   * Wrap any async function with entry/exit timing logs.
   * @template T
   * @param {string} label
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  time: async (label, fn) => {
    const t0 = performance.now();
    logger.debug(`→ ${label}`);
    try {
      const result = await fn();
      const ms = (performance.now() - t0).toFixed(2);
      logger.debug(`← ${label}`, { ms: `${ms}ms` });
      return result;
    } catch (err) {
      const ms = (performance.now() - t0).toFixed(2);
      logger.error(`✗ ${label} failed after ${ms}ms`, err);
      throw err;
    }
  },

  /**
   * Create a child logger that prefixes every message with a namespace.
   * @param {string} ns  e.g. "db", "auth", "worker"
   * @returns {typeof logger}
   */
  child: (ns) => {
    const prefix = paint(`[${ns}]`, BOLD, FG.magenta) + ' ';
    return new Proxy(logger, {
      get(target, prop) {
        if (['trace','debug','info','warn','error','fatal'].includes(String(prop))) {
          return (msg, extra) => target[prop](prefix + msg, extra);
        }
        return target[prop];
      },
    });
  },

  /**
   * Print a horizontal divider with an optional title.
   * @param {string} [title]
   */
  divider: (title = '') => {
    const line = '─'.repeat(title ? 2 : 60);
    const text = title
      ? `${line} ${paint(title, BOLD, FG.white)} ${'─'.repeat(2)}`
      : paint(line, FG.gray);
    process.stdout.write(text + '\n');
  },

  /**
   * Log a plain key/value table (object → aligned columns).
   * @param {Record<string, unknown>} obj
   * @param {string} [title]
   */
  table: (obj, title) => {
    if (title) logger.divider(title);
    const keys    = Object.keys(obj);
    const maxLen  = Math.max(...keys.map((k) => k.length));
    for (const [k, v] of Object.entries(obj)) {
      const key = paint(k.padEnd(maxLen), FG.cyan);
      const val = typeof v === 'object'
        ? JSON.stringify(v)
        : String(v);
      process.stdout.write(`  ${key}  ${val}\n`);
    }
  },
};

// ─── Named exports for direct use ────────────────────────────────────────────

export const { trace, debug, info, warn, error, fatal } = logger;

export default logger;

