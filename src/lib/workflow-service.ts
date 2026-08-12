/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Workflow service: canonical state-to-route resolution with stored-value
 * validation (Issue 18).
 *
 * `computeCanonicalRoute` is the single entry point routes call to determine
 * the canonical route for the current workflow state. It delegates to
 * `resolveCanonicalRoute` for the flag-based rows of cross-cutting contract
 * section 5 (no aggregate, setup unconfirmed, notes unconfirmed, split
 * unconfirmed, one-hand skip, all confirmed) and layers stored-value
 * validation on top: when the flag-based resolver has moved past a step, the
 * stored values for that step are validated against the current constraints
 * (available pitches for the stored key and octaves, offerable durations for
 * the stored meter, eligible boundaries for the stored selected pitches). If
 * any stored value no longer validates, the workflow service routes to the
 * earliest step whose stored values are now invalid, treated as unconfirmed.
 *
 * The score-related rows of section 5 (current Piece, render failure, stale
 * Piece) are deferred to Issues 20, 30, 31, and 32, which build the Piece and
 * render infrastructure. This module will be extended by those issues.
 *
 * The function is pure: it reads only the aggregate snapshot and the packaged
 * rhythm catalog constant, never mutates its argument, never throws on invalid
 * stored values (it routes instead), and never touches the DB.
 * @module lib/workflow-service
 */
import { PATHS } from '../constants'
import type { EtudeParams } from './etude-params-repository'
import { resolveCanonicalRoute } from './canonical-route'
import {
  deriveAvailablePitches,
  parseStoredOctaves,
  parseStoredPitches,
  deriveEligibleBoundaries,
} from './music-domain'
import {
  computeOfferableDurations,
  loadRhythmCatalog,
} from './duration-selection-validator'
import { RHYTHM_CATALOG_TEXT } from './rhythm-catalog-data'

/**
 * The safe explanatory message displayed when a student is redirected from a
 * directly requested step to the earliest incomplete step. The message exposes
 * no internal state or identifiers: no ids, no version numbers, no epoch
 * values, no pitch names, no boundary ids (cross-cutting contract section 1
 * rule 6 and Issue 18 acceptance criterion on safe messages).
 */
export const PREREQUISITE_REDIRECT_MESSAGE =
  'That step isn\u2019t available yet. You\u2019ve been taken to where you left off.'

/**
 * Parse the stored selected-durations string into an array of duration tokens.
 * Null or empty yields an empty array. Whitespace around individual tokens is
 * trimmed and empty segments are dropped.
 */
