/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Structured logging utility that redacts sensitive user data.
 * @module lib/logger
 */

/**
 * Substrings that mark a context key as sensitive. Values for keys whose
 * lowercased form contains any of these are replaced with a redaction marker
 * before the log line is serialized. The `correlationId` key is intentionally
 * not sensitive and is passed through verbatim so a log line can be traced to
 * its request or operation.
 */
const SENSITIVE_KEY_FRAGMENTS: readonly string[] = [
  'name',
  'email',
  'session',
  'token',
  'secret',
  'key',
  'authorization',
  'bearer',
  'credential',
  'password',
  'lilypondbody',
  'lilypondrequest',
]

const REDACTED = '[REDACTED]'

/**
 * Keys that are always passed through verbatim even if they would otherwise
 * match a sensitive fragment.
 */
const PASSTHROUGH_KEYS: readonly string[] = ['correlationId']

const isSensitiveKey = (key: string): boolean => {
  if (PASSTHROUGH_KEYS.includes(key)) {
    return false
  }
  const lower = key.toLowerCase()
  return SENSITIVE_KEY_FRAGMENTS.some((frag) => lower.includes(frag))
}

/**
 * Return a copy of the context with every sensitive field replaced by a
 * redaction marker. Non-sensitive fields and the `correlationId` field are
 * preserved. Nested objects are redacted one level deep.
 */
export const redactContext = (context: Record<string, unknown>): Record<string, unknown> => {
  const redacted: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(context)) {
    if (isSensitiveKey(k)) {
      redacted[k] = REDACTED
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      redacted[k] = redactContext(v as Record<string, unknown>)
    } else {
      redacted[k] = v
    }
  }
  return redacted
}

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
 * Logs an info message with structured context. Sensitive fields in the
 * context are redacted before serialization; `correlationId` is preserved.
 */
export const logInfo = (message: string, context: Record<string, unknown> = {}): void => {
  console.log(JSON.stringify({ level: 'info', message, ...redactContext(context) }))
}

/**
 * Logs an error message with structured context. Sensitive fields in the
 * context are redacted before serialization; `correlationId` is preserved.
 */
export const logError = (message: string, context: Record<string, unknown> = {}): void => {
  console.error(JSON.stringify({ level: 'error', message, ...redactContext(context) }))
}

/**
 * Logs a warning message with structured context. Sensitive fields in the
 * context are redacted before serialization; `correlationId` is preserved.
 */
export const logWarn = (message: string, context: Record<string, unknown> = {}): void => {
  console.warn(JSON.stringify({ level: 'warn', message, ...redactContext(context) }))
}

/**
 * Records a routine successful operation. Per the project logging policy,
 * routine successful operations are not logged merely for completeness, so
 * this is a no-op that emits no line. Failures, refusals, and cleanup
 * outcomes use `logInfo`/`logWarn`/`logError` instead.
 */
export const logRoutineSuccess = (_context: Record<string, unknown> = {}): void => {
  // Intentionally emits nothing. Routine successes are not logged.
}
