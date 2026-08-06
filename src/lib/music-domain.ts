/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Music domain: octave validation, contiguous range expansion, and the
 * available-pitch derivation with the C7 cap.
 *
 * The setup validator and the setup form depend on this module so the
 * route never trusts a submitted octave selection and the form always
 * displays the lowest and highest available pitch derived from the
 * selected key and octaves.
 *
 * Range rules (per the PRD and Issue 7):
 * - The student selects one or more octaves from 2 through 6.
 * - The lowest and highest selections establish one continuous expanded
 *   range that includes every intervening scale range.
 * - Each scale range is derived tonic-to-tonic (eight pitches, from the
 *   tonic at the selected octave to the tonic one octave above) before the
 *   global upper cap is applied.
 * - Every scientific-pitch octave-7 note is excluded except C7.
 * - C7 is available only when C natural belongs to the selected key and
 *   occurs in the expanded range.
 *
 * The diatonic pitch spellings come from `key-domain` so flat keys spell
 * flats as flats and sharp keys spell sharps as sharps with no enharmonic
 * duplicates.
 * @module lib/music-domain
 */
import Result from 'true-myth/result'

import { deriveKeyPitches } from './key-domain'

/**
 * Lowest selectable octave, per the PRD (octaves 2 through 6).
 */
export const OCTAVE_MIN = 2

/**
 * Highest selectable octave, per the PRD (octaves 2 through 6).
 */
export const OCTAVE_MAX = 6

/**
 * Typed validation failure for a submitted octave selection. The shape
 * mirrors the setup validator's field-addressable failures so the route
 * can wire a rejection to the octaves control uniformly.
 */
export interface OctaveValidationFailure {
  field: 'octaves'
  reason: string
}

const OCTAVES_REASON = `Octaves must be one or more values from 2 through 6.`

/**
 * Validate a submitted octave selection. Accepts an array of unknown
 * values (typically strings from a multi-value form field), rejects a
 * non-array, null, undefined, an empty array, a non-numeric element, and
 * any element outside 2-6, each returning a typed failure with
 * `field: 'octaves'`. For a valid array, parses each element to an
 * integer, deduplicates, sorts ascending, and returns the sorted unique
 * `number[]`. Never coerces an invalid or empty selection into a default.
 * @param values - Untrusted submitted octave values
 * @returns Result<number[], OctaveValidationFailure>
 */
export const validateOctaves = (
  values: unknown,
): Result<number[], OctaveValidationFailure> => {
  if (!Array.isArray(values)) {
    return Result.err({ field: 'octaves', reason: OCTAVES_REASON })
  }
  if (values.length === 0) {
    return Result.err({ field: 'octaves', reason: OCTAVES_REASON })
  }
  const parsed: number[] = []
  for (const raw of values) {
    if (typeof raw !== 'string' && typeof raw !== 'number') {
      return Result.err({ field: 'octaves', reason: OCTAVES_REASON })
    }
    const text = String(raw).trim()
    if (text === '' || !/^-?\d+$/.test(text)) {
      return Result.err({ field: 'octaves', reason: OCTAVES_REASON })
    }
    const n = Number(text)
    if (!Number.isInteger(n)) {
      return Result.err({ field: 'octaves', reason: OCTAVES_REASON })
    }
    if (n < OCTAVE_MIN || n > OCTAVE_MAX) {
      return Result.err({ field: 'octaves', reason: OCTAVES_REASON })
    }
    parsed.push(n)
  }
  const unique = Array.from(new Set(parsed))
  unique.sort((a, b) => a - b)
  return Result.ok(unique)
}

/**
 * The contiguous expanded range derived from the lowest and highest
 * selected octaves. Every intervening scale range is included.
 */
export interface ExpandedRange {
  min: number
  max: number
}

/**
 * Derive the contiguous expanded range from an octave selection. The min
 * and max are the lowest and highest selected octaves; every octave
 * between them is included in the expanded range regardless of whether it
 * was selected. Input order does not matter — the actual min and max are
 * computed.
 * @param octaves - Octave numbers (any order)
 * @returns The contiguous min/max expanded range
 */
export const expandOctaveRange = (octaves: number[]): ExpandedRange => {
  if (octaves.length === 0) {
    throw new Error('expandOctaveRange: empty octave selection')
  }
  const min = Math.min(...octaves)
  const max = Math.max(...octaves)
  return { min, max }
}

