/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Route builder for the etude split step (Issue 16).
 *
 * `GET /etude/split` renders the split-boundary form for a two-hand workflow:
 * one radio per eligible boundary (derived from the currently selected
 * pitches), pre-selected per the safe-redisplay semantics (a stored boundary
 * that is no longer eligible is discarded; no ineligible option is ever
 * preselected). The form carries a hidden `workflowVersion` field for
 * compare-and-set, accessible labels, an error summary, and a Save button.
 *
 * `POST /etude/split` validates the submitted boundary id against the eligible
 * boundaries, persists it via `updateEtudeSplit` (CAS), and redirects 303 to
 * `/etude/review`. A one-hand workflow never reaches the split form: a direct
 * GET or POST redirects to the canonical route (review), and any previously
 * stored boundary is cleared. A corrupt-state two-hand aggregate (fewer than
 * two stored pitches) is returned to the notes step, which is treated as
 * unconfirmed so the student re-selects pitches.
 *
 * Both routes inherit cross-cutting contract section 1: auth + no-cache via
 * the `signedInAccess` middleware, owner-scoped via `c.get('user')`.
 * @module routes/buildEtudeSplit
 */
import type { Context } from 'hono'
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { raw } from 'hono/utils/html'

import { PATHS, STANDARD_SECURE_HEADERS, ALLOW_SCRIPTS_SECURE_HEADERS } from '../constants'
import { type AppEnv, type AuthUser, type DrizzleClient } from '../local-types'
import { useLayout } from './build-layout'
import { signedInAccess } from '../middleware/signed-in-access'
import {
  loadEtudeParams,
  updateEtudeSplit,
  clearEtudeSplit,
} from '../lib/etude-params-repository'
import { resolveCanonicalRoute } from '../lib/canonical-route'
import { handleUnexpectedError } from './build-safe-error'
import { logError, sanitizeError } from '../lib/logger'
import { deriveAvailablePitches, parseStoredOctaves, deriveEligibleBoundaries, type EligibleBoundary } from '../lib/music-domain'
import { parseWorkflowVersionField } from '../lib/workflow-version-field'
import { redirectWithError, redirectWithMessage } from '../lib/redirects'
import { shapeRedisplayPayload, type FieldError } from '../lib/safe-redisplay'
import { redirectWithValidationState, consumeValidationStateFromRequest } from '../lib/validation-state-helpers'
import { ErrorSummary, buildErrorSummaryEntries, type ErrorSummaryEntry } from '../components/error-summary'
import { EtudeSummary } from '../components/etude-summary'
import { buildErrorSummaryFocusScript } from '../lib/error-summary-focus'
import {
  validateSplitBoundary,
  resolveSplitBoundaryState,
} from '../lib/split-boundary-validator'

/**
 * Field order for the split form, used by `buildErrorSummaryEntries` to order
 * summary entries by the fields' visual appearance.
 */
const SPLIT_FIELD_ORDER = ['boundary'] as const

/**
 * Optional redisplay data passed from the GET handler when a validation-state
 * record was consumed. Mirrors the notes route's `RedisplayData`.
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
 * Minimal interface for the aggregate fields the split form reads. Avoids
 * importing the full `EtudeParams` type (which carries DB-specific fields the
 * form does not touch). Includes the fields the read-only summary needs
 * (measureCount, timeSignature, hand, selectedDurations) so the summary can
 * be rendered from the same params.
 */
interface EtudeParamsLike {
  measureCount: number
  timeSignature: string
  keySignature: string
  selectedOctaves: string
  selectedPitches: string | null
  selectedDurations: string | null
  splitBoundary: string | null
  hand: string
  workflowVersion: number
}

/**
 * Parse the stored selected-pitches string into an ordered array of pitch
 * names. Null or empty yields an empty array.
 */
