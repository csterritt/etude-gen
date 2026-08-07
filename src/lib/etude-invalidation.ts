/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Dependent-downstream invalidation for the etude parameter aggregate.
 *
 * Encodes the Issue 11 dependency map: which downstream state (pitch
 * selection, duration selection, split boundary, and the notes/split
 * confirmation flags) must be cleared when a given upstream setup field
 * changes. The plan is applied inside the single compare-and-set write that
 * also increments the workflow version (cross-cutting contract section 4) —
 * there is no second, separate transition.
 *
 * Review completion is derived, never persisted (cross-cutting contract
 * section 5): `isReviewReachable` recomputes from the confirmation flags and
 * the hand selection, and there is no stored review flag to clear.
 * @module lib/etude-invalidation
 */
import type { EtudeParams } from './etude-params-repository'
import type { ValidSetup } from './setup-validator'

/**
 * The set of downstream state to clear in the same committed transition as an
 * upstream setup change. Each boolean names a piece of dependent state; `true`
 * means it must be cleared (data set to null, flag set to false) in the CAS
 * write. `false` means it is retained.
 */
export interface InvalidationPlan {
  clearPitches: boolean
  clearDurations: boolean
  clearSplit: boolean
  unconfirmNotes: boolean
  unconfirmSplit: boolean
}

/**
 * The minimum number of pitches required when both hands are selected, so each
 * hand has at least one pitch to play (PRD user story 14).
 */
const TWO_HAND_MINIMUM_PITCHES = 2

/**
 * Count the selected pitches stored in a comma-separated string. Null or empty
 * means zero pitches.
 */
const countSelectedPitches = (selectedPitches: string | null): number => {
  if (selectedPitches === null || selectedPitches === '') {
    return 0
  }
  return selectedPitches.split(',').filter((p) => p.length > 0).length
}

/**
 * Compute the dependent-downstream invalidation plan for a setup change.
 *
 * Compares each upstream setup field (key, octaves, meter, measure count,
 * hands) of the submitted values against the stored aggregate and returns the
 * union of dependent state that must be cleared, per the Issue 11 dependency
 * map:
 *
 * - Key change → clear pitches and split; retain durations.
 * - Octave-range change → clear pitches and split; retain durations.
 * - Meter change → clear durations; retain pitches and split.
 * - Measure-count change → clear nothing downstream (the version still
 *   increments in the repository).
 * - Hands change → clear split; retain pitches but revalidate against the
 *   two-hand minimum. Switching to both hands with fewer than two stored
 *   pitches unconfirms the notes step; otherwise the notes step stays
 *   confirmed.
 *
 * Multiple changes in one submission clear the union of their dependents. The
 * function is pure: it does not mutate its arguments, touch the DB, or throw.
 * @param stored - The current committed aggregate snapshot
 * @param submitted - The validated setup values being submitted
 * @returns The invalidation plan to apply in the CAS write
 */
export const computeDownstreamInvalidation = (
  stored: EtudeParams,
  submitted: ValidSetup,
): InvalidationPlan => {
  const keyChanged = stored.keySignature !== submitted.keySignature
  const octavesChanged = stored.selectedOctaves !== submitted.octaves.join(',')
  const meterChanged = stored.timeSignature !== submitted.timeSignature
  const handChanged = stored.hand !== submitted.hand

  const clearPitches = keyChanged || octavesChanged
  const clearDurations = meterChanged
  const clearSplit = keyChanged || octavesChanged || handChanged

  const handsRevalidationFailed =
    handChanged &&
    submitted.hand === 'both' &&
    countSelectedPitches(stored.selectedPitches) < TWO_HAND_MINIMUM_PITCHES

  const unconfirmNotes = clearPitches || clearDurations || handsRevalidationFailed
  const unconfirmSplit = clearSplit

  return {
    clearPitches,
    clearDurations,
    clearSplit,
    unconfirmNotes,
    unconfirmSplit,
  }
}

/**
 * Derive whether the review step is reachable from the current aggregate
 * state, without consulting any stored review flag (none exists).
 *
 * Review is reachable exactly when setup is confirmed, the notes step is
 * confirmed, and — when both hands are selected — the split step is also
 * confirmed. For one-hand mode the split step is never required
 * (cross-cutting contract section 5). The function is pure: it reads only the
 * confirmation flags and `hand`, and does not touch the DB or mutate its
 * argument.
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