/**
 * Letter-name order used to detect the scientific-pitch octave boundary.
 * The octave number increments at the B-to-C crossing, so a scale degree
 * whose letter comes before the tonic's letter (in this order) belongs to
 * the next octave up.
 */
const LETTER_ORDER: Record<string, number> = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6,
}

/**
 * Extract the letter name (C, D, ..., B) from a diatonic pitch name such
 * as `'C-sharp'` or `'B-flat'`.
 */
const letterOf = (pitchName: string): string => pitchName.split('-')[0]

/**
 * Derive the tonic-to-tonic scale-range pitches for a single octave. The
 * result is eight pitches: the seven diatonic pitches of the key starting
 * at the tonic in the given octave, followed by the tonic one octave
 * above. Spellings come from `deriveKeyPitches` so the key signature's
 * conventional spelling is used. The octave number increments at the
 * B-to-C crossing, so a scale degree whose letter comes before the
 * tonic's letter is spelled in the next octave up (e.g. the seventh
 * degree of D major, C-sharp, is spelled C-sharp5 in the octave-4 range).
 * The caller is responsible for passing a supported key; an unsupported
 * key throws (programmer error).
 * @param key - A supported key string
 * @param octave - The octave number for the range's lower tonic
 * @returns Eight scientific-pitch names from tonic-octave to tonic-(octave+1)
 */
export const deriveScaleRangePitches = (key: string, octave: number): string[] => {
  const diatonic = deriveKeyPitches(key)
  const tonic = diatonic[0]
  const tonicLetterIndex = LETTER_ORDER[letterOf(tonic)]
  const range = diatonic.map((name) => {
    const letterIndex = LETTER_ORDER[letterOf(name)]
    const useOctave = letterIndex < tonicLetterIndex ? octave + 1 : octave
    return `${name}${useOctave}`
  })
  range.push(`${tonic}${octave + 1}`)
  return range
}

/**
 * The available pitch set derived from the selected key and octaves after
 * contiguous expansion and the C7 cap. `lowest` and `highest` are the
 * boundary pitches so the setup form can display the expansion and the
 * cap without generating music.
 */
export interface AvailablePitches {
  pitches: string[]
  lowest: string
  highest: string
}

/**
 * Derive the full available pitch set for a supported key and a validated
 * octave selection, applying contiguous expansion and the C7 cap.
 *
 * Steps:
 * 1. Expand the selection to the contiguous min/max range.
 * 2. For each octave from min to max, derive the tonic-to-tonic scale
 *    range and collect the pitches, deduplicating boundary tonics (the
 *    upper tonic of one octave equals the lower tonic of the next).
 * 3. Apply the C7 cap: remove every pitch whose octave number is 7 except
 *    C7, and keep C7 only when C natural belongs to the key (i.e. when
 *    `'C'` is in the key's diatonic pitches).
 * 4. Return the ordered pitch set with its lowest and highest elements.
 *
 * The caller is responsible for passing a supported key and a validated,
 * sorted octave selection.
 * @param key - A supported key string
 * @param octaves - Validated, sorted unique octave numbers
 * @returns The available pitch set with lowest and highest boundaries
 */
export const deriveAvailablePitches = (
  key: string,
  octaves: number[],
): AvailablePitches => {
  const { min, max } = expandOctaveRange(octaves)
  const diatonic = deriveKeyPitches(key)
  const cNaturalInKey = diatonic.includes('C')

  // Build the contiguous pitch set, deduplicating boundary tonics.
  const ordered: string[] = []
  for (let octave = min; octave <= max; octave += 1) {
    const range = deriveScaleRangePitches(key, octave)
    for (const pitch of range) {
      if (ordered.length > 0 && ordered[ordered.length - 1] === pitch) {
        continue
      }
      ordered.push(pitch)
    }
  }

  // Apply the C7 cap: remove every octave-7 pitch except C7, and keep C7
  // only when C natural belongs to the key.
  const capped = ordered.filter((pitch) => {
    const octaveNumber = Number(pitch.match(/(\d+)$/)?.[1] ?? NaN)
    if (octaveNumber !== 7) {
      return true
    }
    if (pitch === 'C7' && cNaturalInKey) {
      return true
    }
    return false
  })

  const lowest = capped[0] ?? ''
  const highest = capped[capped.length - 1] ?? ''
  return { pitches: capped, lowest, highest }
}
