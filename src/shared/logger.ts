/**
 * logger.ts — Structured logging with levels, timestamps, and context.
 *
 * Provides consistent, filterable log output across all modules.
 * In production builds, debug/trace logs are suppressed.
 */

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5
};

const LOG_COLORS: Record<LogLevel, string> = {
  trace: "#5c6380",
  debug: "#818cf8",
  info: "#34d399",
  warn: "#fbbf24",
  error: "#f87171",
  fatal: "#dc2626"
};

type LogEntry = {
  ts: string;
  level: LogLevel;
  module: string;
  msg: string;
  data?: unknown;
};

let minLevel: LogLevel = (() => {
  try {
    // Vite injects import.meta.env at build time
    return (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV ? "debug" : "info";
  } catch {
    return "info";
  }
})();

/**
 * Set the minimum log level. Logs below this level are suppressed.
 */
export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

/**
 * Create a scoped logger for a specific module.
 *
 * Usage:
 *   const log = createLogger("catalog");
 *   log.info("Loaded catalog", { count: 1234 });
 *   log.error("Failed to sync", { error: err.message });
 */
export function createLogger(module: string) {
  function shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[minLevel];
  }

  function emit(level: LogLevel, msg: string, data?: unknown): void {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      module,
      msg,
      ...(data !== undefined ? { data } : {})
    };

    const color = LOG_COLORS[level];
    const prefix = `%c[${module}]`;
    const style = `color:${color};font-weight:bold`;

    switch (level) {
      case "trace":
      case "debug":
        console.debug(prefix, style, msg, data ?? "");
        break;
      case "info":
        console.info(prefix, style, msg, data ?? "");
        break;
      case "warn":
        console.warn(prefix, style, msg, data ?? "");
        break;
      case "error":
      case "fatal":
        console.error(prefix, style, msg, data ?? "");
        break;
    }

    // Store in ring buffer for diagnostics
    logRingBuffer.push(entry);
    if (logRingBuffer.length > MAX_RING_SIZE) logRingBuffer.shift();
  }

  return {
    trace: (msg: string, data?: unknown) => emit("trace", msg, data),
    debug: (msg: string, data?: unknown) => emit("debug", msg, data),
    info:  (msg: string, data?: unknown) => emit("info", msg, data),
    warn:  (msg: string, data?: unknown) => emit("warn", msg, data),
    error: (msg: string, data?: unknown) => emit("error", msg, data),
    fatal: (msg: string, data?: unknown) => emit("fatal", msg, data)
  };
}

// ─── Ring buffer for diagnostics ──────────────────────────────────────────────

const MAX_RING_SIZE = 200;
const logRingBuffer: LogEntry[] = [];

/**
 * Get the recent log entries (useful for error reports).
 */
export function getRecentLogs(count = 50): LogEntry[] {
  return logRingBuffer.slice(-count);
}

/**
 * Export all recent logs as a JSON string (for user download/bug reports).
 */
export function exportLogsAsJSON(): string {
  return JSON.stringify(logRingBuffer, null, 2);
}
