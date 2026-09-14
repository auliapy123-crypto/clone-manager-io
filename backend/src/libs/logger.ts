/**
 * Singleton proxy ke Fastify logger (Guide §3.1, §5.1).
 *
 * Alasan keberadaannya: `runMigrations()` dan pool error handler jalan
 * SEBELUM instance Fastify siap, tapi tetap harus memakai logger yang sama.
 * Modul ini memulai dengan shim console, lalu `attachLogger(app.log)`
 * dipanggil dari index.ts begitu Fastify dibuat.
 *
 * Jangan pakai console.* di mana pun selain file ini.
 */
type LogFn = (obj: Record<string, unknown> | string, msg?: string) => void;

export interface AppLogger {
  fatal: LogFn;
  error: LogFn;
  warn: LogFn;
  info: LogFn;
  debug: LogFn;
}

function consoleShim(level: keyof AppLogger): LogFn {
  return (obj, msg) => {
    const target = level === "debug" || level === "info" ? "log" : "error";
    if (typeof obj === "string") {
      console[target](`[${level}] ${obj}`);
    } else {
      console[target](`[${level}] ${msg ?? ""}`, obj);
    }
  };
}

const shim: AppLogger = {
  fatal: consoleShim("fatal"),
  error: consoleShim("error"),
  warn: consoleShim("warn"),
  info: consoleShim("info"),
  debug: consoleShim("debug"),
};

let delegate: AppLogger = shim;

/** Dipanggil sekali dari index.ts: attachLogger(app.log). */
export function attachLogger(fastifyLogger: AppLogger): void {
  delegate = fastifyLogger;
}

export const logger: AppLogger = {
  fatal: (obj, msg) => delegate.fatal(obj as never, msg),
  error: (obj, msg) => delegate.error(obj as never, msg),
  warn: (obj, msg) => delegate.warn(obj as never, msg),
  info: (obj, msg) => delegate.info(obj as never, msg),
  debug: (obj, msg) => delegate.debug(obj as never, msg),
};

export default logger;
