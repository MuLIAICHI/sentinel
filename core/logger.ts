/**
 * Structured JSON-line logger with secret redaction.
 *
 * This is the project's ONE logging path — no console.log anywhere else.
 * Redaction is default-on: any field whose name looks secret-bearing has its
 * value replaced before serialization, so key material and API keys cannot
 * leak through logs even by accident.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/** Field names whose values are never logged. Case-insensitive substring match. */
const REDACT_PATTERN = /key|secret|token|private|password|credential/i;

const REDACTED = '[REDACTED]';

/** Minimum level actually written. Settable once at boot (e.g. from config). */
let minLevel: LogLevel = 'info';

/** Set the global minimum log level. */
export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

/** Recursively copy `value`, redacting any field whose name matches the secret pattern. */
function redact(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = REDACT_PATTERN.test(k) ? REDACTED : redact(v, seen);
  }
  return out;
}

function write(level: LogLevel, module: string, msg: string, fields?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
  const entry: Record<string, unknown> = {
    time: new Date().toISOString(),
    level,
    module,
    msg,
  };
  if (fields) {
    try {
      entry.fields = redact(fields, new WeakSet());
    } catch {
      entry.fields = '[UNSERIALIZABLE]';
    }
  }
  try {
    process.stdout.write(JSON.stringify(entry) + '\n');
  } catch {
    // Logging must never crash the pipeline; JSON.stringify can throw on exotic
    // values (e.g. BigInt). Fall back to the bare message.
    process.stdout.write(JSON.stringify({ time: entry.time, level, module, msg }) + '\n');
  }
}

/** Create a logger tagged with the emitting module's name. */
export function createLogger(module: string): Logger {
  return {
    debug: (msg, fields) => write('debug', module, msg, fields),
    info: (msg, fields) => write('info', module, msg, fields),
    warn: (msg, fields) => write('warn', module, msg, fields),
    error: (msg, fields) => write('error', module, msg, fields),
  };
}