const parseStoredPitches = (stored: string | null): string[] => {
  if (stored === null || stored.trim() === '') {
    return []
  }
  return stored
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

/**
 * Render the JSX for the split-step form. Eligible boundaries are derived from
 * the currently selected pitches (the intersection of the stored selection
 * and the available set). The pre-selected boundary comes from
 * `resolveSplitBoundaryState` (first-derivation no preselection, or the stored
 * boundary if still eligible, never an ineligible one). When `redisplay` is
 * present, the submitted boundary id overrides the pre-selection for redisplay
 * alongside the errors.
 */
const renderEtudeSplitForm = (
  params: EtudeParamsLike,
  eligibleBoundaries: readonly EligibleBoundary[],
  redisplay?: RedisplayData,
) => {
  const safeValues = redisplay?.safeValues ?? {}
  const fieldErrors = redisplay?.fieldErrors ?? []
  const firstBoundaryId =
    eligibleBoundaries.length > 0
      ? `boundary-field-${eligibleBoundaries[0]!.id}`
      : 'boundary-field-none'
  const groupFields: Record<string, { firstMemberId: string }> = {}
  if (eligibleBoundaries.length > 0) {
    groupFields.boundary = { firstMemberId: firstBoundaryId }
  }

  // Build the error-summary entries with the group-field config so group-level
  // errors link to the first member of the group.
  const entries = buildErrorSummaryEntries(
    fieldErrors,
    [...SPLIT_FIELD_ORDER],
    groupFields,
  )

  // Resolve the pre-selected boundary: first-derivation (none), or the stored
  // boundary if still eligible.
  const resolved = resolveSplitBoundaryState(params.splitBoundary, eligibleBoundaries)
  // When redisplay data is present, the submitted boundary overrides the
  // pre-selection.
  const redisplayBoundary =
    typeof safeValues.boundary === 'string' ? safeValues.boundary : null
  const selectedBoundaryId = redisplayBoundary ?? resolved.selectedBoundaryId

  return (
    <div data-testid='etude-split-banner' className='flex justify-center'>
      <div className='card w-full max-w-md bg-base-100 shadow-xl'>
        <div className='card-body'>
          <h2 className='card-title text-2xl font-bold mb-4'>Split hands</h2>
          <EtudeSummary params={params} step='split' />
          <p className='text-gray-600 mb-6'>
            Choose where the left hand ends and the right hand begins. Lower
            pitches go to the left hand; higher pitches go to the right.
          </p>
          {entries.length > 0 && <ErrorSummary entries={entries} />}
          {entries.length > 0 && raw(buildErrorSummaryFocusScript('error-summary'))}
          <form method='post' action={PATHS.ETUDE_SPLIT} data-testid='etude-split-form'>
            <input
              type='hidden'
              name='workflowVersion'
              value={String(params.workflowVersion)}
              data-testid='workflow-version-field'
            />
            <fieldset
              className='flex flex-col mb-6'
              aria-describedby={describedByFor(entries, 'boundary', 'boundary-instructions')}
            >
              <legend className='label-text mb-2'>Boundary</legend>
              <p id='boundary-instructions' className='text-xs text-gray-500 mt-1'>
                Select a boundary between two adjacent pitches.
              </p>
              <div className='flex flex-col gap-1 mt-2'>
                {eligibleBoundaries.map((boundary) => {
                  const checked = selectedBoundaryId === boundary.id
                  return (
                    <label
                      key={boundary.id}
                      className='label cursor-pointer justify-start gap-2'
                    >
                      <input
                        type='radio'
                        name='boundary'
                        value={boundary.id}
                        checked={checked}
                        data-testid={`boundary-field-${boundary.id}`}
                        id={`boundary-field-${boundary.id}`}
                        className='radio radio-sm'
                      />
                      <span className='label-text'>
                        {boundary.left.join(', ')} | {boundary.right.join(', ')}
                      </span>
                    </label>
                  )
                })}
              </div>
              {renderFieldErrors(entries, 'boundary')}
            </fieldset>
            <div className='card-actions justify-end gap-2'>
              <a
                href={PATHS.ETUDE_NOTES}
                className='btn btn-ghost'
                data-testid='split-back-action'
              >
                Back
              </a>
              <button
                type='submit'
                name='action'
                value='save'
                className='btn btn-primary'
                data-testid='split-save-action'
              >
                Save split
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

/**
 * Attach the etude split routes to the app.
 * @param app - Hono app instance
 */
export const buildEtudeSplit = (app: Hono<{ Bindings: any }>): void => {
  app.get(
    PATHS.ETUDE_SPLIT,
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
        logError('etude split load failed', { error: sanitizeError(result.error) })
        return handleUnexpectedError(c as unknown as Context<AppEnv>, result.error)
      }

      // No aggregate: redirect to /etude so it is created first.
      if (result.value === null) {
        return redirectWithMessage(c, PATHS.ETUDE, '')
      }

      const params = result.value

      // Setup not confirmed: redirect to the canonical route.
      if (!params.setupConfirmed) {
        const canonical = resolveCanonicalRoute(params)
        return redirectWithMessage(c, canonical, '')
      }

      // Notes not confirmed: redirect to the canonical route (notes).
      if (!params.notesConfirmed) {
        const canonical = resolveCanonicalRoute(params)
        return redirectWithMessage(c, canonical, '')
      }

      // One-hand workflow: the split step is skipped. Redirect to the
      // canonical route (review) and clear any previously stored boundary so
      // a stale boundary from a prior two-hand selection never persists.
      if (params.hand !== 'both') {
        const canonical = resolveCanonicalRoute(params)
        // Clear any stale split state. This is a corrective clear, not a
        // student submission: it does not increment the version and does not
        // unconfirm the notes step.
        const clearResult = await clearEtudeSplit(db, user.id, params.aggregateEpoch, false)
        if (clearResult.isErr) {
          if (!clearResult.isOk) {
            if (clearResult.error.kind === 'db-error') {
              logError('etude split one-hand clear db error', {
                error: sanitizeError(clearResult.error.error),
              })
              // Fall through to the redirect even on a db-error: the student
              // still sees the canonical route. The stale boundary (if any)
              // will be cleared on a future visit.
            }
          }
        }
        return redirectWithMessage(c, canonical, '')
      }

      // Two-hand workflow: derive the selected pitches and check for the
      // corrupt-state recovery (fewer than two stored pitches).
      const octaves = parseStoredOctaves(params.selectedOctaves)
      const availablePitches = deriveAvailablePitches(params.keySignature, octaves).pitches
      const availableSet = new Set(availablePitches)
      const storedPitches = parseStoredPitches(params.selectedPitches).filter((p) =>
        availableSet.has(p),
      )

      if (storedPitches.length < 2) {
        // Corrupt-state recovery: a two-hand aggregate holding fewer than two
        // stored pitches is returned to the notes step. Clear the split state
        // and unconfirm the notes step so the student re-selects pitches.
        const clearResult = await clearEtudeSplit(db, user.id, params.aggregateEpoch, true)
        if (clearResult.isErr) {
          if (!clearResult.isOk) {
            if (clearResult.error.kind === 'db-error') {
              logError('etude split corrupt-state clear db error', {
                error: sanitizeError(clearResult.error.error),
              })
            }
          }
        }
        return redirectWithMessage(c, PATHS.ETUDE_NOTES, '')
      }

      // Derive the eligible boundaries from the selected pitches.
      const eligibleBoundaries = deriveEligibleBoundaries(storedPitches)

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

      return c.render(
        useLayout(
          c,
          renderEtudeSplitForm(
            params,
            eligibleBoundaries,
            redisplay,
          ),
        ),
      )
    },
  )

  app.post(
    PATHS.ETUDE_SPLIT,
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

      // Load the aggregate to obtain the current epoch and derive the
      // eligible boundaries.
      const loadResult = await loadEtudeParams(db, user.id)
      if (loadResult.isErr) {
        logError('etude split post load failed', { error: sanitizeError(loadResult.error) })
        return handleUnexpectedError(c as unknown as Context<AppEnv>, loadResult.error)
      }
      if (loadResult.value === null) {
        return redirectWithMessage(c, PATHS.ETUDE, '')
      }

      const params = loadResult.value

      // Setup or notes not confirmed: redirect to the canonical route.
      if (!params.setupConfirmed || !params.notesConfirmed) {
        const canonical = resolveCanonicalRoute(params)
        return redirectWithMessage(c, canonical, '')
      }

      // One-hand workflow: the split step is skipped. Redirect to the
      // canonical route (review) and clear any previously stored boundary.
      if (params.hand !== 'both') {
        const canonical = resolveCanonicalRoute(params)
        const clearResult = await clearEtudeSplit(db, user.id, params.aggregateEpoch, false)
        if (clearResult.isErr) {
          if (!clearResult.isOk) {
            if (clearResult.error.kind === 'db-error') {
              logError('etude split one-hand clear db error', {
                error: sanitizeError(clearResult.error.error),
              })
            }
          }
        }
        return redirectWithMessage(c, canonical, '')
      }

      // Two-hand workflow: derive the selected pitches and check for the
      // corrupt-state recovery (fewer than two stored pitches).
      const octaves = parseStoredOctaves(params.selectedOctaves)
      const availablePitches = deriveAvailablePitches(params.keySignature, octaves).pitches
      const availableSet = new Set(availablePitches)
      const storedPitches = parseStoredPitches(params.selectedPitches).filter((p) =>
        availableSet.has(p),
      )

      if (storedPitches.length < 2) {
        // Corrupt-state recovery: return to the notes step.
        const clearResult = await clearEtudeSplit(db, user.id, params.aggregateEpoch, true)
        if (clearResult.isErr) {
          if (!clearResult.isOk) {
            if (clearResult.error.kind === 'db-error') {
              logError('etude split corrupt-state clear db error', {
                error: sanitizeError(clearResult.error.error),
              })
            }
          }
        }
        return redirectWithMessage(c, PATHS.ETUDE_NOTES, '')
      }

      // Derive the eligible boundaries from the selected pitches.
      const eligibleBoundaries = deriveEligibleBoundaries(storedPitches)

      // Parse the hidden workflowVersion field. A missing, empty, non-numeric,
      // or tampered value is a safe stale-form rejection.
      const rawWorkflowVersion = form.get('workflowVersion')
      const versionParseResult = parseWorkflowVersionField(
        typeof rawWorkflowVersion === 'string' ? rawWorkflowVersion : null,
        'workflowVersion',
      )
      if (versionParseResult.isErr) {
        return redirectWithError(
          c,
          PATHS.ETUDE_SPLIT,
          'Your split selection could not be saved because the form was stale. Please review the current values and try again.',
        )
      }

      // Read and validate the submitted boundary id.
      const rawBoundary = form.get('boundary')
      const submittedBoundary = typeof rawBoundary === 'string' ? rawBoundary : rawBoundary
      const boundaryValidation = validateSplitBoundary(submittedBoundary, eligibleBoundaries)
      if (boundaryValidation.isErr) {
        const fieldErrors: FieldError[] = []
        for (const f of boundaryValidation.error) {
          fieldErrors.push({ field: f.field, message: f.reason })
        }
        const shaped = shapeRedisplayPayload(
          { boundary: typeof submittedBoundary === 'string' ? submittedBoundary : '' },
          fieldErrors,
        )
        return redirectWithValidationState(c, PATHS.ETUDE_SPLIT, db, user.id, shaped)
      }

      // Compare-and-set save of the split boundary.
      const updateResult = await updateEtudeSplit(
        db,
        user.id,
        params.aggregateEpoch,
        versionParseResult.value,
        boundaryValidation.value.id,
      )
      if (updateResult.isErr) {
        if (!updateResult.isOk) {
          if (updateResult.error.kind === 'db-error') {
            logError('etude split save db error', {
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
          PATHS.ETUDE_SPLIT,
          'Your split selection could not be saved because the form was stale. Please review the current values and try again.',
        )
      }

      return redirectWithMessage(c, PATHS.ETUDE_REVIEW, 'Split selection saved.')
    },
  )
}
