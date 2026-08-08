/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Duration-selection validation and resolution for the notes step (Issue 14).
 *
 * `computeOfferableDurations` derives the set of duration tokens that can fit
 * a meter: a duration is offerable for a meter when at least one catalog
 * pattern for that meter contains it. `validateDurationSelection` rejects an
 * unknown token, a supported token not offerable for the current meter, an
 * empty selection, and a set with no eligible complete-measure pattern (with
 * a stable corrective message naming the smallest additional set that would
 * restore eligibility). Duplicates are de-duplicated and the stored set is
 * normalized to a canonical order regardless of submission order.
 *
 * `computeCorrectiveSuggestion` searches the smallest addition set of offered
 * durations that makes at least one pattern eligible again. The corrective
 * message exposes only display labels (never catalog patterns or internal
 * token letters).
 *
 * `resolveDurationSelectionState` implements the first-derivation semantics:
 * when no duration selection is stored, all individually compatible durations
 * are preselected; a stored narrowed selection is never re-expanded. After an
 * Issue 11 clear (which sets `selectedDurations` to null), the next render is
 * again a first derivation.
 * @module lib/duration-selection-validator
 */
import Result from 'true-myth/result'

import {
  parseRhythmCatalog,
  computeEligibleRhythms,
  SUPPORTED_TOKENS,
} from './rhythm-catalog'
import type { RhythmCatalog } from './rhythm-catalog'

/**
 * Human-readable display label per duration token, used for the control text
 * and for the corrective message. The corrective message exposes display
 * labels only, never token letters.
 */
export const DURATION_LABELS: Readonly<Record<string, string>> = {
  W: 'whole',
  H: 'half',
  D: 'dotted half',
  Q: 'quarter',
  R: 'dotted quarter',
  E: 'eighth',
}

/**
 * Fixed canonical token ordering (descending duration): whole, half, dotted
 * half, quarter, dotted quarter, eighth. Used both to order the offerable
 * list and to normalize the stored set to canonical order regardless of
 * submission order.
 */
export const CANONICAL_DURATION_ORDER: readonly string[] = ['W', 'H', 'D', 'Q', 'R', 'E']

/**
 * The exact stable message for an empty duration selection.
 */
export const EMPTY_DURATION_MESSAGE = 'Select at least one duration.'

/**
 * Typed validation failure for a duration selection. All failures are
 * field-addressable to the `durations` control so the route can wire them to
 * the duration group uniformly.
 */
export interface DurationSelectionFailure {
  field: 'durations'
  reason: string
}

/**
 * The resolved duration-selection state for form rendering: which durations
 * are checked and whether this render is a first derivation (all compatible
 * durations preselected because no selection is stored).
 */
export interface DurationSelectionState {
  selectedDurations: string[]
  isFirstDerivation: boolean
}

/**
 * Normalize an unknown submitted value to a trimmed `string[]`. A non-array
 * (null, undefined, a string, a number, an object) yields an empty array, so
 * the empty-selection rule rejects it deterministically rather than throwing.
 * Non-string array elements are stringified then trimmed.
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
 * Collect every distinct duration token that appears in at least one pattern
 * of the given meter, filtered to the canonical order. Returns `[]` for an
 * unsupported meter (no 500, no throw). The result contains no duplicates and
 * only supported tokens.
 * @param catalog - The parsed, validated rhythm catalog
 * @param meter - The meter heading (e.g. `2/4`)
 * @returns The offerable duration tokens in canonical order, or `[]`
 */
export const computeOfferableDurations = (
  catalog: RhythmCatalog,
  meter: string,
): string[] => {
  const patterns = catalog.meters[meter]
  if (!patterns) {
    return []
  }
  const present = new Set<string>()
  for (const pattern of patterns) {
    for (const token of pattern) {
      present.add(token)
    }
  }
  return CANONICAL_DURATION_ORDER.filter((token) => present.has(token))
}

/**
 * Generate all k-length combinations of a list, in lexicographic order of the
 * input sequence (which is canonical-ordered by the caller). Deterministic.
 * @param arr - The ordered candidate list
 * @param k - Combination size
 * @returns All k-length combinations in input order
 */
