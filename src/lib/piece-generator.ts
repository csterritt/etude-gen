/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Piece Generator (Issue 20).
 *
 * Creates one immutable, presentation-independent Piece according to the
 * minimal Issue 20 rules: meter-correct rhythms drawn from eligible catalog
 * patterns and uniformly chosen pitches from the hand's selected set. Rests,
 * interval weighting, repeats, and two-hand coordination arrive in Issues
 * 22–25.
 *
 * The Piece contract is immutable, JSON-serializable, and self-contained: key,
 * time signature, hand/staff assignment, `sourceParameterVersion`, a
 * server-generated `pieceId` UUID, and an ordered array of measures whose
 * right- and left-hand arrays hold duration-plus-pitch-or-rest events, with
 * the unused hand's array empty. No random seed is persisted. The generator
 * accepts an injectable random source and validated settings only, and
 * performs no database, HTTP, SVG, or UI work.
 *
 * The event shape accommodates a rest marker (`rest: true`) so later issues
 * (23–25) do not re-litigate the contract. In this minimal slice every event
 * is a pitched event (`rest: false`).
 * @module lib/piece-generator
 */
import Result from 'true-myth/result'

import {
  parseRhythmCatalog,
  computeEligibleRhythms,
} from './rhythm-catalog'
import { RHYTHM_CATALOG_TEXT } from './rhythm-catalog-data'

/**
 * A supported duration token (whole, half, dotted half, quarter, dotted
 * quarter, eighth). Fixed by Issue 12 and shared with the rhythm catalog.
 */
export type Duration = 'W' | 'H' | 'D' | 'Q' | 'R' | 'E'

/**
 * A pitched note event: a duration plus a pitch name. The `rest` discriminant
 * is `false` so a consumer can distinguish pitched events from rest events
 * (Issue 23) via a single field.
 */
export interface PitchedEvent {
  readonly duration: Duration
  readonly pitch: string
  readonly rest: false
}

/**
 * A rest event: a duration with no pitch. Issue 23 populates these; Issue 20
 * produces none, but the contract shape is fixed here.
 */
export interface RestEvent {
  readonly duration: Duration
  readonly rest: true
}

/**
 * A single note event in a hand's array: either pitched or a rest.
 */
export type NoteEvent = PitchedEvent | RestEvent

/**
 * A measure: right-hand and left-hand note arrays. The unused hand's array is
 * empty in every measure for a one-hand Piece.
 */
export interface Measure {
  readonly rightHand: readonly NoteEvent[]
  readonly leftHand: readonly NoteEvent[]
}

/**
 * The immutable, JSON-serializable, self-contained Piece contract. This is the
 * stable contract owned by Issue 20; later issues extend generation behavior
 * but do not change this shape.
 */
export interface Piece {
  /** Server-generated UUID identifying this Piece. */
  readonly pieceId: string
  /** The key signature string (e.g. "C major"). */
  readonly key: string
  /** The time signature string (e.g. "4/4"). */
  readonly timeSignature: string
  /** Which hands are used: "left", "right", or "both". */
  readonly hand: 'left' | 'right' | 'both'
  /** The workflow version this Piece was generated from. */
  readonly sourceParameterVersion: number
  /** The ordered array of measures. */
  readonly measures: readonly Measure[]
}

/**
 * Validated, immutable generation settings. The generator accepts these only —
 * never raw form input. The pitch sets are already split into right and left
 * hand by the caller (the Workflow Service), using the split boundary for
 * two-hand mode. For a one-hand mode the unused hand's pitch set is empty.
 */
export interface GenerationSettings {
  readonly measureCount: number
  readonly timeSignature: string
  readonly key: string
  readonly hand: 'left' | 'right' | 'both'
  /** Pitches assigned to the right hand. Empty when the right hand is unused. */
  readonly rightHandPitches: readonly string[]
  /** Pitches assigned to the left hand. Empty when the left hand is unused. */
  readonly leftHandPitches: readonly string[]
  /** Selected duration tokens; rhythms are eligible when every token is selected. */
  readonly selectedDurations: readonly string[]
  /** The workflow version to record as `sourceParameterVersion`. */
  readonly sourceParameterVersion: number
}

/**
 * An injectable random-number source. The generator uses `nextInt(n)` to pick
 * a uniform index in `[0, n)`. Tests inject a deterministic source; production
 * injects a non-seeded source. No seed is persisted or returned.
 */
export interface RandomSource {
  readonly nextInt: (maxExclusive: number) => number
}

