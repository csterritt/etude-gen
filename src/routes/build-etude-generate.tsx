/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Route builder for the etude generate stub (Issue 19).
 *
 * `POST /etude/generate` is the operation POST rendered on the review page.
 * Until Issue 20 implements real generation, this stub verifies the
 * operation-POST precondition (cross-cutting contract section 3: the
 * workflow version as a precondition, not a compare-and-set that increments,
 * plus the aggregate-epoch check from section 4) and redirects accordingly.
 * It does no external work, acquires no lock, does not increment the
 * workflow version, and does not modify any stored value.
 *
 * On a valid precondition, it redirects 303 to `/etude/review` with a safe
 * "not available yet" message. On a missing, tampered, or stale version, or
 * an epoch mismatch, it redirects 303 to the canonical route with a safe
 * error and no state change.
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
import { loadEtudeParams } from '../lib/etude-params-repository'
import { computeCanonicalRoute } from '../lib/workflow-service'
import { checkOperationPrecondition } from '../lib/operation-precondition'
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
 * Safe "not available yet" message displayed when the Generate form is
 * submitted with a valid precondition. Issue 20 will replace this with real
 * generation. Exposes no internal identifiers.
 */
const GENERATE_NOT_AVAILABLE_MESSAGE =
  'Generation isn\u2019t available yet. Please check back soon.'

/**
 * Attach the etude generate stub route to the app.
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

      // Load the owner's aggregate. If none exists, redirect to /etude.
      const loadResult = await loadEtudeParams(db, user.id)
      if (loadResult.isErr) {
        logError('etude generate load failed', { error: sanitizeError(loadResult.error) })
        return handleUnexpectedError(c as unknown as Context<AppEnv>, loadResult.error)
      }
      if (loadResult.value === null) {
        return redirectWithMessage(c, PATHS.ETUDE, '')
      }

      const params = loadResult.value

      // Parse the submitted form, tolerating hostile shapes without a 500.
      // A missing or non-string workflowVersion is treated as a stale
      // version by checkOperationPrecondition.
      const parsed = await c.req.parseBody({ all: true })
      const rawWorkflowVersion = parsed['workflowVersion']
      const submittedWorkflowVersion =
        typeof rawWorkflowVersion === 'string' ? rawWorkflowVersion : ''

      // Check the operation-POST precondition (cross-cutting contract
      // section 3: version as precondition, not incremented; section 4:
      // aggregate-epoch check). The epoch is captured from the loaded
      // aggregate — the form carries only the version. On any failure,
      // redirect 303 to the canonical route with a safe error — no lock,
      // no external call, no state change.
      const preconditionResult = checkOperationPrecondition(
        params,
        submittedWorkflowVersion,
        params.aggregateEpoch,
      )
      if (preconditionResult.isErr) {
        const canonical = computeCanonicalRoute(params)
        return redirectWithError(c, canonical, STALE_OPERATION_MESSAGE)
      }

      // On success, redirect 303 to /etude/review with a safe "not
      // available yet" message. This stub does no external work, acquires
      // no lock, does not increment the workflow version, and does not
      // modify any stored value. Issue 20 will replace this with real
      // generation.
      return redirectWithMessage(c, PATHS.ETUDE_REVIEW, GENERATE_NOT_AVAILABLE_MESSAGE)
    },
  )
}
