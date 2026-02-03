/**
 * Logger utilities for crawler
 */

export type LogLevel = "debug" | "info" | "warn" | "error"

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

function getDefaultLogLevel(): LogLevel {
  return process.env.NODE_ENV === "development" ? "debug" : "info"
}

let currentLevel: LogLevel = getDefaultLogLevel()

/**
 * Set the log level
 */
export const setLogLevel = (level: LogLevel): void => {
  currentLevel = level
}

/**
 * Get the current log level
 */
export const getLogLevel = (): LogLevel => {
  return currentLevel
}

/**
 * Format a log message
 */
const formatMessage = (
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): string => {
  const timestamp = new Date().toISOString()
  const contextStr = context ? ` ${JSON.stringify(context)}` : ""
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`
}

/**
 * Log a message
 */
export const log = (
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void => {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) {
    return
  }

  const formatted = formatMessage(level, message, context)

  switch (level) {
    case "debug":
    case "info":
      console.log(formatted)
      break
    case "warn":
      console.warn(formatted)
      break
    case "error":
      console.error(formatted)
      break
  }
}

/**
 * Logger object with convenience methods
 */
export const logger = {
  debug: (message: string, context?: Record<string, unknown>): void => {
    log("debug", message, context)
  },
  info: (message: string, context?: Record<string, unknown>): void => {
    log("info", message, context)
  },
  warn: (message: string, context?: Record<string, unknown>): void => {
    log("warn", message, context)
  },
  error: (message: string, context?: Record<string, unknown>): void => {
    log("error", message, context)
  },
}
