/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Route builder for the etude workflow entry path and the setup step.
 *
 * `GET /etude` loads (or creates) the owner's etude parameter aggregate,
 * resolves the canonical route for the current workflow state, and redirects
 * (303) to it. A freshly created aggregate has no confirmed steps, so the
 * canonical route is `/etude/setup`.
 *
 * `GET /etude/setup` renders the setup form pre-populated with the saved
 * aggregate's values, with native HTML constraints on every control,
 * accessible labels, and a hidden `workflowVersion` field. Issue 5 replaces
 * the earlier placeholder stub with this real form.
 *
 * Both routes inherit cross-cutting contract section 1: auth + no-cache via
 * the `signedInAccess` middleware, correlation via the existing
 * `correlationIdMiddleware`, owner-scoped via `c.get('user')`.
 * @module routes/buildEtude
 */
import type { Context } from 'hono'
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'

import { PATHS, STANDARD_SECURE_HEADERS } from '../constants'
import { Bindings, type AppEnv, type AuthUser, type DrizzleClient } from '../local-types'
import { useLayout } from './build-layout'
import { signedInAccess } from '../middleware/signed-in-access'
import { loadOrCreateEtudeParams, loadEtudeParams, updateEtudeSetup } from '../lib/etude-params-repository'
import type { EtudeParams } from '../lib/etude-params-repository'
import { resolveCanonicalRoute } from '../lib/canonical-route'
import { handleUnexpectedError } from './build-safe-error'
import { logError, sanitizeError } from '../lib/logger'
import { validateSetup, SUPPORTED_METERS, SUPPORTED_HANDS } from '../lib/setup-validator'
import { parseParameterForm, type FieldSpec } from '../lib/etude-form-parser'
import { redirectWithError, redirectWithMessage } from '../lib/redirects'

/**
 * Field specification for the setup parameter form. The setup form has three
 * expected fields and declares no repeated-field normalization, so a
 * repeated field is a reject (cross-cutting contract section 2 rule 5).
 */
const SETUP_FIELD_SPEC: FieldSpec = {
  fields: {
    measures: { type: 'string' },
    meter: { type: 'string' },
    hands: { type: 'string' },
  },
}

/**
 * Render the JSX for the setup-step form pre-populated with the saved
 * aggregate's values. Every control has an accessible label and native HTML
 * constraints, with independent server enforcement behind them. The hidden
 * `workflowVersion` field carries the current version for compare-and-set
 * (Issue 10 wires the stale-version rejection; this issue emits the field
 * and increments on success).
 */
