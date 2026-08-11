/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Route builder for the etude review step stub (Issue 17).
 *
 * `GET /etude/review` renders a read-only summary of every earlier answer
 * via the shared `EtudeSummary` component (review level), plus a canonical
 * GET Back link to the prior step (`/etude/split` for two-hand,
 * `/etude/notes` for one-hand). A direct visit when review is not reachable
 * redirects to the canonical route with a safe message.
 *
 * This is a stub: it renders only the summary and Back link and defines no
 * POST handler. Issue 19 will replace it with the full review step (Generate
 * form, etc.).
 *
 * The route inherits cross-cutting contract section 1: auth + no-cache via
 * the `signedInAccess` middleware, owner-scoped via `c.get('user')`.
 * @module routes/buildEtudeReview
 */
import type { Context } from 'hono'
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'

import { PATHS, STANDARD_SECURE_HEADERS } from '../constants'
import { type AppEnv, type AuthUser, type DrizzleClient } from '../local-types'
import { useLayout } from './build-layout'
import { signedInAccess } from '../middleware/signed-in-access'
import { loadEtudeParams } from '../lib/etude-params-repository'
import { resolveCanonicalRoute } from '../lib/canonical-route'
import { handleUnexpectedError } from './build-safe-error'
import { logError, sanitizeError } from '../lib/logger'
import { redirectWithError, redirectWithMessage } from '../lib/redirects'
import { EtudeSummary } from '../components/etude-summary'

/**
 * Render the JSX for the stub review step: the read-only summary and a Back
 * link to the canonical prior step. The Back link target is `/etude/split`
 * for two-hand mode and `/etude/notes` for one-hand mode.
 */
const renderEtudeReviewStub = (params: {
  measureCount: number
  timeSignature: string
  keySignature: string
  selectedOctaves: string
  hand: string
  selectedPitches: string | null
  selectedDurations: string | null
  splitBoundary: string | null
}) => {
  const backTarget = params.hand === 'both' ? PATHS.ETUDE_SPLIT : PATHS.ETUDE_NOTES
  return (
    <div data-testid='etude-review-banner' className='flex justify-center'>
      <div className='card w-full max-w-md bg-base-100 shadow-xl'>
        <div className='card-body'>
          <h2 className='card-title text-2xl font-bold mb-4'>Review</h2>
          <EtudeSummary params={params} step='review' />
          <div className='card-actions justify-end gap-2'>
            <a
              href={backTarget}
              className='btn btn-ghost'
              data-testid='review-back-action'
            >
              Back
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Attach the stub etude review route to the app.
 * @param app - Hono app instance
 */
export const buildEtudeReview = (app: Hono<{ Bindings: any }>): void => {
  app.get(
    PATHS.ETUDE_REVIEW,
    secureHeaders(STANDARD_SECURE_HEADERS),
    signedInAccess,
    async (c: Context) => {
      const user = c.get('user') as AuthUser | null | undefined
      const db = c.get('db') as DrizzleClient | undefined

      if (!user || !user.id || !db) {
        return redirectWithError(c, PATHS.AUTH.SIGN_IN, 'You must sign in to visit that page.')
      }

      const result = await loadEtudeParams(db, user.id)
      if (result.isErr) {
        logError('etude review load failed', { error: sanitizeError(result.error) })
        return handleUnexpectedError(c as unknown as Context<AppEnv>, result.error)
      }

      // No aggregate: redirect to /etude so it is created first.
      if (result.value === null) {
        return redirectWithMessage(c, PATHS.ETUDE, '')
      }

      const params = result.value

      // If the canonical route for the current state is not /etude/review,
      // redirect to the canonical route. This single guard covers
      // setup-unconfirmed, notes-unconfirmed, two-hand-split-unconfirmed,
      // and the corrupt-state fewer-than-two-pitches rows (cross-cutting
      // contract section 5: any direct GET for a step that is not reachable
      // redirects to the canonical route).
      const canonical = resolveCanonicalRoute(params)
      if (canonical !== PATHS.ETUDE_REVIEW) {
        return redirectWithMessage(c, canonical, '')
      }

      return c.render(useLayout(c, renderEtudeReviewStub(params)))
    },
  )
}
