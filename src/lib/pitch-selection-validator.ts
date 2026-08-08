/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Pitch-selection validation and resolution for the notes step (Issue 13).
 *
 * `validatePitchSelection` enforces the cardinality rules — at least one pitch
 * for one-hand mode and at least two for two-hand mode (with the exact
 * field-level message "Select at least two pitches when using both hands.") —
 * and rejects any submitted pitch that is not in the derived available set.
 * It tolerates hostile shapes (a non-array, duplicates, reordered values, an
 * empty array) deterministically without throwing.
 *
 * `resolvePitchSelectionState` implements the first-derivation semantics: when
 * no pitch selection is stored for the current available set, all available
 * pitches are preselected; once a selection is stored, later renders show
 * exactly the stored selection (including a narrowed one) and never re-expand
 * it. After an Issue 11 clear (which sets `selectedPitches` to null), the next
 * render is again a first derivation.
 * @module lib/pitch-selection-validator
 */
import Result from 'true-myth/result'

/**
 * The exact field-level message for the two-hand cardinality failure, per the
 * issue's acceptance criteria. The message is defined once so the validator
 * and any tests share a single source of truth.
 */
export const TWO_HAND_MINIMUM_MESSAGE = 'Select at least two pitches when using both hands.'

/**
 * The one-hand cardinality minimum message.
 */
export const ONE_HAND_MINIMUM_MESSAGE = 'Select at least one pitch.'

/**
 * The unavailable-pitch message prefix. Each unavailable pitch is named in the
 * failure reason so the student can see which submitted value was rejected,
 * without revealing any internal detail.
 */
const unavailableReason = (pitch: string): string =>
  `The pitch ${pitch} is not available for the selected key and octave range.`

/**
 * Typed validation failure for a pitch selection. All failures are
 * field-addressable to the `pitches` control so the route can wire them to the
 * pitch group uniformly.
 */
export interface PitchSelectionFailure {
  field: 'pitches'
  reason: string
}

/**
 * The resolved pitch-selection state for form rendering: which pitches are
 * checked and whether this render is a first derivation (all available
 * preselected because no selection is stored).
 */
export interface PitchSelectionState {
  selectedPitches: string[]
  isFirstDerivation: boolean
}

/**
 * Normalize an unknown submitted value to a trimmed `string[]`. A non-array
 * (null, undefined, a string, a number, an object) yields an empty array
 * (zero pitches), so the cardinality rules reject it deterministically rather
 * than throwing. Non-string array elements are stringified then trimmed.
 * @param submitted - Untrusted submitted value from the form parser
 * @returns A trimmed string array (possibly empty)
 */
const normalizeSubmitted = (submitted: unknown): string[] => {
  if (!Array.isArray(submitted)) {
    return []
  }
  return submitted
    .map((v) => (typeof v === 'string' ? v : String(v ?? '')))
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

/**
 * Validate a submitted pitch selection against the derived available set and
 * the cardinality rules for the selected hand mode.
 *
 * Steps:
 * 1. Normalize the submitted value to a trimmed `string[]` (a non-array
 *    yields an empty array).
 * 2. Filter the submitted pitches to only those in the available set. Any
 *    submitted pitch not in the available set is a field-addressable failure
 *    naming the unavailable pitch.
 * 3. Deduplicate the available pitches and order them by their position in
 *    the available set (not submission order).
 * 4. Enforce the cardinality minimum on the available pitches: when
 *    `hand === 'both'` and fewer than two pitches remain, emit a failure with
 *    the exact message {@link TWO_HAND_MINIMUM_MESSAGE}; when `hand` is
 *    `'left'` or `'right'` and zero pitches remain, emit a failure with
 *    {@link ONE_HAND_MINIMUM_MESSAGE}.
 * 5. On success, return `Result.ok` with the available pitches in
 *    available-set order. Never throws, never mutates arguments.
 * @param submitted - Untrusted submitted value (typically `string[]` from the form parser)
 * @param available - The derived available pitch set for the current key and octave range
 * @param hand - The selected hand mode ('left', 'right', or 'both')
 * @returns Result<string[], PitchSelectionFailure[]>
 */
export const validatePitchSelection = (
  submitted: unknown,
  available: string[],
  hand: string,
): Result<string[], PitchSelectionFailure[]> => {
  const failures: PitchSelectionFailure[] = []
  const normalized = normalizeSubmitted(submitted)

  // Filter to available pitches and collect unavailable-pitch failures.
  const availableSet = new Set(available)
  const kept: string[] = []
  const seen = new Set<string>()
  for (const pitch of normalized) {
    if (!availableSet.has(pitch)) {
      failures.push({ field: 'pitches', reason: unavailableReason(pitch) })
      continue
    }
    if (seen.has(pitch)) {
      // Deduplicate: skip a duplicate available pitch.
      continue
    }
    seen.add(pitch)
    kept.push(pitch)
  }

  // Order the kept pitches by their position in the available set.
  const orderedKept = available.filter((p) => seen.has(p))

  // Enforce the cardinality minimum on the available (kept) pitches.
  if (hand === 'both') {
    if (orderedKept.length < 2) {
      failures.push({ field: 'pitches', reason: TWO_HAND_MINIMUM_MESSAGE })
    }
  } else {
    // One-hand mode ('left' or 'right', or any other value treated as
    // one-hand): at least one pitch is required.
    if (orderedKept.length < 1) {
      failures.push({ field: 'pitches', reason: ONE_HAND_MINIMUM_MESSAGE })
    }
  }

  if (failures.length > 0) {
    return Result.err(failures)
  }
  return Result.ok(orderedKept)
}

/**
 * Resolve the pitch-selection state for form rendering, implementing the
 * first-derivation semantics.
 *
 * When `storedPitches` is null or an empty/whitespace string, this is a first
 * derivation: all available pitches are preselected and `isFirstDerivation` is
 * true. Otherwise the stored selection is parsed, filtered to only pitches in
 * the available set (so a stored pitch that is no longer available after an
 * upstream change is dropped), and returned in available-set order. A stored
 * narrowed selection is never re-expanded.
 * @param storedPitches - The stored `selectedPitches` string (comma-separated), or null
 * @param available - The derived available pitch set for the current key and octave range
 * @returns The resolved pitch-selection state
 */
export const resolvePitchSelectionState = (
  storedPitches: string | null,
  available: string[],
): PitchSelectionState => {
  if (storedPitches === null || storedPitches.trim() === '') {
    return { selectedPitches: [...available], isFirstDerivation: true }
  }
  const availableSet = new Set(available)
  const parts = storedPitches
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
  const seen = new Set<string>()
  for (const pitch of parts) {
    if (availableSet.has(pitch)) {
      seen.add(pitch)
    }
  }
  // Order the kept pitches by their position in the available set.
  const orderedKept = available.filter((p) => seen.has(p))
  return { selectedPitches: orderedKept, isFirstDerivation: false }
}