const combinations = <T>(arr: readonly T[], k: number): T[][] => {
  const result: T[][] = []
  const walk = (start: number, acc: T[]): void => {
    if (acc.length === k) {
      result.push([...acc])
      return
    }
    for (let i = start; i < arr.length; i += 1) {
      acc.push(arr[i]!)
      walk(i + 1, acc)
      acc.pop()
    }
  }
  walk(0, [])
  return result
}

/**
 * Compute the smallest set of additional offered durations (not already
 * selected) whose addition makes at least one eligible pattern for the meter.
 *
 * The search is deterministic: it tries addition-set sizes k = 1 upward, and
 * within each size tries the canonical-ordered combinations in order. When
 * the selection is already eligible it returns an empty set. When no addition
 * restores eligibility it returns an empty set (never throws).
 * @param catalog - The parsed, validated rhythm catalog
 * @param meter - The meter heading (e.g. `2/4`)
 * @param selectedTokens - The currently selected duration tokens
 * @returns The smallest addition set in canonical order, or `[]`
 */
export const computeCorrectiveSuggestion = (
  catalog: RhythmCatalog,
  meter: string,
  selectedTokens: ReadonlySet<string>,
): string[] => {
  const offered = computeOfferableDurations(catalog, meter)

  // Already eligible: nothing to add.
  if (computeEligibleRhythms(catalog, meter, selectedTokens).length > 0) {
    return []
  }

  // Candidates are offered durations not already selected, in canonical order.
  const candidates = offered.filter((token) => !selectedTokens.has(token))

  // Search addition-set size upward, in canonical-ordered combination order.
  for (let k = 1; k <= candidates.length; k += 1) {
    const combos = combinations(candidates, k)
    for (const combo of combos) {
      const test = new Set(selectedTokens)
      for (const token of combo) {
        test.add(token)
      }
      if (computeEligibleRhythms(catalog, meter, test).length > 0) {
        return combo
      }
    }
  }
  return []
}

/**
 * Build the human-readable corrective phrase from display labels, e.g.
 * "the eighth duration" or "the half and quarter durations".
 * @param labels - One or more display labels
 * @returns A phrase naming the durations to add
 */
const labelsFor = (labels: string[]): string => {
  if (labels.length === 1) {
    return `the ${labels[0]} duration`
  }
  if (labels.length === 2) {
    return `the ${labels[0]} and ${labels[1]} durations`
  }
  const head = labels.slice(0, -1).join(', ')
  return `the ${head}, and ${labels[labels.length - 1]} durations`
}

/**
 * Build the stable corrective message for an impossible duration set. It names
 * the duration group, states that no complete measure can be built from the
 * selected durations for the current meter, and names the computed corrective
 * suggestion by display label. It never enumerates catalog patterns, internal
 * token letters, or line numbers.
 * @param meter - The current meter heading (e.g. `2/4`)
 * @param suggestionTokens - The corrective addition set in canonical order
 * @returns The stable corrective message string
 */
const buildImpossibleSetMessage = (meter: string, suggestionTokens: string[]): string => {
  const labels = suggestionTokens.map((token) => DURATION_LABELS[token] ?? token)
  const addPhrase = labelsFor(labels)
  return `No complete measure can be built from the selected durations for the ${meter} meter. Add ${addPhrase} to make your rhythm selection valid.`
}

