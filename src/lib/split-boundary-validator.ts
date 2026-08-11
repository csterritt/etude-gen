/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Split-boundary validation and resolution for the two-hand split step
 * (Issue 16).
 *
 * `validateSplitBoundary` enforces that the submitted boundary id is one of
 * the eligible boundaries derived from the currently selected pitches (via
 * `deriveEligibleBoundaries` in `music-domain`). A boundary that is not
 * between two adjacent selected pitches, or that would leave a hand empty, is
 * rejected. It tolerates hostile shapes (a non-string, an empty string, a
 * tampered id) deterministically without throwing.
 *
 * `resolveSplitBoundaryState` implements the safe-redisplay semantics for the
 * stored boundary: a stored boundary that is no longer eligible is discarded
 * and no ineligible option is ever preselected (cross-cutting contract
 * section 2 and the Issue 16 redirect table).
 * @module lib/split-boundary-validator
 */
import Result from 'true-myth/result'

import type { EligibleBoundary } from './music-domain'

/**
 * The exact stable string for an empty or absent boundary submission.
 */
export const EMPTY_BOUNDARY_MESSAGE = 'Select a boundary between two adjacent pitches.'

/**
 * The exact stable string for a submitted boundary that is not among the
 * eligible boundaries (a stale boundary from a prior pitch selection, or a
 * tampered value).
 */
export const INELIGIBLE_BOUNDARY_MESSAGE =
  'That boundary is not between two adjacent selected pitches.'

/**
 * The exact stable string used when the eligible boundary list is empty
 * (fewer than two selected pitches). The student must return to the notes
 * step; the split step never renders an empty or single-option boundary list.
 */
const NO_ELIGIBLE_BOUNDARIES_MESSAGE =
  'Choose at least two pitches before selecting a boundary.'

/**
 * Typed validation failure for a submitted split boundary. All failures are
 * field-addressable to the `boundary` control so the route can wire them
 * uniformly.
 */
export interface SplitBoundaryFailure {
  field: 'boundary'
  reason: string
}

/**
 * Validate a submitted split boundary id against the eligible boundary list.
 *
 * Steps:
 * 1. When `eligibleBoundaries` is empty (fewer than two selected pitches),
 *    any submission is rejected with `NO_ELIGIBLE_BOUNDARIES_MESSAGE`. The
 *    split step never renders an empty boundary list, so this is a defensive
 *    path for a direct POST in a corrupt state.
 * 2. When `submitted` is not a string or is an empty/whitespace string,
 *    reject with `EMPTY_BOUNDARY_MESSAGE`.
 * 3. Trim the submitted value and find the eligible boundary whose `id`
 *    matches. On a match, return `Result.ok` with that boundary (carrying the
 *    left/right assignment). On no match, reject with
 *    `INELIGIBLE_BOUNDARY_MESSAGE`.
 *
 * The function is pure: it never throws or mutates its arguments.
 * @param submitted - Untrusted submitted value from the form parser
 * @param eligibleBoundaries - The eligible boundary list from `deriveEligibleBoundaries`
 * @returns Result<EligibleBoundary, SplitBoundaryFailure[]>
 */
export const validateSplitBoundary = (
  submitted: unknown,
  eligibleBoundaries: readonly EligibleBoundary[],
): Result<EligibleBoundary, SplitBoundaryFailure[]> => {
  if (eligibleBoundaries.length === 0) {
    return Result.err([{ field: 'boundary', reason: NO_ELIGIBLE_BOUNDARIES_MESSAGE }])
  }
  if (typeof submitted !== 'string') {
    return Result.err([{ field: 'boundary', reason: EMPTY_BOUNDARY_MESSAGE }])
  }
  const trimmed = submitted.trim()
  if (trimmed === '') {
    return Result.err([{ field: 'boundary', reason: EMPTY_BOUNDARY_MESSAGE }])
  }
  const match = eligibleBoundaries.find((b) => b.id === trimmed)
  if (match === undefined) {
    return Result.err([{ field: 'boundary', reason: INELIGIBLE_BOUNDARY_MESSAGE }])
  }
  return Result.ok(match)
}

/**
 * The resolved split-boundary state for form rendering: which boundary id is
 * preselected (if any) and whether this render is a first derivation.
 */
export interface SplitBoundaryState {
  selectedBoundaryId: string | null
  isFirstDerivation: boolean
}

/**
 * Resolve the split-boundary state for form rendering, implementing the
 * safe-redisplay semantics for the stored boundary.
 *
 * When `storedBoundary` is null or an empty/whitespace string, this is a
 * first derivation: no boundary is preselected (the student must choose) and
 * `isFirstDerivation` is true. Otherwise the stored value is trimmed and, if
 * it matches an eligible boundary's `id`, that boundary is preselected. If it
 * matches no eligible boundary (a stale boundary from a prior, wider pitch
 * selection, or after an upstream change), the stored value is discarded and
 * no ineligible option is ever preselected — `selectedBoundaryId` is null and
 * `isFirstDerivation` is false.
 *
 * The function is pure: it never throws or mutates its arguments.
 * @param storedBoundary - The stored `splitBoundary` string, or null
 * @param eligibleBoundaries - The eligible boundary list from `deriveEligibleBoundaries`
 * @returns The resolved split-boundary state
 */
export const resolveSplitBoundaryState = (
  storedBoundary: string | null,
  eligibleBoundaries: readonly EligibleBoundary[],
): SplitBoundaryState => {
  if (storedBoundary === null || storedBoundary.trim() === '') {
    return { selectedBoundaryId: null, isFirstDerivation: true }
  }
  const trimmed = storedBoundary.trim()
  const match = eligibleBoundaries.find((b) => b.id === trimmed)
  if (match === undefined) {
    return { selectedBoundaryId: null, isFirstDerivation: false }
  }
  return { selectedBoundaryId: match.id, isFirstDerivation: false }
}
