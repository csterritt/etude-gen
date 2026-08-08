/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Route builder for the etude notes step (Issue 13).
 *
 * `GET /etude/notes` renders the pitch-selection form: available pitches
 * derived from the stored key and octave range, pre-selected per the
 * first-derivation semantics (all available when no selection is stored) or
 * the stored narrowed selection (never re-expanded). The form carries a hidden
 * `workflowVersion` field for compare-and-set, accessible labels, an error
 * summary, and two submit buttons: an ordinary Save and a Select all.
 *
 * `POST /etude/notes` handles two actions:
 * - `save`: validates the submitted pitches against the available set and the
 *   cardinality rules (one pitch for one-hand, two for two-hand), persists via
 *   `updateEtudePitches` (CAS), and redirects 303 to `/etude/notes`.
 * - `select-all`: ignores the submitted checkboxes, persists all available
 *   pitches via `updateEtudePitches`, and redirects 303 to `/etude/notes`.
 *   Select all can never produce a cardinality error because it selects every
 *   available pitch.
 *
 * Both routes inherit cross-cutting contract section 1: auth + no-cache via
 * the `signedInAccess` middleware, owner-scoped via `c.get('user')`.
 * @module routes/buildEtudeNotes
 */
import type { Context } from 'hono'
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { raw } from 'hono/utils/html'

import { PATHS, STANDARD_SECURE_HEADERS, ALLOW_SCRIPTS_SECURE_HEADERS } from '../constants'
import { type AppEnv, type AuthUser, type DrizzleClient } from '../local-types'
import { useLayout } from './build-layout'
import { signedInAccess } from '../middleware/signed-in-access'
import { loadEtudeParams, updateEtudePitches } from '../lib/etude-params-repository'
import { resolveCanonicalRoute } from '../lib/canonical-route'
import { handleUnexpectedError } from './build-safe-error'
import { logError, sanitizeError } from '../lib/logger'
import { deriveAvailablePitches, parseStoredOctaves } from '../lib/music-domain'
import { parseWorkflowVersionField } from '../lib/workflow-version-field'
import { redirectWithError, redirectWithMessage } from '../lib/redirects'
import { shapeRedisplayPayload, type FieldError } from '../lib/safe-redisplay'
import { redirectWithValidationState, consumeValidationStateFromRequest } from '../lib/validation-state-helpers'
import { ErrorSummary, buildErrorSummaryEntries, type ErrorSummaryEntry } from '../components/error-summary'
import { buildErrorSummaryFocusScript } from '../lib/error-summary-focus'
import {
  validatePitchSelection,
  resolvePitchSelectionState,
} from '../lib/pitch-selection-validator'

/**
 * Field order for the notes form, used by `buildErrorSummaryEntries` to order
 * summary entries by the fields' visual appearance.
 */
const NOTES_FIELD_ORDER = ['pitches'] as const

/**
 * Optional redisplay data passed from the GET handler when a validation-state
 * record was consumed. Mirrors the setup route's `RedisplayData`.
 */
interface RedisplayData {
  safeValues: Record<string, string | string[]>
  fieldErrors: FieldError[]
  droppedFields: string[]
}

/**
 * Return the error-summary entries that belong to a single field.
 */
const entriesForField = (entries: ErrorSummaryEntry[], field: string): ErrorSummaryEntry[] =>
  entries.filter((e) => e.anchorId.startsWith(`${field}-error-`))

/**
 * Build the `aria-describedby` value for a control: always includes the
 * instructions id, plus the anchor id of each error entry for the field.
 */
const describedByFor = (
  entries: ErrorSummaryEntry[],
  field: string,
  instructionsId: string,
): string => {
  const errorIds = entriesForField(entries, field).map((e) => e.anchorId)
  return [instructionsId, ...errorIds].join(' ')
}

/**
 * Render the field-level error elements for a single field. Each error gets a
 * unique id matching its summary entry's `anchorId` so the control's
 * `aria-describedby` can reference it precisely. The `data-testid` stays as
 * `<field>-error` for test discovery.
 */
const renderFieldErrors = (entries: ErrorSummaryEntry[], field: string) => {
  const fieldEntries = entriesForField(entries, field)
  if (fieldEntries.length === 0) {
    return null
  }
  return fieldEntries.map((entry) => (
    <p
      key={entry.anchorId}
      data-testid={`${field}-error`}
      className='text-xs text-error mt-1'
      id={entry.anchorId}
      role='alert'
    >
      {entry.text}
    </p>
  ))
}

/**
 * Render the JSX for the notes-step pitch-selection form. Available pitches
 * are derived from the stored key and octave range. The pre-selected pitches
 * come from `resolvePitchSelectionState` (first-derivation all-selected
 * default, or the stored narrowed selection). When `redisplay` is present, the
 * submitted pitches override the pre-selection for redisplay.
 */
