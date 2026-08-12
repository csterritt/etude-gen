/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Route builder for the etude review step (Issue 19).
 *
 * `GET /etude/review` renders a read-only presentation of every selection —
 * measures, time signature, key, octave ranges, hands, selected pitches,
 * selected durations, and the split boundary where applicable — via the
 * shared `EtudeSummary` component (review level), plus a canonical GET Back
 * link to the prior step (`/etude/split` for two-hand, `/etude/notes` for
 * one-hand) and a Generate form. The Generate form is a real
 * `POST /etude/generate` form carrying the hidden workflow version, with a
 * submit button — neither inert nor hidden. Until Issue 20 implements the
 * route, `POST /etude/generate` answers by redirecting back to review with a
 * safe "not available yet" message; the form, its method, its action, and its
 * version field are asserted by this slice's tests.
 *
 * Review completion is derived, never persisted (cross-cutting contract
 * section 5): `GET /etude/review` is a safe, side-effect-free request. It
 * must not mark anything, write anything, or increment the workflow version.
 * A cacheable navigation request that mutated persisted state would let
 * browser prefetching, retries, multiple tabs, or automated link checking
 * change the workflow merely by reading it. The GET handler loads the
 * aggregate, checks reachability, and renders — nothing more.
 *
 * A direct visit when review is not reachable redirects to the canonical
 * route with a safe prerequisite-redirect message (Issue 18).
 *
 * The route inherits cross-cutting contract section 1: auth + no-cache via
 * the `signedInAccess` middleware, owner-scoped via `c.get('user')`. The
 * Generate form inherits section 3: it is an operation POST, so it carries
 * the workflow version as a precondition rather than a compare-and-set that
 * increments.
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
import { computeCanonicalRoute, isStepReachable, PREREQUISITE_REDIRECT_MESSAGE } from '../lib/workflow-service'
import { handleUnexpectedError } from './build-safe-error'
import { logError, sanitizeError } from '../lib/logger'
import { redirectWithError, redirectWithMessage, redirectWithPrerequisiteMessage } from '../lib/redirects'
import { EtudeSummary } from '../components/etude-summary'

/**
 * Render the JSX for the review step: the read-only summary, a Back link to
 * the canonical prior step, and the Generate form. The Back link target is
 * `/etude/split` for two-hand mode and `/etude/notes` for one-hand mode. The
 * Generate form is a POST to `/etude/generate` carrying the current workflow
 * version as a hidden field.
 */
const renderEtudeReview = (params: {
  measureCount: number
  timeSignature: string
  keySignature: string
  selectedOctaves: string
  hand: string
  selectedPitches: string | null
  selectedDurations: string | null
  splitBoundary: string | null
  workflowVersion: number
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
            <form
              method='post'
              action={PATHS.ETUDE_GENERATE}
              data-testid='etude-generate-form'
            >
              <input
                type='hidden'
                name='workflowVersion'
                value={String(params.workflowVersion)}
                data-testid='workflow-version-field'
              />
              <button
                type='submit'
                className='btn btn-primary'
                data-testid='generate-action'
              >
                Generate
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Attach the etude review route to the app.
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

      // If the review step's prerequisites are not met, redirect to the
      // canonical route with a safe prerequisite-redirect message. This
      // covers setup-unconfirmed, notes-unconfirmed, two-hand-split-
      // unconfirmed, corrupt-state fewer-than-two-pitches, and
      // stored-values-invalid rows (cross-cutting contract section 5).
      if (!isStepReachable(params, PATHS.ETUDE_REVIEW)) {
        const canonical = computeCanonicalRoute(params)
        return redirectWithPrerequisiteMessage(c, canonical, PREREQUISITE_REDIRECT_MESSAGE)
      }

      return c.render(useLayout(c, renderEtudeReview(params)))
    },
  )
}
