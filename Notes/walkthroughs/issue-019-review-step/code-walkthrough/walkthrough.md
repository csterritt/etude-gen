# Issue 19: Review step and Generate form

*2026-08-12T20:44:10Z by Showboat 0.6.1*
<!-- showboat-id: 9dbe6eba-7849-4699-b3a5-cd98aa7b67da -->

Issue 19 replaces the Issue 17 review stub with the full review step: a read-only summary, a canonical GET Back link, and a real Generate form (POST /etude/generate carrying the hidden workflowVersion). It also moves the derived review predicate isReviewReachable into the workflow service for a single canonical home, and adds the POST /etude/generate stub route that verifies the operation-POST precondition (version + epoch) and redirects accordingly — doing no external work, acquiring no lock, and not incrementing the workflow version.

## 1. The full review step in src/routes/build-etude-review.tsx

```bash
sed -n '1,60p' /home/chris/etude-gen/src/routes/build-etude-review.tsx
```

```output
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
```

```bash
sed -n '61,155p' /home/chris/etude-gen/src/routes/build-etude-review.tsx
```

```output
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
```

## 2. The POST /etude/generate stub route in src/routes/build-etude-generate.tsx

```bash
cat /home/chris/etude-gen/src/routes/build-etude-generate.tsx
```

```output
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
```

## 3. The isReviewReachable move into src/lib/workflow-service.ts

```bash
sed -n '233,278p' /home/chris/etude-gen/src/lib/workflow-service.ts
```

```output
export const isStepReachable = (
  params: EtudeParams | null,
  stepPath: string,
): boolean => {
  if (params === null) {
    return stepPath === PATHS.ETUDE_SETUP
  }
  // The split step is never reachable for one-hand workflows (it is skipped).
  if (stepPath === PATHS.ETUDE_SPLIT && params.hand !== 'both') {
    return false
  }
  const canonical = computeCanonicalRoute(params)
  return STEP_ORDER[canonical] >= STEP_ORDER[stepPath]
}

/**
 * Derive whether the review step is reachable from the current aggregate
 * state, without consulting any stored review flag (none exists).
 *
 * Review is reachable exactly when setup is confirmed, the notes step is
 * confirmed, and — when both hands are selected — the split step is also
 * confirmed. For one-hand mode the split step is never required
 * (cross-cutting contract section 5). This predicate is the generation
 * precondition (Issue 19): `POST /etude/generate` is offered on the review
 * page exactly when this returns `true`, and a stale review (after an
 * upstream change that unconfirms a downstream step) simply stops being
 * reachable — no review flag is written or cleared, because none exists.
 *
 * The function is pure: it reads only the confirmation flags and `hand`, and
 * does not touch the DB or mutate its argument.
 * @param params - The current aggregate snapshot
 * @returns `true` when the review step is reachable
 */
export const isReviewReachable = (params: EtudeParams): boolean => {
  if (!params.setupConfirmed) {
    return false
  }
  if (!params.notesConfirmed) {
    return false
  }
  if (params.hand === 'both' && !params.splitConfirmed) {
    return false
  }
  return true
}
```

## 4. The PATHS.ETUDE_GENERATE constant in src/constants.ts

```bash
grep -n 'ETUDE_GENERATE' /home/chris/etude-gen/src/constants.ts
```

```output
30:  ETUDE_GENERATE: '/etude/generate' as const,
```

## 5. Verification: unit tests pass

```bash
cd /home/chris/etude-gen && bun test tests/review-predicate.spec.ts tests/etude-invalidation.spec.ts tests/workflow-service.spec.ts 2>&1 | tail -5
```

```output

 74 pass
 0 fail
 161 expect() calls
Ran 74 tests across 3 files. [27.00ms]
```
