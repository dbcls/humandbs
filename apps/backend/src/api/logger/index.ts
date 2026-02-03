/**
 * Structured Logger
 *
 * Provides JSON-formatted logging with request correlation via requestId.
 * All log entries include timestamp, level, and optional context fields.
 */

export type LogLevel = "debug" | "info" | "warn" | "error"

export interface LogContext {
  requestId?: string
  [key: string]: unknown
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  requestId?: string
  [key: string]: unknown
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

function getDefaultLogLevel(): LogLevel {
  return process.env.NODE_ENV === "development" ? "debug" : "info"
}

const currentLogLevel: LogLevel = getDefaultLogLevel()

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel]
}

function formatLogEntry(level: LogLevel, message: string, context?: LogContext): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  }

  if (context) {
    const { requestId, ...rest } = context
    if (requestId) {
      entry.requestId = requestId
    }
    Object.assign(entry, rest)
  }

  return entry
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) return

  const entry = formatLogEntry(level, message, context)
  const output = JSON.stringify(entry)

  switch (level) {
    case "error":
      console.error(output)
      break
    case "warn":
      console.warn(output)
      break
    default:
      console.log(output)
  }
}

/**
 * Logger instance with methods for each log level.
 * Each method accepts a message and optional context object.
 *
 * @example
 * logger.info("Request received", { requestId, method: "GET", path: "/research" })
 * logger.error("Database error", { requestId, error: err.message })
 */
export const logger = {
  debug: (message: string, context?: LogContext) => { log("debug", message, context) },
  info: (message: string, context?: LogContext) => { log("info", message, context) },
  warn: (message: string, context?: LogContext) => { log("warn", message, context) },
  error: (message: string, context?: LogContext) => { log("error", message, context) },
}

/**
 * Create a child logger with preset context.
 * Useful for request-scoped logging where requestId is always included.
 *
 * @example
 * const reqLogger = createChildLogger({ requestId: "abc123" })
 * reqLogger.info("Processing request")  // Includes requestId automatically
 */
export function createChildLogger(baseContext: LogContext) {
  return {
    debug: (message: string, context?: LogContext) => { log("debug", message, { ...baseContext, ...context }) },
    info: (message: string, context?: LogContext) => { log("info", message, { ...baseContext, ...context }) },
    warn: (message: string, context?: LogContext) => { log("warn", message, { ...baseContext, ...context }) },
    error: (message: string, context?: LogContext) => { log("error", message, { ...baseContext, ...context }) },
  }
}