const renderEtudeNotesForm = (params: EtudeParamsLike, redisplay?: RedisplayData) => {
  const safeValues = redisplay?.safeValues ?? {}
  const fieldErrors = redisplay?.fieldErrors ?? []
  const octaves = parseStoredOctaves(params.selectedOctaves)
  const available = deriveAvailablePitches(params.keySignature, octaves)
  const availablePitches = available.pitches
  const firstPitchId = `pitch-field-${availablePitches[0] ?? 'none'}`
  const groupFields: Record<string, { firstMemberId: string }> =
    availablePitches.length > 0 ? { pitches: { firstMemberId: firstPitchId } } : {}

  // Build the error-summary entries with the group-field config so group-level
  // errors link to the first pitch checkbox.
  const entries = buildErrorSummaryEntries(
    fieldErrors,
    [...NOTES_FIELD_ORDER],
    groupFields,
  )

  // Resolve the pre-selected pitches: first-derivation all-selected, or the
  // stored narrowed selection.
  const resolved = resolvePitchSelectionState(params.selectedPitches, availablePitches)
  // When redisplay data is present, the submitted pitches override the
  // pre-selection.
  const redisplayPitches = Array.isArray(safeValues.pitches)
    ? safeValues.pitches
    : null
  const selectedPitches = redisplayPitches ?? resolved.selectedPitches
  const selectedSet = new Set(selectedPitches)

  return (
    <div data-testid='etude-notes-banner' className='flex justify-center'>
      <div className='card w-full max-w-md bg-base-100 shadow-xl'>
        <div className='card-body'>
          <h2 className='card-title text-2xl font-bold mb-4'>Select pitches</h2>
          <p className='text-gray-600 mb-6'>
            Choose which pitches from the available range to include in your etude.
          </p>
          {entries.length > 0 && <ErrorSummary entries={entries} />}
          {entries.length > 0 && raw(buildErrorSummaryFocusScript('error-summary'))}
          <form method='post' action={PATHS.ETUDE_NOTES} data-testid='etude-notes-form'>
            <input
              type='hidden'
              name='workflowVersion'
              value={String(params.workflowVersion)}
              data-testid='workflow-version-field'
            />
            <fieldset
              className='form-control mb-6'
              aria-describedby={describedByFor(entries, 'pitches', 'pitches-instructions')}
            >
              <legend className='label-text mb-2'>Pitches</legend>
              <p id='pitches-instructions' className='text-xs text-gray-500 mt-1'>
                Select one or more pitches from the available range.
              </p>
              <div className='flex flex-col gap-1 mt-2'>
                {availablePitches.map((pitch) => {
                  const checked = selectedSet.has(pitch)
                  return (
                    <label key={pitch} className='label cursor-pointer justify-start gap-2'>
                      <input
                        type='checkbox'
                        name='pitches'
                        value={pitch}
                        checked={checked}
                        data-testid={`pitch-field-${pitch}`}
                        id={`pitch-field-${pitch}`}
                        className='checkbox checkbox-sm'
                      />
                      <span className='label-text'>{pitch}</span>
                    </label>
                  )
                })}
              </div>
              <p data-testid='available-range' className='text-xs text-gray-500 mt-2'>
                Available range: {available.lowest} to {available.highest}
              </p>
              {renderFieldErrors(entries, 'pitches')}
            </fieldset>
            <div className='card-actions justify-end gap-2'>
              <button
                type='submit'
                name='action'
                value='select-all'
                className='btn btn-ghost'
                data-testid='notes-select-all-action'
              >
                Select all
              </button>
              <button
                type='submit'
                name='action'
                value='save'
                className='btn btn-primary'
                data-testid='notes-save-action'
              >
                Save pitches
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

/**
 * Minimal interface for the aggregate fields the notes form reads. Avoids
 * importing the full `EtudeParams` type (which carries DB-specific fields the
 * form does not touch).
 */
interface EtudeParamsLike {
  keySignature: string
  selectedOctaves: string
  selectedPitches: string | null
  workflowVersion: number
}

/**
 * Attach the etude notes routes to the app.
 * @param app - Hono app instance
 */
export const buildEtudeNotes = (app: Hono<{ Bindings: any }>): void => {
  app.get(
    PATHS.ETUDE_NOTES,
    secureHeaders(ALLOW_SCRIPTS_SECURE_HEADERS),
    signedInAccess,
    async (c: Context) => {
      const user = c.get('user') as AuthUser | null | undefined
      const db = c.get('db') as DrizzleClient | undefined

      if (!user || !user.id || !db) {
        return redirectWithError(c, PATHS.AUTH.SIGN_IN, 'You must sign in to visit that page.')
      }

      const result = await loadEtudeParams(db, user.id)
      if (result.isErr) {
        logError('etude notes load failed', { error: sanitizeError(result.error) })
        return handleUnexpectedError(c as unknown as Context<AppEnv>, result.error)
      }

      // No aggregate: redirect to /etude so it is created first.
      if (result.value === null) {
        return redirectWithMessage(c, PATHS.ETUDE, '')
      }

      // Setup not confirmed: redirect to the canonical route (which will be
      // /etude/setup) so the student completes setup before reaching the
      // notes step.
      if (!result.value.setupConfirmed) {
        const canonical = resolveCanonicalRoute(result.value)
        return redirectWithMessage(c, canonical, '')
      }

      // Consume any pending validation-state record from a rejected POST.
      let redisplay: RedisplayData | undefined
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

      return c.render(useLayout(c, renderEtudeNotesForm(result.value, redisplay)))
    },
  )

  app.post(
    PATHS.ETUDE_NOTES,
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

      // Parse the hidden workflowVersion field before anything else. A
      // missing, empty, non-numeric, or tampered value is a safe stale-form
      // rejection.
      const rawWorkflowVersion = form.get('workflowVersion')
      const versionParseResult = parseWorkflowVersionField(
        typeof rawWorkflowVersion === 'string' ? rawWorkflowVersion : null,
        'workflowVersion',
      )
      if (versionParseResult.isErr) {
        return redirectWithError(
          c,
          PATHS.ETUDE_NOTES,
          'Your pitch selection could not be saved because the form was stale. Please review the current values and try again.',
        )
      }

      // Load the aggregate to obtain the current epoch and derive the
      // available pitches.
      const loadResult = await loadEtudeParams(db, user.id)
      if (loadResult.isErr) {
        logError('etude notes post load failed', { error: sanitizeError(loadResult.error) })
        return handleUnexpectedError(c as unknown as Context<AppEnv>, loadResult.error)
      }
      if (loadResult.value === null) {
        return redirectWithMessage(c, PATHS.ETUDE, '')
      }
      if (!loadResult.value.setupConfirmed) {
        const canonical = resolveCanonicalRoute(loadResult.value)
        return redirectWithMessage(c, canonical, '')
      }

      const params = loadResult.value
      const octaves = parseStoredOctaves(params.selectedOctaves)
      const availablePitches = deriveAvailablePitches(params.keySignature, octaves).pitches

      // Read the action field: 'save' (ordinary) or 'select-all'.
      const rawAction = form.get('action')
      const action = typeof rawAction === 'string' ? rawAction : ''

      if (action === 'select-all') {
        // Select all: ignore submitted checkboxes, persist all available
        // pitches. Select all can never produce a cardinality error because
        // it selects every available pitch.
        const updateResult = await updateEtudePitches(
          db,
          user.id,
          params.aggregateEpoch,
          versionParseResult.value,
          availablePitches,
        )
        if (updateResult.isErr) {
          if (!updateResult.isOk) {
            if (updateResult.error.kind === 'db-error') {
              logError('etude notes select-all db error', {
                error: sanitizeError(updateResult.error.error),
              })
              return handleUnexpectedError(
                c as unknown as Context<AppEnv>,
                updateResult.error.error,
              )
            }
          }
          return redirectWithError(
            c,
            PATHS.ETUDE_NOTES,
            'Your pitch selection could not be saved because the form was stale. Please review the current values and try again.',
          )
        }
        return redirectWithMessage(c, PATHS.ETUDE_NOTES, 'All pitches selected.')
      }

      // Ordinary save: read the submitted pitches (an empty array when no
      // checkboxes are checked) and validate against the available set and
      // the cardinality rules.
      const submittedPitches = form.getAll('pitches').map((v) => (typeof v === 'string' ? v : String(v ?? '')))
      const validation = validatePitchSelection(submittedPitches, availablePitches, params.hand)
      if (validation.isErr) {
        const fieldErrors: FieldError[] = validation.error.map((f) => ({
          field: f.field,
          message: f.reason,
        }))
        const shaped = shapeRedisplayPayload(
          { pitches: submittedPitches },
          fieldErrors,
        )
        return redirectWithValidationState(c, PATHS.ETUDE_NOTES, db, user.id, shaped)
      }

      const updateResult = await updateEtudePitches(
        db,
        user.id,
        params.aggregateEpoch,
        versionParseResult.value,
        validation.value,
      )
      if (updateResult.isErr) {
        if (!updateResult.isOk) {
          if (updateResult.error.kind === 'db-error') {
            logError('etude notes save db error', {
              error: sanitizeError(updateResult.error.error),
            })
            return handleUnexpectedError(
              c as unknown as Context<AppEnv>,
              updateResult.error.error,
            )
          }
        }
        return redirectWithError(
          c,
          PATHS.ETUDE_NOTES,
          'Your pitch selection could not be saved because the form was stale. Please review the current values and try again.',
        )
      }

      return redirectWithMessage(c, PATHS.ETUDE_NOTES, 'Pitch selection saved.')
    },
  )
}