/**
 * Validate a submitted duration selection against a meter's offerable set and
 * the eligibility rule.
 *
 * Steps:
 * 1. Normalize the submitted value to a trimmed `string[]` (a non-array
 *    yields an empty array).
 * 2. Deduplicate, retaining the first occurrence of each token.
 * 3. Reject each token that is not a supported token (field-addressable
 *    failure naming the offending token) and each supported token not in
 *    `computeOfferableDurations` for the meter (field-addressable failure
 *    naming the token and the meter). Nothing is silently dropped.
 * 4. When the kept (offerable) set is empty, emit a failure with
 *    `EMPTY_DURATION_MESSAGE`.
 * 5. When the kept set is non-empty but `computeEligibleRhythms` is empty,
 *    emit a single group-level failure on `'durations'` whose message names
 *    the duration group, states that no complete measure can be built for the
 *    current meter, and names the computed corrective suggestion by display
 *    label.
 * 6. On success, return `Result.ok` with the kept tokens ordered by
 *    `CANONICAL_DURATION_ORDER` (not submission order).
 *
 * The function is pure: it never throws and never mutates its arguments.
 * @param submitted - Untrusted submitted value (typically `string[]` from the form parser)
 * @param catalog - The parsed, validated rhythm catalog
 * @param meter - The current meter heading (e.g. `2/4`)
 * @returns Result<string[], DurationSelectionFailure[]>
 */
export const validateDurationSelection = (
  submitted: unknown,
  catalog: RhythmCatalog,
  meter: string,
): Result<string[], DurationSelectionFailure[]> => {
  const failures: DurationSelectionFailure[] = []
  const normalized = normalizeSubmitted(submitted)
  const offered = computeOfferableDurations(catalog, meter)
  const offeredSet = new Set(offered)
  const seen = new Set<string>()

  for (const token of normalized) {
    if (!SUPPORTED_TOKENS.has(token)) {
      failures.push({ field: 'durations', reason: `The duration "${token}" is not supported.` })
      continue
    }
    if (!offeredSet.has(token)) {
      failures.push({
        field: 'durations',
        reason: `The duration "${token}" is not available for the ${meter} meter.`,
      })
      continue
    }
    if (seen.has(token)) {
      continue
    }
    seen.add(token)
  }

  // Order the kept tokens canonically, regardless of submission order.
  const orderedKept = CANONICAL_DURATION_ORDER.filter((token) => seen.has(token))

  if (orderedKept.length === 0) {
    failures.push({ field: 'durations', reason: EMPTY_DURATION_MESSAGE })
  } else if (computeEligibleRhythms(catalog, meter, new Set(orderedKept)).length === 0) {
    const suggestion = computeCorrectiveSuggestion(catalog, meter, new Set(orderedKept))
    failures.push({ field: 'durations', reason: buildImpossibleSetMessage(meter, suggestion) })
  }

  if (failures.length > 0) {
    return Result.err(failures)
  }
  return Result.ok(orderedKept)
}

/**
 * Resolve the duration-selection state for form rendering, implementing the
 * first-derivation semantics.
 *
 * When `storedDurations` is null or an empty/whitespace string, this is a
 * first derivation: every offerable duration is preselected and
 * `isFirstDerivation` is true. Otherwise the stored selection is parsed,
 * filtered to only tokens still in `offerableDurations` (so a stored token no
 * longer offerable after an upstream meter change is dropped), and returned
 * in offerable order. A stored narrowed selection is never re-expanded.
 * @param storedDurations - The stored `selectedDurations` string (comma-separated tokens), or null
 * @param offerableDurations - The offerable duration tokens for the current meter, in canonical order
 * @returns The resolved duration-selection state
 */
export const resolveDurationSelectionState = (
  storedDurations: string | null,
  offerableDurations: string[],
): DurationSelectionState => {
  if (storedDurations === null || storedDurations.trim() === '') {
    return { selectedDurations: [...offerableDurations], isFirstDerivation: true }
  }
  const offerableSet = new Set(offerableDurations)
  const parts = storedDurations
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
  const seen = new Set<string>()
  for (const token of parts) {
    if (offerableSet.has(token)) {
      seen.add(token)
    }
  }
  const orderedKept = offerableDurations.filter((token) => seen.has(token))
  return { selectedDurations: orderedKept, isFirstDerivation: false }
}

/**
 * Parse the packaged rhythm catalog text defensively. This re-export lets the
 * route and the module share a single parse source; a parse failure (an
 * impossible state for the packaged catalog) yields an empty offerable set
 * and a rejection path rather than a 500.
 */
export const loadRhythmCatalog = (text: string): RhythmCatalog => {
  const result = parseRhythmCatalog(text)
  if (result.isOk) {
    return result.value
  }
  return { meters: {} }
}
