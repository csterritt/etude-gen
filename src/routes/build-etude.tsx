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
import { SUPPORTED_KEYS, deriveKeyPitches } from '../lib/key-domain'
import { OCTAVE_MIN, OCTAVE_MAX, deriveAvailablePitches } from '../lib/music-domain'
import { parseParameterForm, type FieldSpec } from '../lib/etude-form-parser'
import { redirectWithError, redirectWithMessage } from '../lib/redirects'
import { shapeRedisplayPayload, type FieldError } from '../lib/safe-redisplay'
import { redirectWithValidationState, consumeValidationStateFromRequest } from '../lib/validation-state-helpers'

/**
 * Field specification for the setup parameter form. The setup form has five
 * expected fields. The octave field is multi-value (checkboxes), so it uses
 * the `string-multi` type which collects all submitted values into a
 * `string[]`. The single-value fields declare no repeated-field
 * normalization, so a repeated field is a reject (cross-cutting contract
 * section 2 rule 5).
 */
const SETUP_FIELD_SPEC: FieldSpec = {
  fields: {
    measures: { type: 'string' },
    meter: { type: 'string' },
    hands: { type: 'string' },
    key: { type: 'string' },
    octaves: { type: 'string-multi' },
  },
}

/**
 * Parse the stored `selectedOctaves` comma-separated string into a sorted
 * `number[]` for form pre-selection and available-pitch derivation. Falls
 * back to `[4]` (the default) when the string is empty or unparseable.
 */
const parseStoredOctaves = (stored: string): number[] => {
  const parts = stored.split(',').map((s) => s.trim()).filter((s) => s !== '')
  const nums = parts.map(Number).filter((n) => Number.isInteger(n))
  if (nums.length === 0) {
    return [4]
  }
  return nums.sort((a, b) => a - b)
}

/**
 * Optional redisplay data passed from the GET handler when a validation-state
 * record was consumed. `safeValues` override the committed aggregate values
 * for fields that have a safe redisplay value; `fieldErrors` are rendered
 * near each offending field with `data-testid='<field>-error'`; `droppedFields`
 * are fields that were removed by a bound and must use the committed aggregate
 * value instead.
 */
interface RedisplayData {
  safeValues: Record<string, string | string[]>
  fieldErrors: FieldError[]
  droppedFields: string[]
}

/**
 * Look up the field-level error message for a field, if any.
 */
const errorForField = (errors: FieldError[], field: string): string | null => {
  for (const e of errors) {
    if (e.field === field) {
      return e.message
    }
  }
  return null
}

/**
 * Render a field-level error element with `data-testid='<field>-error'` and
 * `aria-describedby` wiring. The full accessible error summary and focus
 * management is Issue 9's scope — this issue renders the field-level error
 * text and the data attributes Issue 9 will wire. Returns null when there is
 * no error for the field.
 */
const renderFieldError = (field: string, message: string) => {
  return (
    <p
      data-testid={`${field}-error`}
      className='text-xs text-error mt-1'
      id={`${field}-error`}
      role='alert'
    >
      {message}
    </p>
  )
}

/**
 * Render the JSX for the setup-step form pre-populated with the saved
 * aggregate's values, or with safe redisplay values when a validation-state
 * record was consumed. Every control has an accessible label and native HTML
 * constraints, with independent server enforcement behind them. The hidden
 * `workflowVersion` field carries the current version for compare-and-set
 * (Issue 10 wires the stale-version rejection; this issue emits the field
 * and increments on success).
 *
 * When `redisplay` is provided, for each field: if a safe value is present in
 * `safeValues`, use it to populate the form control's `value` attribute
 * instead of the committed aggregate value; if the field is in
 * `droppedFields`, use the committed aggregate value. For each field with an
 * error in `fieldErrors`, render an error element with
 * `data-testid='<field>-error'`. TSX contextual encoding automatically
 * escapes redisplayed values — no manual sanitization or markup stripping.
 */
