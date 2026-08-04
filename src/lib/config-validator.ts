/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Configuration validator for the etude feature.
 *
 * Collects every missing or malformed required value in one pass and reports
 * them together rather than failing on the first defect. Secret values are
 * never included in defect messages.
 */

/** The default LilyPond request timeout in milliseconds when none is configured. */
export const DEFAULT_LILYPOND_TIMEOUT_MS = 30000

/**
 * A single configuration defect, naming the affected value without including
 * any resolved secret value.
 */
export interface ConfigDefect {
  /** The name of the missing or malformed configuration value. */
  readonly valueName: string
  /** A human-readable description of the defect, never containing a secret value. */
  readonly message: string
}

/**
 * The result of validating the etude configuration.
 */
export interface ConfigValidationResult {
  /** Whether the configuration is complete and valid. */
  readonly healthy: boolean
  /** The resolved LilyPond timeout in milliseconds. */
  readonly lilypondTimeoutMs: number
  /** Every defect found, or an empty array when healthy. */
  readonly defects: readonly ConfigDefect[]
}

/**
 * The subset of bindings the etude configuration validator inspects.
 */
export interface EtudeConfigInput {
  readonly PROJECT_DB?: D1Database
  readonly ETUDE_GEN_STORAGE?: R2Bucket
  readonly LILYPOND_SERVICE_URL?: string
  readonly LILYPOND_API_KEY?: string
  readonly LILYPOND_TIMEOUT_MS?: string
}

/**
 * Resolve and validate the LilyPond timeout, returning either the resolved
 * positive number or a defect describing why it is invalid.
 */
const resolveTimeout = (
  raw: string | undefined,
): { timeoutMs: number; defect: ConfigDefect | null } => {
  if (raw === undefined || raw.trim() === '') {
    return { timeoutMs: DEFAULT_LILYPOND_TIMEOUT_MS, defect: null }
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      timeoutMs: DEFAULT_LILYPOND_TIMEOUT_MS,
      defect: {
        valueName: 'LILYPOND_TIMEOUT_MS',
        message: 'LILYPOND_TIMEOUT_MS must be a positive number of milliseconds.',
      },
    }
  }
  return { timeoutMs: parsed, defect: null }
}

/**
 * Validate the etude configuration, collecting every defect in one pass.
 *
 * @param input - The bindings-shaped input to validate.
 * @returns A result with a healthy flag, the resolved timeout, and a list of defects.
 */
export const validateEtudeConfig = (input: EtudeConfigInput): ConfigValidationResult => {
  const defects: ConfigDefect[] = []

  if (!input.PROJECT_DB) {
    defects.push({
      valueName: 'PROJECT_DB',
      message: 'PROJECT_DB D1 binding is missing.',
    })
  }

  if (!input.ETUDE_GEN_STORAGE) {
    defects.push({
      valueName: 'ETUDE_GEN_STORAGE',
      message: 'ETUDE_GEN_STORAGE R2 binding is missing.',
    })
  }

  if (!input.LILYPOND_SERVICE_URL || input.LILYPOND_SERVICE_URL.trim() === '') {
    defects.push({
      valueName: 'LILYPOND_SERVICE_URL',
      message: 'LILYPOND_SERVICE_URL is missing or empty.',
    })
  }

  if (!input.LILYPOND_API_KEY || input.LILYPOND_API_KEY.trim() === '') {
    defects.push({
      valueName: 'LILYPOND_API_KEY',
      message: 'LILYPOND_API_KEY is missing or empty.',
    })
  }

  const { timeoutMs, defect: timeoutDefect } = resolveTimeout(input.LILYPOND_TIMEOUT_MS)
  if (timeoutDefect) {
    defects.push(timeoutDefect)
  }

  return {
    healthy: defects.length === 0,
    lilypondTimeoutMs: timeoutMs,
    defects,
  }
}