const renderEtudeSetupForm = (params: EtudeParams) => {
  return (
    <div data-testid='etude-setup-banner' className='flex justify-center'>
      <div className='card w-full max-w-md bg-base-100 shadow-xl'>
        <div className='card-body'>
          <h2 className='card-title text-2xl font-bold mb-4'>Set up your etude</h2>
          <p className='text-gray-600 mb-6'>
            Choose how many measures, the time signature, and which hand or hands to practice.
          </p>
          <form method='post' action={PATHS.ETUDE_SETUP} data-testid='etude-setup-form'>
            <input
              type='hidden'
              name='workflowVersion'
              value={String(params.workflowVersion)}
              data-testid='workflow-version-field'
            />
            <div className='form-control mb-4'>
              <label className='label' htmlFor='measures-field'>
                <span className='label-text'>Measures</span>
              </label>
              <input
                id='measures-field'
                name='measures'
                type='number'
                inputMode='numeric'
                min='4'
                max='32'
                step='1'
                required
                value={String(params.measureCount)}
                data-testid='measures-field'
                className='input input-bordered w-full'
              />
              <p className='text-xs text-gray-500 mt-1'>Between 4 and 32 measures.</p>
            </div>
            <div className='form-control mb-4'>
              <label className='label' htmlFor='meter-field'>
                <span className='label-text'>Time signature</span>
              </label>
              <select
                id='meter-field'
                name='meter'
                required
                value={params.timeSignature}
                data-testid='meter-field'
                className='select select-bordered w-full'
              >
                {SUPPORTED_METERS.map((meter) => (
                  <option key={meter} value={meter} selected={meter === params.timeSignature}>
                    {meter}
                  </option>
                ))}
              </select>
              <p className='text-xs text-gray-500 mt-1'>Choose 2/4, 3/4, or 4/4.</p>
            </div>
            <div className='form-control mb-6'>
              <label className='label' htmlFor='hands-field'>
                <span className='label-text'>Hand</span>
              </label>
              <select
                id='hands-field'
                name='hands'
                required
                value={params.hand}
                data-testid='hands-field'
                className='select select-bordered w-full'
              >
                {SUPPORTED_HANDS.map((hand) => (
                  <option key={hand} value={hand} selected={hand === params.hand}>
                    {hand}
                  </option>
                ))}
              </select>
              <p className='text-xs text-gray-500 mt-1'>Left hand, right hand, or both hands.</p>
            </div>
            <div className='card-actions justify-end'>
              <button type='submit' className='btn btn-primary' data-testid='setup-save-action'>
                Save setup
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

/**
 * Attach the etude entry and setup routes to the app.
 * @param app - Hono app instance
 */
export const buildEtude = (app: Hono<{ Bindings: Bindings }>): void => {
  app.get(
    PATHS.ETUDE,
    secureHeaders(STANDARD_SECURE_HEADERS),
    signedInAccess,
    async (c: Context) => {
      const user = c.get('user') as AuthUser | null | undefined
      const db = c.get('db') as DrizzleClient | undefined

      if (!user || !user.id || !db) {
        return redirectWithMessage(c, PATHS.AUTH.SIGN_IN, 'You must sign in to visit that page.')
      }

      const result = await loadOrCreateEtudeParams(db, user.id)

      if (result.isErr) {
        logError('etude entry load-or-create failed', { error: sanitizeError(result.error) })
        return handleUnexpectedError(c as unknown as Context<AppEnv>, result.error)
      }

      const canonicalRoute = resolveCanonicalRoute(result.value)
      return redirectWithMessage(c, canonicalRoute, '')
    },
  )

  app.get(
    PATHS.ETUDE_SETUP,
    secureHeaders(STANDARD_SECURE_HEADERS),
    signedInAccess,
    async (c: Context) => {
      const user = c.get('user') as AuthUser | null | undefined
      const db = c.get('db') as DrizzleClient | undefined

      if (!user || !user.id || !db) {
        return redirectWithMessage(c, PATHS.AUTH.SIGN_IN, 'You must sign in to visit that page.')
      }

      const result = await loadEtudeParams(db, user.id)

      if (result.isErr) {
        logError('etude setup load failed', { error: sanitizeError(result.error) })
        return handleUnexpectedError(c as unknown as Context<AppEnv>, result.error)
      }

      // No aggregate yet: redirect to /etude so the aggregate is created
      // first, then the canonical resolver will send the student back here.
      if (result.value === null) {
        return redirectWithMessage(c, PATHS.ETUDE, '')
      }

      return c.render(useLayout(c, renderEtudeSetupForm(result.value)))
    },
  )

  app.post(
    PATHS.ETUDE_SETUP,
    secureHeaders(STANDARD_SECURE_HEADERS),
    signedInAccess,
    async (c: Context) => {
      const user = c.get('user') as AuthUser | null | undefined
      const db = c.get('db') as DrizzleClient | undefined

      if (!user || !user.id || !db) {
        return redirectWithMessage(c, PATHS.AUTH.SIGN_IN, 'You must sign in to visit that page.')
      }

      // Parse the submitted form, tolerating hostile shapes without a 500.
      // Use parseBody({ all: true }) to get a Record with array values for
      // repeated fields, then convert to FormData so the reusable parser
      // can handle both multipart and urlencoded submissions uniformly.
      const parsed = await c.req.parseBody({ all: true })
      const form = new FormData()
      for (const [key, value] of Object.entries(parsed)) {
        if (Array.isArray(value)) {
          for (const v of value) {
            form.append(key, typeof v === 'string' ? v : String(v))
          }
        } else {
          form.append(key, typeof value === 'string' ? value : String(value))
        }
      }
      const parseResult = parseParameterForm(form, SETUP_FIELD_SPEC)
      if (parseResult.isErr) {
        const firstReason = parseResult.error[0]?.reason ?? 'Invalid setup submission.'
        return redirectWithError(c, PATHS.ETUDE_SETUP, firstReason)
      }

      const raw = parseResult.value
      const validation = validateSetup({
        measureCount: raw.measures,
        timeSignature: raw.meter,
        hand: raw.hands,
      })
      if (validation.isErr) {
        const firstReason = validation.error[0]?.reason ?? 'Invalid setup submission.'
        return redirectWithError(c, PATHS.ETUDE_SETUP, firstReason)
      }

      // Load the current aggregate to obtain the current epoch for the
      // conditional update. The version and epoch are read from the stored
      // aggregate, not from the form — the hidden workflowVersion field is
      // emitted for Issue 10's compare-and-set, not trusted here.
      const loadResult = await loadEtudeParams(db, user.id)
      if (loadResult.isErr) {
        logError('etude setup post load failed', { error: sanitizeError(loadResult.error) })
        return handleUnexpectedError(c as unknown as Context<AppEnv>, loadResult.error)
      }
      if (loadResult.value === null) {
        // No aggregate yet: redirect to /etude so it is created first.
        return redirectWithMessage(c, PATHS.ETUDE, '')
      }

      const updateResult = await updateEtudeSetup(
        db,
        user.id,
        loadResult.value.aggregateEpoch,
        validation.value,
      )
      if (updateResult.isErr) {
        // Epoch mismatch or DB failure: safe generic error, no internal detail.
        return redirectWithError(
          c,
          PATHS.ETUDE_SETUP,
          'Your setup could not be saved. Please try again.',
        )
      }

      return redirectWithMessage(c, PATHS.ETUDE_SETUP, 'Setup saved.')
    },
  )
}
