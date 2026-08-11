/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Read-only step-summary model for the etude workflow (Issue 17).
 *
 * `deriveStepSummary` builds the read-only summary of prior answers shown on
 * each later step. The summary is driven entirely by the committed aggregate
 * snapshot — no value comes from request input (cross-cutting contract
 * section 1). A summary renders only the committed, still-valid aggregate:
 * a stored pitch no longer in the available set, a stored duration no longer
 * offerable for the current meter, or a stored boundary no longer between
 * two adjacent selected pitches is filtered out and never rendered as if it
 * were a live selection.
 *
 * The notes step is one coherent prerequisite (cross-cutting contract
 * section 5): the split and review levels always show both the selected
 * pitches and the selected durations together, never one alone.
 *
 * Levels:
 * - `'notes'`: setup answers only (measure count, meter, key, expanded
 *   octave range, hands).
 * - `'split'`: setup answers plus the selected pitches (filtered to the
 *   available set) and the selected durations (filtered to the offerable
 *   set for the current meter).
 * - `'review'`: everything split shows plus, when `hand === 'both'` and a
 *   boundary applies, the split boundary and each hand's resulting pitch
 *   set (lower pitches left, higher pitches right). For one-hand mode the
 *   boundary and hand pitch sets are omitted (the "where a boundary applies"
 *   qualifier).
 *
 * The function is pure: it never mutates its argument, throws, or touches
 * the DB.
 * @module lib/etudeSummary
 */
import {
  parseStoredOctaves,
  expandOctaveRange,
  deriveAvailablePitches,
  deriveEligibleBoundaries,
} from './music-domain'
import {
  computeOfferableDurations,
  loadRhythmCatalog,
  CANONICAL_DURATION_ORDER,
} from './duration-selection-validator'
import { RHYTHM_CATALOG_TEXT } from './rhythm-catalog-data'

/**
 * The aggregate fields the summary reads. This is a structural subset of
 * `EtudeParams` so routes can pass their own minimal interface without
 * importing the full domain type.
 */
export interface SummaryParams {
  measureCount: number
  timeSignature: string
  keySignature: string
  selectedOctaves: string
  hand: string
  selectedPitches: string | null
  selectedDurations: string | null
  splitBoundary: string | null
}

/**
 * The step level the summary is being built for.
 */
export type SummaryStep = 'notes' | 'split' | 'review'

/**
 * The read-only summary model rendered on a later step. Fields beyond the
 * setup level are present only at the level that shows them; absent fields
 * are `undefined` so the component can omit them entirely.
 */
export interface StepSummary {
  measureCount: number
  timeSignature: string
  keySignature: string
  hand: string
  octaveRangeMin: number
  octaveRangeMax: number
  // Split and review levels.
  selectedPitches?: string[]
  selectedDurations?: string[]
  // Review level only.
  splitBoundary?: string
  leftHandPitches?: string[]
  rightHandPitches?: string[]
}

/**
 * Parse a stored comma-separated selection string into a trimmed `string[]`.
 * Null or empty yields an empty array. Used for both pitches and durations.
 */
const parseStoredList = (stored: string | null): string[] => {
  if (stored === null || stored.trim() === '') {
    return []
  }
  return stored
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

/**
 * Filter a stored selection to the currently available set, preserving the
 * stored order. A pitch no longer in the available set (after an upstream
 * key or octave change under Issue 11) is dropped.
 */
const filterToAvailable = (
  stored: readonly string[],
  available: readonly string[],
): string[] => {
  const availableSet = new Set(available)
  return stored.filter((pitch) => availableSet.has(pitch))
}

/**
 * Filter a stored duration selection to the offerable durations for the
 * current meter, preserving canonical order. A duration no longer offerable
 * (after an upstream meter change) is dropped.
 */
const filterToOfferable = (
  stored: readonly string[],
  offerable: readonly string[],
): string[] => {
  const offerableSet = new Set(offerable)
  // Preserve canonical order of the offerable set rather than stored order,
  // so the summary is deterministic regardless of submission order.
  return CANONICAL_DURATION_ORDER.filter(
    (token) => offerableSet.has(token) && stored.includes(token),
  )
}

/**
 * Derive the read-only summary model for the given step level.
 *
 * Every value comes from the committed aggregate snapshot. Invalidated or
 * stale values are filtered out: a pitch no longer in the available set, a
 * duration no longer offerable, or a boundary no longer between two adjacent
 * selected pitches is omitted. The function is pure: it never mutates its
 * argument, throws, or touches the DB.
 * @param params - The owner's committed aggregate snapshot
 * @param step - The step level the summary is being built for
 * @returns The read-only summary model
 */
export const deriveStepSummary = (
  params: SummaryParams,
  step: SummaryStep,
): StepSummary => {
  // Setup-level fields are always present.
  const octaves = parseStoredOctaves(params.selectedOctaves)
  const { min, max } = expandOctaveRange(octaves)
  const summary: StepSummary = {
    measureCount: params.measureCount,
    timeSignature: params.timeSignature,
    keySignature: params.keySignature,
    hand: params.hand,
    octaveRangeMin: min,
    octaveRangeMax: max,
  }

  if (step === 'notes') {
    return summary
  }

  // Split and review levels: derive the available pitches and offerable
  // durations from the committed key, octaves, and meter, then filter the
  // stored selections to those sets.
  const availablePitches = deriveAvailablePitches(params.keySignature, octaves).pitches
  const catalog = loadRhythmCatalog(RHYTHM_CATALOG_TEXT)
  const offerableDurations = computeOfferableDurations(catalog, params.timeSignature)
  const storedPitches = parseStoredList(params.selectedPitches)
  const storedDurations = parseStoredList(params.selectedDurations)
  const filteredPitches = filterToAvailable(storedPitches, availablePitches)
  const filteredDurations = filterToOfferable(storedDurations, offerableDurations)
  summary.selectedPitches = filteredPitches
  summary.selectedDurations = filteredDurations

  if (step === 'split') {
    return summary
  }

  // Review level: add the split boundary and each hand's pitch set when a
  // boundary applies (two-hand mode with a still-eligible stored boundary).
  // For one-hand mode, or a stale/missing boundary, these fields are
  // omitted entirely.
  if (params.hand !== 'both') {
    return summary
  }
  if (params.splitBoundary === null || params.splitBoundary.trim() === '') {
    return summary
  }
  const eligibleBoundaries = deriveEligibleBoundaries(filteredPitches)
  const matched = eligibleBoundaries.find((b) => b.id === params.splitBoundary)
  if (matched === undefined) {
    // Stale boundary: no longer between two adjacent selected pitches. Omit
    // the boundary and hand pitch sets entirely — never invent or display
    // an ineligible boundary.
    return summary
  }
  summary.splitBoundary = matched.id
  summary.leftHandPitches = [...matched.left]
  summary.rightHandPitches = [...matched.right]
  return summary
}
