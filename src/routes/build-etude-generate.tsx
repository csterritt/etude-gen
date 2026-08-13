/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Route builder for the etude generate operation (Issue 20).
 *
 * `POST /etude/generate` is the operation POST rendered on the review page.
 * It calls the workflow service's `generateEtude` function, which:
 * 1. Verifies the operation-POST precondition (workflow version + aggregate
 *    epoch captured at form acquisition).
 * 2. Checks the review predicate (all steps confirmed).
 * 3. Validates stored values against current constraints.
 * 4. Builds generation settings from the aggregate.
 * 5. Calls the Piece Generator with an injectable random source.
 * 6. Persists the Piece via the Etude Piece repository with the captured
 *    epoch.
 *
 * On success, it redirects 303 to `/etude/score`. On any typed failure
 * (stale version, prerequisites not met, stored values invalid, generator
 * failure, db-error), it redirects 303 to the canonical route with a safe
 * message and no state change.
 *
 * The route inherits cross-cutting contract section 1: auth + no-cache via
 * the `signedInAccess` middleware, owner-scoped via `c.get('user')`, and no
 * internal identifiers revealed in any message.
 * @module routes/buildEtudeGenerate
 */
import type { Context } from 'hono'
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'

import { PATHS, STANDARD_SECURE_HEADERS } from '../constants'
import { type AppEnv, type AuthUser, type DrizzleClient } from '../local-types'
import { signedInAccess } from '../middleware/signed-in-access'
import { generateEtude } from '../lib/workflow-service'
import { handleUnexpectedError } from './build-safe-error'
import { logError, sanitizeError } from '../lib/logger'
import { redirectWithError, redirectWithMessage } from '../lib/redirects'

/**
 * Safe message displayed when a student submits the Generate form with a
 * stale, missing, or tampered workflow version, or when the aggregate epoch
 * no longer matches. Exposes no internal identifiers (cross-cutting contract
 * section 1 rule 6).
 */
const STALE_OPERATION_MESSAGE =
  'Your request could not be processed because the form was stale. Please review the current values and try again.'

/**
 * Safe message displayed when the review predicate is false (an upstream
 * step lost its confirmation). Exposes no internal identifiers.
 */
const PREREQUISITES_NOT_MET_MESSAGE =
  'That step isn\u2019t available yet. You\u2019ve been taken to where you left off.'

/**
 * Safe message displayed when a stored value no longer validates. Exposes no
 * internal identifiers.
 */
const STORED_VALUES_INVALID_MESSAGE =
  'Some of your selections are no longer valid. You\u2019ve been taken to the step that needs attention.'

/**
 * Safe message displayed when the Piece Generator returns a typed invariant
 * failure (no eligible rhythms or an empty pitch set). Exposes no internal
 * identifiers.
 */
const GENERATOR_FAILURE_MESSAGE =
  'We couldn\u2019t generate a piece with your current selections. Please adjust your choices and try again.'

/**
 * Safe message displayed when a transient DB error occurs. Exposes no
 * internal identifiers.
 */
const DB_ERROR_MESSAGE =
  'Something went wrong on our end. Please try again in a moment.'

/**
 * A non-seeded random source for production use. The generator uses
 * `nextInt(n)` to pick a uniform index in `[0, n)`. No seed is persisted.
 */
const productionRandom = {
  nextInt: (maxExclusive: number): number => {
    if (maxExclusive <= 0) {
      return 0
    }
    return Math.floor(Math.random() * maxExclusive)
  },
}

/**
 * Attach the etude generate route to the app.
 * @param app - Hono app instance
 */
export const buildEtudeGenerate = (app: Hono<{ Bindings: any }>): void => {
  app.post(
    PATHS.ETUDE_GENERATE,
    secureHeaders(STANDARD_SECURE_HEADERS),
    signedInAccess,
    async (c: Context) => {
      const user = c.get('user') as AuthUser | null | undefined
      const db = c.get('db') as DrizzleClient | undefined

      if (!user || !user.id || !db) {
        return redirectWithError(c, PATHS.AUTH.SIGN_IN, 'You must sign in to visit that page.')
      }

      // Parse the submitted form, tolerating hostile shapes without a 500.
      const parsed = await c.req.parseBody({ all: true })
      const rawWorkflowVersion = parsed['workflowVersion']
      const submittedWorkflowVersion =
        typeof rawWorkflowVersion === 'string' ? rawWorkflowVersion : ''
      const rawAggregateEpoch = parsed['aggregateEpoch']
      const capturedEpoch =
        typeof rawAggregateEpoch === 'string' && /^\d+$/.test(rawAggregateEpoch)
          ? Number(rawAggregateEpoch)
          : -1

      // Call the workflow service's generate operation. The function is
      // async (it touches the DB) but never throws: every failure is
      // returned as a typed variant.
      let outcome
      try {
        outcome = await generateEtude(
          db,
          user.id,
          submittedWorkflowVersion,
          capturedEpoch,
          productionRandom,
          'generate-route',
        )
      } catch (e) {
        logError('etude generate unexpected error', { error: sanitizeError(e) })
        return handleUnexpectedError(c as unknown as Context<AppEnv>, e)
      }

      // Map the typed outcome to a redirect.
      switch (outcome.kind) {
        case 'success':
          return redirectWithMessage(c, outcome.redirectTarget, '')

        case 'stale-version':
          return redirectWithError(c, outcome.redirectTarget, STALE_OPERATION_MESSAGE)

        case 'prerequisites-not-met':
          return redirectWithError(c, outcome.redirectTarget, PREREQUISITES_NOT_MET_MESSAGE)

        case 'stored-values-invalid':
          return redirectWithError(c, outcome.redirectTarget, STORED_VALUES_INVALID_MESSAGE)

        case 'generator-failure':
          return redirectWithError(c, outcome.redirectTarget, GENERATOR_FAILURE_MESSAGE)

        case 'db-error':
          logError('etude generate db error', { error: sanitizeError(new Error('db-error')) })
          return redirectWithError(c, outcome.redirectTarget, DB_ERROR_MESSAGE)

        default:
          // Exhaustive check: if a new variant is added without a case
          // here, TypeScript will flag this unreachable branch.
          logError('etude generate unknown outcome', { error: sanitizeError(new Error('unknown')) })
          return redirectWithError(c, PATHS.ETUDE_REVIEW, DB_ERROR_MESSAGE)
      }
    },
  )
}