/**
 * Typed invariant failure returned by `generatePiece`. The caller (the Workflow
 * Service) maps these to safe user-facing messages; the generator never
 * throws.
 */
export type GeneratorFailure =
  | { kind: 'no-eligible-rhythms' }
  | { kind: 'empty-pitch-set' }

/**
 * Parse the packaged rhythm catalog once at module load. The catalog is
 * validated at build time and contributes to the health check (Issue 12), so
 * this parse is infallible in a healthy deployment. If it ever fails, the
 * generator returns a typed failure rather than throwing.
 */
const parseCatalog = (): ReturnType<typeof parseRhythmCatalog> =>
  parseRhythmCatalog(RHYTHM_CATALOG_TEXT)

/**
 * Pick a uniform element from a non-empty readonly array using the injectable
 * random source. The caller guarantees the array is non-empty; this function
 * returns the first element if the array is somehow empty rather than throwing.
 */
const pickUniform = <T>(items: readonly T[], random: RandomSource): T => {
  if (items.length === 0) {
    throw new Error('pickUniform: empty array')
  }
  const index = random.nextInt(items.length)
  return items[index]!
}

/**
 * Generate one hand's note events for a single measure: pick a random eligible
 * rhythm pattern, then pick a uniform pitch from the hand's pitch set for each
 * position. In this minimal slice every event is pitched (no rests).
 */
const generateHand = (
  pitches: readonly string[],
  eligibleRhythms: readonly string[],
  random: RandomSource,
): readonly NoteEvent[] => {
  const pattern = pickUniform(eligibleRhythms, random)
  const events: NoteEvent[] = []
  for (const token of pattern) {
    const pitch = pickUniform(pitches, random)
    events.push({ duration: token as Duration, pitch, rest: false })
  }
  return events
}

/**
 * Generate one immutable Piece from validated settings and an injectable
 * random source.
 *
 * The generator performs no database, HTTP, SVG, or UI work. It accepts
 * validated settings only and an injectable random source; production uses a
 * non-seeded source and tests use a deterministic one. No random seed is
 * persisted or returned.
 *
 * For each measure, a random eligible rhythm pattern is selected (every token
 * in the pattern is among the selected durations), and a uniform pitch is
 * chosen from the hand's pitch set for each rhythm position. For a one-hand
 * Piece the unused hand's array is empty in every measure. For a two-hand
 * Piece both hands are generated independently (no coordination in this
 * slice — Issues 22–25 add interval weighting, rests, repeats, and two-hand
 * coordination).
 *
 * Returns a typed invariant failure (`no-eligible-rhythms` or
 * `empty-pitch-set`) rather than throwing.
 * @param settings - Validated, immutable generation settings
 * @param random - Injectable random-number source
 * @returns Result<Piece, GeneratorFailure>
 */
export const generatePiece = (
  settings: GenerationSettings,
  random: RandomSource,
): Result<Piece, GeneratorFailure> => {
  const catalogResult = parseCatalog()
  if (catalogResult.isErr) {
    return Result.err({ kind: 'no-eligible-rhythms' })
  }
  const catalog = catalogResult.value

  const selectedSet = new Set(settings.selectedDurations)
  const eligibleRhythms = computeEligibleRhythms(
    catalog,
    settings.timeSignature,
    selectedSet,
  )
  if (eligibleRhythms.length === 0) {
    return Result.err({ kind: 'no-eligible-rhythms' })
  }

  const useRight = settings.hand === 'right' || settings.hand === 'both'
  const useLeft = settings.hand === 'left' || settings.hand === 'both'

  if (useRight && settings.rightHandPitches.length === 0) {
    return Result.err({ kind: 'empty-pitch-set' })
  }
  if (useLeft && settings.leftHandPitches.length === 0) {
    return Result.err({ kind: 'empty-pitch-set' })
  }

  const measures: Measure[] = []
  for (let i = 0; i < settings.measureCount; i += 1) {
    const rightHand = useRight
      ? generateHand(settings.rightHandPitches, eligibleRhythms, random)
      : []
    const leftHand = useLeft
      ? generateHand(settings.leftHandPitches, eligibleRhythms, random)
      : []
    measures.push({ rightHand, leftHand })
  }

  const piece: Piece = {
    pieceId: crypto.randomUUID(),
    key: settings.key,
    timeSignature: settings.timeSignature,
    hand: settings.hand,
    sourceParameterVersion: settings.sourceParameterVersion,
    measures,
  }

  return Result.ok(piece)
}
