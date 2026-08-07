/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Test-only operation-POST precondition route.
 *
 * Exercises the `checkOperationPrecondition` gate that every real operation
 * POST (generate, render retry, pdf, start-over) will call before any lock
 * acquisition, external call, or state change. This route does no real work
 * — it only verifies the precondition and redirects accordingly. Gated by
 * `isTestRouteEnabled` so it never runs in production.
 * @module routes/test/etudeOperationPrecondition
 */
import { Context } from 'hono'
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'

import { STANDARD_SECURE_HEADERS } from '../../constants'
import type { AppEnv, AuthUser, DrizzleClient } from '../../local-types'
import { signedInAccess } from '../../middleware/signed-in-access'
import { loadEtudeParams } from '../../lib/etude-params-repository'
import { resolveCanonicalRoute } from '../../lib/canonical-route'
import { checkOperationPrecondition } from '../../lib/operation-precondition'
import { redirectWithError, redirectWithMessage } from '../../lib/redirects'
import { handleUnexpectedError } from '../build-safe-error'
import { logError, sanitizeError } from '../../lib/logger'

const STALE_FORM_MESSAGE =
  'Your request could not be processed because the form was stale. Please review the current values and try again.'

/**
 * Mount the test-only operation-precondition POST route on the given app.
 * The route is mounted under `/test/etude/operation-precondition` and
 * requires the `signedInAccess` middleware so it mirrors a real operation
 * POST's universal route requirements (cross-cutting contract section 1).
 */
export const handleEtudeOperationPrecondition = (app: Hono<{ Bindings: any }>): void => {
  app.post(
    '/test/etude/operation-precondition',
    secureHeaders(STANDARD_SECURE_HEADERS),
    signedInAccess,
    async (c: Context) => {
      const user = c.get('user') as AuthUser | null | undefined
      const db = c.get('db') as DrizzleClient | undefined

      if (!user || !user.id || !db) {
        return redirectWithError(c, '/auth/sign-in', 'You must sign in to visit that page.')
      }

      // Load the owner's aggregate. If none exists, redirect to /etude.
      const loadResult = await loadEtudeParams(db, user.id)
      if (loadResult.isErr) {
        logError('test operation precondition load failed', {
          error: sanitizeError(loadResult.error),
        })
        return handleUnexpectedError(c as unknown as Context<AppEnv>, loadResult.error)
      }
      if (loadResult.value === null) {
        return redirectWithMessage(c, '/etude', '')
      }

      const current = loadResult.value

      // Read the submitted workflowVersion and aggregateEpoch from the form.
      const parsed = await c.req.parseBody({ all: true })
      const rawWorkflowVersion = parsed['workflowVersion']
      const rawAggregateEpoch = parsed['aggregateEpoch']
      const submittedWorkflowVersion =
        typeof rawWorkflowVersion === 'string' ? rawWorkflowVersion : ''
      const capturedEpoch =
        typeof rawAggregateEpoch === 'string' ? Number(rawAggregateEpoch) : NaN

      // Check the precondition. On any failure, redirect 303 to the
      // canonical route with an explanatory error — no lock, no external
      // call, no state change.
      const preconditionResult = checkOperationPrecondition(
        current,
        submittedWorkflowVersion,
        Number.isNaN(capturedEpoch) ? -1 : capturedEpoch,
      )
      if (preconditionResult.isErr) {
        return redirectWithError(
          c,
          resolveCanonicalRoute(current),
          STALE_FORM_MESSAGE,
        )
      }

      // On success, redirect 303 to the canonical route with a confirmation.
      // This route does no real work — it only exercises the precondition gate.
      return redirectWithMessage(
        c,
        resolveCanonicalRoute(current),
        'Precondition passed. No operation was performed.',
      )
    },
  )
}
