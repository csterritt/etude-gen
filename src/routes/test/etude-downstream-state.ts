/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Test-only downstream-state seed and inspection routes.
 *
 * `POST /test/etude/seed-downstream-state` sets the downstream selection data
 * and confirmation flags on the owner's aggregate, simulating the notes and
 * split steps having been completed (those steps arrive in later slices —
 * Issues 13, 14, 16). `GET /test/etude/aggregate-state` returns the owner's
 * aggregate as JSON, including the derived `isReviewReachable` flag.
 *
 * Both routes are gated by `isTestRouteEnabled` so they never run in
 * production. They require `signedInAccess` so they mirror a real route's
 * universal route requirements (cross-cutting contract section 1).
 * @module routes/test/etudeDownstreamState
 */
import { Context } from 'hono'
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { eq } from 'drizzle-orm'

import { STANDARD_SECURE_HEADERS } from '../../constants'
import type { AppEnv, AuthUser, DrizzleClient } from '../../local-types'
import { signedInAccess } from '../../middleware/signed-in-access'
import { etudeParams } from '../../db/schema'
import { loadEtudeParams } from '../../lib/etude-params-repository'
import { isReviewReachable } from '../../lib/etude-invalidation'
import { redirectWithError, redirectWithMessage } from '../../lib/redirects'
import { handleUnexpectedError } from '../build-safe-error'
import { logError, sanitizeError } from '../../lib/logger'

/**
 * Mount the test-only seed-downstream-state POST route and the
 * aggregate-state GET inspection route on the given app.
 */
export const handleEtudeDownstreamState = (app: Hono<{ Bindings: any }>): void => {
  app.post(
    '/test/etude/seed-downstream-state',
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
        logError('test seed downstream state load failed', {
          error: sanitizeError(loadResult.error),
        })
        return handleUnexpectedError(c as unknown as Context<AppEnv>, loadResult.error)
      }
      if (loadResult.value === null) {
        return redirectWithMessage(c, '/etude', '')
      }

      // Read the optional downstream data fields from the submitted form.
      const parsed = await c.req.parseBody({ all: true })
      const selectedPitches =
        typeof parsed['selectedPitches'] === 'string' ? (parsed['selectedPitches'] as string) : null
      const selectedDurations =
        typeof parsed['selectedDurations'] === 'string'
          ? (parsed['selectedDurations'] as string)
          : null
      const splitBoundary =
        typeof parsed['splitBoundary'] === 'string' ? (parsed['splitBoundary'] as string) : null

      // Set the downstream confirmation flags and data fields directly. This
      // is test infrastructure that simulates the notes and split steps — it
      // does not go through the parameter-form CAS path.
      try {
        await db
          .update(etudeParams)
          .set({
            notesConfirmed: true,
            splitConfirmed: true,
            selectedPitches,
            selectedDurations,
            splitBoundary,
          })
          .where(eq(etudeParams.userId, user.id))
          .run()
      } catch (e) {
        logError('test seed downstream state update failed', {
          error: sanitizeError(e instanceof Error ? e : new Error(String(e))),
        })
        return handleUnexpectedError(
          c as unknown as Context<AppEnv>,
          e instanceof Error ? e : new Error(String(e)),
        )
      }

      return redirectWithMessage(c, '/etude', 'Downstream state seeded.')
    },
  )

  app.get(
    '/test/etude/aggregate-state',
    secureHeaders(STANDARD_SECURE_HEADERS),
    signedInAccess,
    async (c: Context) => {
      const user = c.get('user') as AuthUser | null | undefined
      const db = c.get('db') as DrizzleClient | undefined

      if (!user || !user.id || !db) {
        return c.json({ error: 'Unauthorized' }, 401)
      }

      const loadResult = await loadEtudeParams(db, user.id)
      if (loadResult.isErr) {
        logError('test aggregate state load failed', {
          error: sanitizeError(loadResult.error),
        })
        return c.json({ error: 'Internal error' }, 500)
      }
      if (loadResult.value === null) {
        return c.json({ error: 'No aggregate' }, 404)
      }

      const params = loadResult.value
      return c.json({
        setupConfirmed: params.setupConfirmed,
        notesConfirmed: params.notesConfirmed,
        splitConfirmed: params.splitConfirmed,
        selectedPitches: params.selectedPitches,
        selectedDurations: params.selectedDurations,
        splitBoundary: params.splitBoundary,
        workflowVersion: params.workflowVersion,
        hand: params.hand,
        isReviewReachable: isReviewReachable(params),
      })
    },
  )
}
