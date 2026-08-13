// ====================================
// Tests for the Piece Generator (Issue 20).
//
// The Piece Generator creates one immutable, presentation-independent Piece
// according to the minimal Issue 20 rules: meter-correct rhythms drawn from
// eligible catalog patterns and uniformly chosen pitches from the hand's
// selected set. Rests, interval weighting, repeats, and two-hand
// coordination arrive in Issues 22–25.
//
// These tests assert the Piece contract invariants: requested measure count,
// exact measure duration for every measure (eighth-unit arithmetic), only
// selected pitches, correct hand ranges, an empty array for the unused hand,
// complete JSON round-tripping, no mutation of input settings, a
// server-generated pieceId UUID, and sourceParameterVersion equal to the
// supplied workflow version. The generator performs no DB/HTTP/SVG/UI work
// (it accepts an injectable random source).
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'

import {
  generatePiece,
  type Piece,
  type GenerationSettings,
  type RandomSource,
} from '../src/lib/piece-generator'
import { RHYTHM_CATALOG_TEXT } from '../src/lib/rhythm-catalog-data'
import {
  parseRhythmCatalog,
  computeEligibleRhythms,
  MEASURE_LENGTHS,
} from '../src/lib/rhythm-catalog'

const catalog = parseRhythmCatalog(RHYTHM_CATALOG_TEXT)
if (catalog.isErr) {
  throw new Error('piece-generator.spec: rhythm catalog failed to parse')
}

/**
 * A deterministic fake random source for reproducible tests. Returns indices
 * via a seeded counter so the same settings + seed always produce the same
 * Piece. `nextInt(maxExclusive)` cycles through 0..maxExclusive-1 in order,
 * wrapping around.
 */
const makeFakeRandom = (seed: number = 0): RandomSource => {
  let state = seed
  const nextInt = (maxExclusive: number): number => {
    if (maxExclusive <= 0) {
      return 0
    }
    const value = state % maxExclusive
    state += 1
    return value
  }
  return { nextInt }
}

/**
 * Token durations in eighth-note units (quarter beats × 2) for exact integer
 * comparison, matching the rhythm catalog's length-validation style.
 */
const TOKEN_EIGHTHS: Readonly<Record<string, number>> = {
  W: 8,
  H: 4,
  D: 6,
  Q: 2,
  R: 3,
  E: 1,
}

/**
 * Measure length in eighth-note units for a supported meter.
 */
const measureEighths = (meter: string): number => MEASURE_LENGTHS[meter] * 2

/**
 * Sum a hand's note events in eighth-note units. Every event has a duration
 * token; in this minimal slice every event is pitched (no rests), but the
 * arithmetic is the same either way.
 */
const handEighths = (events: readonly { duration: string }[]): number => {
  let sum = 0
  for (const event of events) {
    sum += TOKEN_EIGHTHS[event.duration] ?? 0
  }
  return sum
}

/**
 * A standard right-hand-only settings fixture: C major, 4/4, 8 measures,
 * right hand with a small pitch set, quarter + eighth durations.
 */
const rightHandSettings: GenerationSettings = {
  measureCount: 8,
  timeSignature: '4/4',
  key: 'C major',
  hand: 'right',
  rightHandPitches: ['C4', 'D4', 'E4', 'F4'],
  leftHandPitches: [],
  selectedDurations: ['Q', 'E'],
  sourceParameterVersion: 5,
}

/**
 * A two-hand settings fixture: C major, 3/4, 4 measures, both hands with
 * split pitch sets, half + quarter durations.
 */
const bothHandSettings: GenerationSettings = {
  measureCount: 4,
  timeSignature: '3/4',
  key: 'C major',
  hand: 'both',
  rightHandPitches: ['E4', 'F4'],
  leftHandPitches: ['C4', 'D4'],
  selectedDurations: ['H', 'Q'],
  sourceParameterVersion: 3,
}