const parseStoredDurations = (stored: string | null): string[] => {
  if (stored === null || stored.trim() === '') {
    return []
  }
  return stored
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

/**
 * Return `true` when every stored pitch is in the available set derived from
 * the stored key and octaves. An empty stored set is considered valid (the
 * flag-based resolver handles the "no stored pitches" corrupt-state row
 * separately). The function is pure and never throws.
 */
const storedPitchesValidate = (params: EtudeParams): boolean => {
  const stored = parseStoredPitches(params.selectedPitches)
  if (stored.length === 0) {
    return true
  }
  const octaves = parseStoredOctaves(params.selectedOctaves)
  const available = deriveAvailablePitches(params.keySignature, octaves).pitches
  const availableSet = new Set(available)
  for (const pitch of stored) {
    if (!availableSet.has(pitch)) {
      return false
    }
  }
  return true
}

/**
 * Return `true` when every stored duration token is offerable for the stored
 * meter. An empty stored set is considered valid (the flag-based resolver
 * handles the "no stored durations" case separately). The function is pure and
 * never throws.
 */
const storedDurationsValidate = (params: EtudeParams): boolean => {
  const stored = parseStoredDurations(params.selectedDurations)
  if (stored.length === 0) {
    return true
  }
  const catalog = loadRhythmCatalog(RHYTHM_CATALOG_TEXT)
  const offerable = computeOfferableDurations(catalog, params.timeSignature)
  const offerableSet = new Set(offerable)
  for (const token of stored) {
    if (!offerableSet.has(token)) {
      return false
    }
  }
  return true
}

/**
 * Return `true` when the stored split boundary id is among the eligible
 * boundaries derived from the stored selected pitches (filtered to the
 * available set). An empty or null stored boundary is considered valid (the
 * flag-based resolver handles the "split unconfirmed" case separately). The
 * function is pure and never throws.
 */
const storedBoundaryValidates = (params: EtudeParams): boolean => {
  if (params.splitBoundary === null || params.splitBoundary.trim() === '') {
    return true
  }
  const octaves = parseStoredOctaves(params.selectedOctaves)
  const availablePitches = deriveAvailablePitches(params.keySignature, octaves).pitches
  const availableSet = new Set(availablePitches)
  const storedPitches = parseStoredPitches(params.selectedPitches).filter((p) =>
    availableSet.has(p),
  )
  const eligible = deriveEligibleBoundaries(storedPitches)
  const eligibleIds = new Set(eligible.map((b) => b.id))
  return eligibleIds.has(params.splitBoundary)
}

/**
 * Resolve the canonical route for the current aggregate state, validating
 * stored values against current constraints.
 *
 * Delegates to `resolveCanonicalRoute` for the flag-based rows, then layers
 * stored-value validation on top. The value validation only applies when the
 * flag-based resolver has moved past a step, because only then are the stored
 * values for that step relied upon:
 *
 * - When the notes step is confirmed, the stored pitches and durations are
 *   validated. If either no longer validates, the canonical route is
 *   `/etude/notes` (the earliest step whose stored values are now invalid).
 * - When the split step is confirmed and both hands are selected, the stored
 *   boundary is validated. If it no longer validates, the canonical route is
 *   `/etude/split`.
 *
 * When all stored values validate, the flag-based result is returned. The
 * function is pure: it reads only `params` and the packaged rhythm catalog
 * constant, never mutates its argument, never throws on invalid stored values
 * (it routes instead), and never touches the DB.
 * @param params - The owner's aggregate snapshot, or null when none exists
 * @returns The canonical route path
 */
export const computeCanonicalRoute = (params: EtudeParams | null): string => {
  if (params === null) {
    return resolveCanonicalRoute(null)
  }

  const flagBased = resolveCanonicalRoute(params)

  // The value validation only applies when the flag-based resolver has
  // moved past a step. When the notes step is unconfirmed, the canonical
  // route is already /etude/notes (or earlier), so there is nothing to
  // validate — the student will re-enter the notes step and re-confirm.
  if (params.notesConfirmed) {
    if (!storedPitchesValidate(params) || !storedDurationsValidate(params)) {
      return PATHS.ETUDE_NOTES
    }
  }

  // The split step is only validated when both hands are selected and the
  // split step is confirmed. One-hand mode skips the split step entirely,
  // so a stale boundary is irrelevant. When the split step is unconfirmed,
  // the canonical route is already /etude/split (or earlier).
  if (params.hand === 'both' && params.splitConfirmed) {
    if (!storedBoundaryValidates(params)) {
      return PATHS.ETUDE_SPLIT
    }
  }

  return flagBased
}

/**
 * Step ordering for reachability comparison. A step is reachable when the
 * canonical route is at or after it in this ordering. The split step is
 * special-cased separately for one-hand workflows (it is skipped).
 */
const STEP_ORDER: Record<string, number> = {
  [PATHS.ETUDE_SETUP]: 0,
  [PATHS.ETUDE_NOTES]: 1,
  [PATHS.ETUDE_SPLIT]: 2,
  [PATHS.ETUDE_REVIEW]: 3,
}

/**
 * Return `true` when a step's prerequisites are met — i.e., the student is
 * allowed to visit this step directly. A step is reachable when the canonical
 * route is at or after it in the step ordering (meaning all prior steps are
 * confirmed with valid stored values). The split step is never reachable for
 * one-hand workflows (it is skipped). The setup step is always reachable when
 * an aggregate exists.
 *
 * This lets a student revisit a completed step to edit it (e.g., following a
 * Back link from the review step to the split step) without being redirected
 * forward — the step's prerequisites are still met even though the canonical
 * route has moved past it. The entry route (`GET /etude`) uses
 * `computeCanonicalRoute` directly rather than this predicate.
 *
 * The function is pure: it reads only `params` and the packaged rhythm catalog
 * constant, never mutates its argument, never throws, and never touches the DB.
 * @param params - The owner's aggregate snapshot, or null when none exists
 * @param stepPath - The step path to check for reachability
 * @returns `true` when the step's prerequisites are met
 */
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