const renderEtudeSetupForm = (params: EtudeParams, redisplay?: RedisplayData) => {
  const safeValues = redisplay?.safeValues ?? {}
  const fieldErrors = redisplay?.fieldErrors ?? []
  // Resolve the effective value for each field: a safe redisplay value if
  // present, otherwise the committed aggregate value.
  const measuresValue =
    typeof safeValues.measures === 'string' ? safeValues.measures : String(params.measureCount)
  const meterValue =
    typeof safeValues.meter === 'string' ? safeValues.meter : params.timeSignature
  const handsValue =
    typeof safeValues.hands === 'string' ? safeValues.hands : params.hand
  const keyValue =
    typeof safeValues.key === 'string' ? safeValues.key : params.keySignature
  // Octaves: use the safe redisplay array if present, otherwise the committed
  // aggregate's parsed octaves.
  const redisplayOctaves = Array.isArray(safeValues.octaves)
    ? safeValues.octaves.map(Number).filter((n) => Number.isInteger(n))
    : null
  const selectedOctaves = redisplayOctaves ?? parseStoredOctaves(params.selectedOctaves)
  const availablePitches = deriveAvailablePitches(keyValue, selectedOctaves)
  return (
    <div data-testid='etude-setup-banner' className='flex justify-center'>
      <div className='card w-full max-w-md bg-base-100 shadow-xl'>
        <div className='card-body'>
          <h2 className='card-title text-2xl font-bold mb-4'>Set up your etude</h2>
          <p className='text-gray-600 mb-6'>
            Choose how many measures, the time signature, which hand or hands to practice, and the key.
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
                value={measuresValue}
                aria-describedby={errorForField(fieldErrors, 'measures') ? 'measures-error' : undefined}
                data-testid='measures-field'
                className='input input-bordered w-full'
              />
              <p className='text-xs text-gray-500 mt-1'>Between 4 and 32 measures.</p>
              {errorForField(fieldErrors, 'measures') !== null &&
                renderFieldError('measures', errorForField(fieldErrors, 'measures')!)}
            </div>
            <div className='form-control mb-4'>
              <label className='label' htmlFor='meter-field'>
                <span className='label-text'>Time signature</span>
              </label>
              <select
                id='meter-field'
                name='meter'
                required
                value={meterValue}
                aria-describedby={errorForField(fieldErrors, 'meter') ? 'meter-error' : undefined}
                data-testid='meter-field'
                className='select select-bordered w-full'
              >
                {SUPPORTED_METERS.map((meter) => (
                  <option key={meter} value={meter} selected={meter === meterValue}>
                    {meter}
                  </option>
                ))}
              </select>
              <p className='text-xs text-gray-500 mt-1'>Choose 2/4, 3/4, or 4/4.</p>
              {errorForField(fieldErrors, 'meter') !== null &&
                renderFieldError('meter', errorForField(fieldErrors, 'meter')!)}
            </div>
            <div className='form-control mb-4'>
              <label className='label' htmlFor='hands-field'>
                <span className='label-text'>Hand</span>
              </label>
              <select
                id='hands-field'
                name='hands'
                required
                value={handsValue}
                aria-describedby={errorForField(fieldErrors, 'hands') ? 'hands-error' : undefined}
                data-testid='hands-field'
                className='select select-bordered w-full'
              >
                {SUPPORTED_HANDS.map((hand) => (
                  <option key={hand} value={hand} selected={hand === handsValue}>
                    {hand}
                  </option>
                ))}
              </select>
              <p className='text-xs text-gray-500 mt-1'>Left hand, right hand, or both hands.</p>
              {errorForField(fieldErrors, 'hands') !== null &&
                renderFieldError('hands', errorForField(fieldErrors, 'hands')!)}
            </div>
            <div className='form-control mb-6'>
              <label className='label' htmlFor='key-field'>
                <span className='label-text'>Key</span>
              </label>
              <select
                id='key-field'
                name='key'
                required
                value={keyValue}
                aria-describedby={errorForField(fieldErrors, 'key') ? 'key-error' : undefined}
                data-testid='key-field'
                className='select select-bordered w-full'
              >
                {SUPPORTED_KEYS.map((key) => (
                  <option key={key} value={key} selected={key === keyValue}>
                    {key}
                  </option>
                ))}
              </select>
              <p className='text-xs text-gray-500 mt-1'>
                The seven diatonic pitches for the selected key:
              </p>
              <p data-testid='key-pitches' className='text-sm text-gray-700 mt-1'>
                {deriveKeyPitches(keyValue).join(' ')}
              </p>
              {errorForField(fieldErrors, 'key') !== null &&
                renderFieldError('key', errorForField(fieldErrors, 'key')!)}
            </div>
            <div className='form-control mb-6'>
              <span className='label-text mb-2'>Octaves</span>
              <p className='text-xs text-gray-500 mt-1'>Select one or more octaves from 2 through 6.</p>
              <div className='flex flex-col gap-1 mt-2'>
                {Array.from({ length: OCTAVE_MAX - OCTAVE_MIN + 1 }, (_, i) => {
                  const octave = OCTAVE_MIN + i
                  const checked = selectedOctaves.includes(octave)
                  return (
                    <label key={octave} className='label cursor-pointer justify-start gap-2'>
                      <input
                        type='checkbox'
                        name='octaves'
                        value={String(octave)}
                        checked={checked}
                        data-testid='octaves-field'
                        id={`octaves-field-${octave}`}
                        className='checkbox checkbox-sm'
                      />
                      <span className='label-text'>Octave {octave}</span>
                    </label>
                  )
                })}
              </div>
              <p data-testid='available-range' className='text-xs text-gray-500 mt-2'>
                Available range: {availablePitches.lowest} to {availablePitches.highest}
              </p>
              {errorForField(fieldErrors, 'octaves') !== null &&
                renderFieldError('octaves', errorForField(fieldErrors, 'octaves')!)}
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

      // Consume any pending validation-state record from a rejected POST.
      // The nonce is single-use; an unknown/expired/foreign nonce yields null
      // identically. When a payload is present, its safeValues override the
      // committed aggregate values for redisplay, and its fieldErrors are
      // rendered near each offending field.
      let redisplay: { safeValues: Record<string, string | string[]>; fieldErrors: FieldError[]; droppedFields: string[] } | undefined
      try {
        const redisplayResult = await consumeValidationStateFromRequest(
          c as unknown as Context<AppEnv>,
          db,
          user.id,
        )
        redisplay =
          redisplayResult.isOk && redisplayResult.value !== null
            ? {
                safeValues: redisplayResult.value.safeValues,
                fieldErrors: redisplayResult.value.fieldErrors,
                droppedFields: redisplayResult.value.droppedFields,
              }
            : undefined
      } catch (err) {
        logError('consume validation state failed', { error: sanitizeError(err as Error) })
        redisplay = undefined
      }

      return c.render(useLayout(c, renderEtudeSetupForm(result.value, redisplay)))
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
        // Collect the parse failures as field-addressable errors and the
        // raw values that were parseable (an empty record if parsing failed
        // entirely). Shape the redisplay payload (drop-not-truncate bounds)
        // and store it server-side with a nonce cookie redirect.
        const fieldErrors: FieldError[] = parseResult.error.map((f) => ({
          field: f.field,
          message: f.reason,
        }))
        const shaped = shapeRedisplayPayload({}, fieldErrors)
        return redirectWithValidationState(c, PATHS.ETUDE_SETUP, db, user.id, shaped)
      }

      const raw = parseResult.value
      const validation = validateSetup({
        measureCount: raw.measures,
        timeSignature: raw.meter,
        hand: raw.hands,
        keySignature: raw.key,
        octaves: raw.octaves,
      })
      if (validation.isErr) {
        // Pass the raw string/string[] values from the parser and the
        // validation failures to the shaping module, then store the payload
        // server-side with a nonce cookie redirect. The shaping module
        // applies its own bounds; the raw values are the string/string[]
        // values, not the typed domain values.
        const fieldErrors: FieldError[] = validation.error.map((f) => ({
          field: f.field,
          message: f.reason,
        }))
        const shaped = shapeRedisplayPayload(raw, fieldErrors)
        return redirectWithValidationState(c, PATHS.ETUDE_SETUP, db, user.id, shaped)
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