describe('generatePiece - Piece contract shape', () => {
  it('produces a Piece with a pieceId that is a UUID string', () => {
    const piece = generatePiece(rightHandSettings, makeFakeRandom(0))
    if (piece.isErr) {
      throw new Error(`Expected Ok, got Err: ${piece.error.kind}`)
    }
    const p = piece.value
    expect(typeof p.pieceId).toBe('string')
    // UUID v4 shape: 8-4-4-4-12 hex digits.
    expect(p.pieceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('carries the key, time signature, and hand from the settings', () => {
    const piece = generatePiece(bothHandSettings, makeFakeRandom(1))
    if (piece.isErr) {
      throw new Error(`Expected Ok, got Err: ${piece.error.kind}`)
    }
    const p = piece.value
    expect(p.key).toBe('C major')
    expect(p.timeSignature).toBe('3/4')
    expect(p.hand).toBe('both')
  })

  it('carries sourceParameterVersion equal to the supplied workflow version', () => {
    const piece = generatePiece(rightHandSettings, makeFakeRandom(2))
    if (piece.isErr) {
      throw new Error(`Expected Ok, got Err: ${piece.error.kind}`)
    }
    expect(piece.value.sourceParameterVersion).toBe(5)
  })
})

describe('generatePiece - measure count', () => {
  it('produces exactly the requested number of measures', () => {
    const piece = generatePiece(rightHandSettings, makeFakeRandom(3))
    if (piece.isErr) {
      throw new Error(`Expected Ok, got Err: ${piece.error.kind}`)
    }
    expect(piece.value.measures).toHaveLength(8)
  })

  it('produces exactly the requested number of measures for a two-hand piece', () => {
    const piece = generatePiece(bothHandSettings, makeFakeRandom(4))
    if (piece.isErr) {
      throw new Error(`Expected Ok, got Err: ${piece.error.kind}`)
    }
    expect(piece.value.measures).toHaveLength(4)
  })
})

describe('generatePiece - exact measure duration', () => {
  it('every measure right-hand durations sum exactly to the meter length (4/4)', () => {
    const piece = generatePiece(rightHandSettings, makeFakeRandom(5))
    if (piece.isErr) {
      throw new Error(`Expected Ok, got Err: ${piece.error.kind}`)
    }
    const target = measureEighths('4/4')
    for (const measure of piece.value.measures) {
      expect(handEighths(measure.rightHand)).toBe(target)
    }
  })

  it('every measure right-hand durations sum exactly to the meter length (3/4)', () => {
    const piece = generatePiece(bothHandSettings, makeFakeRandom(6))
    if (piece.isErr) {
      throw new Error(`Expected Ok, got Err: ${piece.error.kind}`)
    }
    const target = measureEighths('3/4')
    for (const measure of piece.value.measures) {
      expect(handEighths(measure.rightHand)).toBe(target)
      expect(handEighths(measure.leftHand)).toBe(target)
    }
  })

  it('every rhythm pattern used is an eligible catalog pattern for the meter', () => {
    const piece = generatePiece(rightHandSettings, makeFakeRandom(7))
    if (piece.isErr) {
      throw new Error(`Expected Ok, got Err: ${piece.error.kind}`)
    }
    const eligible = new Set(
      Array.from(
        // Re-derive eligible rhythms for the selected durations.
        computeEligibleFromSettings(rightHandSettings),
      ),
    )
    for (const measure of piece.value.measures) {
      const pattern = measure.rightHand.map((e) => e.duration).join('')
      expect(eligible.has(pattern)).toBe(true)
    }
  })
})

describe('generatePiece - pitch selection', () => {
  it('every right-hand pitch is from the right-hand selected set', () => {
    const piece = generatePiece(rightHandSettings, makeFakeRandom(8))
    if (piece.isErr) {
      throw new Error(`Expected Ok, got Err: ${piece.error.kind}`)
    }
    const allowed = new Set(rightHandSettings.rightHandPitches)
    for (const measure of piece.value.measures) {
      for (const event of measure.rightHand) {
        if (!event.rest) {
          expect(allowed.has(event.pitch)).toBe(true)
        }
      }
    }
  })

  it('every left-hand pitch is from the left-hand selected set for a two-hand piece', () => {
    const piece = generatePiece(bothHandSettings, makeFakeRandom(9))
    if (piece.isErr) {
      throw new Error(`Expected Ok, got Err: ${piece.error.kind}`)
    }
    const allowed = new Set(bothHandSettings.leftHandPitches)
    for (const measure of piece.value.measures) {
      for (const event of measure.leftHand) {
        if (!event.rest) {
          expect(allowed.has(event.pitch)).toBe(true)
        }
      }
    }
  })

  it('every right-hand pitch is from the right-hand selected set for a two-hand piece', () => {
    const piece = generatePiece(bothHandSettings, makeFakeRandom(10))
    if (piece.isErr) {
      throw new Error(`Expected Ok, got Err: ${piece.error.kind}`)
    }
    const allowed = new Set(bothHandSettings.rightHandPitches)
    for (const measure of piece.value.measures) {
      for (const event of measure.rightHand) {
        if (!event.rest) {
          expect(allowed.has(event.pitch)).toBe(true)
        }
      }
    }
  })
})

describe('generatePiece - unused hand is empty', () => {
  it('the left-hand array is empty in every measure for a right-hand-only piece', () => {
    const piece = generatePiece(rightHandSettings, makeFakeRandom(11))
    if (piece.isErr) {
      throw new Error(`Expected Ok, got Err: ${piece.error.kind}`)
    }
    for (const measure of piece.value.measures) {
      expect(measure.leftHand).toHaveLength(0)
    }
  })

  it('the right-hand array is empty in every measure for a left-hand-only piece', () => {
    const leftHandSettings: GenerationSettings = {
      measureCount: 4,
      timeSignature: '4/4',
      key: 'C major',
      hand: 'left',
      rightHandPitches: [],
      leftHandPitches: ['C4', 'D4', 'E4'],
      selectedDurations: ['Q'],
      sourceParameterVersion: 2,
    }
    const piece = generatePiece(leftHandSettings, makeFakeRandom(12))
    if (piece.isErr) {
      throw new Error(`Expected Ok, got Err: ${piece.error.kind}`)
    }
    for (const measure of piece.value.measures) {
      expect(measure.rightHand).toHaveLength(0)
    }
  })
})

describe('generatePiece - JSON round-tripping', () => {
  it('the complete Piece JSON round-trips through JSON.parse(JSON.stringify(piece)) losslessly', () => {
    const piece = generatePiece(bothHandSettings, makeFakeRandom(13))
    if (piece.isErr) {
      throw new Error(`Expected Ok, got Err: ${piece.error.kind}`)
    }
    const roundTripped = JSON.parse(JSON.stringify(piece.value)) as Piece
    expect(roundTripped).toEqual(piece.value)
  })
})

describe('generatePiece - no mutation of input settings', () => {
  it('does not mutate the input settings object or its arrays', () => {
    const settings: GenerationSettings = {
      measureCount: 8,
      timeSignature: '4/4',
      key: 'C major',
      hand: 'right',
      rightHandPitches: ['C4', 'D4', 'E4'],
      leftHandPitches: [],
      selectedDurations: ['Q', 'E'],
      sourceParameterVersion: 1,
    }
    const snapshot = JSON.parse(JSON.stringify(settings)) as GenerationSettings
    const result = generatePiece(settings, makeFakeRandom(14))
    if (result.isErr) {
      throw new Error(`Expected Ok, got Err: ${result.error.kind}`)
    }
    expect(settings).toEqual(snapshot)
  })
})

describe('generatePiece - typed invariant failures', () => {
  it('returns a typed failure when no eligible rhythms exist for the selected durations', () => {
    // Select only 'W' (whole) for 2/4 — no whole-note pattern fits a 2/4
    // measure, so no eligible rhythm exists.
    const noEligibleSettings: GenerationSettings = {
      measureCount: 4,
      timeSignature: '2/4',
      key: 'C major',
      hand: 'right',
      rightHandPitches: ['C4', 'D4'],
      leftHandPitches: [],
      selectedDurations: ['W'],
      sourceParameterVersion: 1,
    }
    const result = generatePiece(noEligibleSettings, makeFakeRandom(0))
    expect(result.isErr).toBe(true)
    if (result.isErr) {
      expect(result.error.kind).toBe('no-eligible-rhythms')
    }
  })

  it('returns a typed failure when the active hand has an empty pitch set', () => {
    const emptyPitchSettings: GenerationSettings = {
      measureCount: 4,
      timeSignature: '4/4',
      key: 'C major',
      hand: 'right',
      rightHandPitches: [],
      leftHandPitches: [],
      selectedDurations: ['Q'],
      sourceParameterVersion: 1,
    }
    const result = generatePiece(emptyPitchSettings, makeFakeRandom(0))
    expect(result.isErr).toBe(true)
    if (result.isErr) {
      expect(result.error.kind).toBe('empty-pitch-set')
    }
  })
})

/**
 * Helper: compute the eligible rhythm patterns for a settings fixture's meter
 * and selected durations, returning an array of pattern strings.
 */
const computeEligibleFromSettings = (settings: GenerationSettings): readonly string[] => {
  const selectedSet = new Set(settings.selectedDurations)
  const cat = parseRhythmCatalog(RHYTHM_CATALOG_TEXT)
  if (cat.isErr) {
    return []
  }
  return computeEligibleRhythms(cat.value, settings.timeSignature, selectedSet)
}
