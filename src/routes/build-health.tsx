/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Health route for the etude feature.
 *
 * Splits liveness into two surfaces sharing one validation pass:
 * - Anonymous liveness: only a healthy/unhealthy result, nothing else.
 * - Privileged detailed report: every named defect and the resolved timeout,
 *   still containing no secret values.
 *
 * The rhythm-catalog health surface is a pluggable contribution point; the
 * catalog parsing and validation rules are owned by Issue 12. This module
 * builds the catalog contribution from the packaged catalog text via the
 * parser in `src/lib/rhythm-catalog.ts` and passes it to `runHealthCheck`.
 *
 * @module routes/build-health
 */
import { Hono } from 'hono'
import type { Context } from 'hono'

import { PATHS } from '../constants'
import { Bindings } from '../local-types'
import {
  validateEtudeConfig,
  type EtudeConfigInput,
  type ConfigDefect,
} from '../lib/config-validator'
import { parseRhythmCatalog, type CatalogDefect } from '../lib/rhythm-catalog'
import { RHYTHM_CATALOG_TEXT } from '../lib/rhythm-catalog-data'
import { logInfo, logError } from '../lib/logger'

/**
 * A pluggable rhythm-catalog health contribution.
 * The catalog parsing and validation rules are owned by Issue 12; this slice
 * only provides the surface the catalog reports through.
 */
export interface CatalogHealthContribution {
  /** Whether the rhythm catalog is healthy. */
  readonly healthy: boolean
  /** Defects found by the catalog validator, if any. */
  readonly defects: readonly ConfigDefect[]
}

/**
 * Build a `CatalogHealthContribution` from packaged rhythm-catalog text by
 * running it through the catalog parser. A healthy catalog yields a healthy
 * contribution with no defects. A malformed catalog yields an unhealthy
 * contribution whose defects are mapped to `ConfigDefect` entries with
 * `valueName: 'rhythm-catalog'` and a `message` naming the offending meter
 * and line from the parser defect. The catalog text is the build-time
 * packaged string from `src/lib/rhythm-catalog-data.ts`; no runtime
 * file-system read occurs.
 *
 * @param catalogText - The packaged rhythm-catalog text.
 * @returns The catalog health contribution.
 */
export const buildCatalogHealthContribution = (
  catalogText: string,
): CatalogHealthContribution => {
  const result = parseRhythmCatalog(catalogText)
  if (result.isOk) {
    return { healthy: true, defects: [] }
  }
  const defects: ConfigDefect[] = result.error.map((d: CatalogDefect) => ({
    valueName: 'rhythm-catalog',
    message: `rhythm catalog defect at meter ${d.meter}, line ${d.line}: ${d.message}`,
  }))
  return { healthy: false, defects }
}

/**
 * The aggregate health result combining configuration and catalog contributions.
 */
export interface HealthResult {
  /** Whether the application is healthy. */
  readonly healthy: boolean
  /** The resolved LilyPond timeout in milliseconds. */
  readonly lilypondTimeoutMs: number
  /** Every defect from configuration and catalog, or an empty array when healthy. */
  readonly defects: readonly ConfigDefect[]
}

/**
 * The anonymous liveness payload: only a healthy flag.
 */
export interface AnonymousLivenessPayload {
  readonly healthy: boolean
}

/**
 * The privileged detailed report payload.
 */
export interface DetailedHealthReport {
  readonly healthy: boolean
  readonly lilypondTimeoutMs: number
  readonly defects: readonly ConfigDefect[]
}

/**
 * Run the aggregate health check, combining the configuration validator with
 * an optional rhythm-catalog contribution.
 *
 * @param input - The etude configuration bindings to validate.
 * @param catalogContribution - Optional rhythm-catalog health contribution.
 * @returns The aggregate health result.
 */
export const runHealthCheck = (
  input: EtudeConfigInput,
  catalogContribution?: CatalogHealthContribution,
): HealthResult => {
  const configResult = validateEtudeConfig(input)
  const defects: ConfigDefect[] = [...configResult.defects]
  if (catalogContribution && !catalogContribution.healthy) {
    defects.push(...catalogContribution.defects)
  }
  return {
    healthy: defects.length === 0,
    lilypondTimeoutMs: configResult.lilypondTimeoutMs,
    defects,
  }
}

/**
 * Build the anonymous liveness payload from a health result.
 * Carries only a healthy/unhealthy flag — no value names, no resolved values,
 * no binding names, no defect detail, no secrets.
 *
 * @param result - The aggregate health result.
 * @returns The anonymous liveness payload.
 */
export const buildAnonymousLiveness = (result: HealthResult): AnonymousLivenessPayload => ({
  healthy: result.healthy,
})

/**
 * Build the privileged detailed report from a health result.
 * Names every defect and includes the resolved timeout, but never contains
 * secret values (defect messages are produced by the config validator which
 * never emits secret values).
 *
 * @param result - The aggregate health result.
 * @returns The detailed health report.
 */
export const buildDetailedReport = (result: HealthResult): DetailedHealthReport => ({
  healthy: result.healthy,
  lilypondTimeoutMs: result.lilypondTimeoutMs,
  defects: result.defects,
})

/**
 * Determine whether the current request is a privileged operator context.
 *
 * In production, operator access is gated by an operator token header or a
 * trusted internal network indicator. This slice exposes the hook; the actual
 * gating mechanism is configured by the operator environment.
 */
const isOperatorContext = (c: Context<{ Bindings: Bindings }>): boolean => {
  const operatorToken = c.env.OPERATOR_TOKEN
  if (!operatorToken) {
    return false
  }
  const provided = c.req.header('X-Operator-Token')
  return provided === operatorToken
}

/**
 * Attach the health route to the app.
 *
 * The anonymous liveness response is always available at the health path.
 * The detailed report is available only to a privileged operator context and
 * is also written to the deployment/startup log.
 *
 * @param app - Hono app instance.
 */
export const buildHealth = (app: Hono<{ Bindings: Bindings }>): void => {
  app.get(PATHS.HEALTH, (c) => {
    const input: EtudeConfigInput = {
      PROJECT_DB: c.env.PROJECT_DB,
      ETUDE_GEN_STORAGE: c.env.ETUDE_GEN_STORAGE,
      LILYPOND_SERVICE_URL: c.env.LILYPOND_SERVICE_URL,
      LILYPOND_API_KEY: c.env.LILYPOND_API_KEY,
      LILYPOND_TIMEOUT_MS: c.env.LILYPOND_TIMEOUT_MS,
    }
    const result = runHealthCheck(input, buildCatalogHealthContribution(RHYTHM_CATALOG_TEXT))

    // Always write the detailed report to the startup/deployment log.
    if (result.healthy) {
      logInfo('health check passed', { lilypondTimeoutMs: result.lilypondTimeoutMs })
    } else {
      logError('health check failed', {
        defects: result.defects.map((d) => ({ valueName: d.valueName, message: d.message })),
      })
    }

    if (isOperatorContext(c)) {
      return c.json(buildDetailedReport(result))
    }
    return c.json(buildAnonymousLiveness(result))
  })
}
