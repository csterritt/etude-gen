/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Structured logging utility that redacts sensitive user data.
 * @module lib/logger
 */

/**
 * Sanitizes an error object for safe logging.
 * Removes sensitive data while preserving debugging information.
 */
export const sanitizeError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      // Only include stack in development
      ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
    }
  }

  if (typeof error === 'object' && error !== null) {
    // For plain objects, return a sanitized version
    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(error)) {
      // Skip potentially sensitive keys
      if (!['password', 'token', 'secret', 'key', 'email', 'authorization'].some((sensitive) =>
        key.toLowerCase().includes(sensitive)
      )) {
        sanitized[key] = value
      } else {
        sanitized[key] = '[REDACTED]'
      }
    }
    return sanitized
  }

  return { value: String(error) }
}

/**
 * Logs an info message with structured context.
 */
export const logInfo = (message: string, context: Record<string, unknown> = {}): void => {
  console.log(JSON.stringify({ level: 'info', message, ...context }))
}

/**
 * Logs an error message with structured context.
 */
export const logError = (message: string, context: Record<string, unknown> = {}): void => {
  console.error(JSON.stringify({ level: 'error', message, ...context }))
}

/**
 * Logs a warning message with structured context.
 */
export const logWarn = (message: string, context: Record<string, unknown> = {}): void => {
  console.warn(JSON.stringify({ level: 'warn', message, ...context }))
}
