// ====================================
// Tests for the key domain catalog and pitch derivation.
// Verifies the exact eighteen supported keys (nine major, nine natural
// minor), that no supported key has more than four accidentals, that
// validateKey rejects unsupported and over-four-accidental keys with a
// typed failure and never coerces to a default, and that deriveKeyPitches
// returns the exact seven diatonic pitch names for every supported key
// using the key signature's conventional spelling (flat keys spell flats
// as flats, sharp keys spell sharps as sharps, no enharmonic duplicates),
// and that every natural-minor key's pitches match the natural minor
// scale (not harmonic or melodic minor).
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'
import Result from 'true-myth/result'

import {
  SUPPORTED_KEYS,
  validateKey,
  deriveKeyPitches,
  type KeyValidationFailure,
} from '../src/lib/key-domain'

const unwrap = <T, E>(result: Result<T, E>): T => {
  if (!result.isOk) {
    throw new Error(`Expected Ok, got Err: ${JSON.stringify(result.error)}`)
  }
  return result.value
}

const unwrapErr = <T, E>(result: Result<T, E>): E => {
  if (!result.isErr) {
    throw new Error(`Expected Err, got Ok: ${JSON.stringify(result.value)}`)
  }
  return result.error
}

// The exact eighteen supported keys per the PRD's "Supported musical
// domain" section: nine major and nine natural minor.
const EXPECTED_MAJOR_KEYS = [
  'C major',
  'G major',
  'D major',
  'A major',
  'E major',
  'F major',
  'B-flat major',
  'E-flat major',
  'A-flat major',
] as const

const EXPECTED_MINOR_KEYS = [
  'A minor',
  'E minor',
  'B minor',
  'F-sharp minor',
  'C-sharp minor',
  'D minor',
  'G minor',
  'C minor',
  'F minor',
] as const

const EXPECTED_KEYS = [...EXPECTED_MAJOR_KEYS, ...EXPECTED_MINOR_KEYS]

// Expected diatonic pitches for every supported key, using the key
// signature's conventional spelling. Verified against the PRD.
const EXPECTED_PITCHES: Record<string, string[]> = {
  'C major': ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  'G major': ['G', 'A', 'B', 'C', 'D', 'E', 'F-sharp'],
  'D major': ['D', 'E', 'F-sharp', 'G', 'A', 'B', 'C-sharp'],
  'A major': ['A', 'B', 'C-sharp', 'D', 'E', 'F-sharp', 'G-sharp'],
  'E major': ['E', 'F-sharp', 'G-sharp', 'A', 'B', 'C-sharp', 'D-sharp'],
  'F major': ['F', 'G', 'A', 'B-flat', 'C', 'D', 'E'],
  'B-flat major': ['B-flat', 'C', 'D', 'E-flat', 'F', 'G', 'A'],
  'E-flat major': ['E-flat', 'F', 'G', 'A-flat', 'B-flat', 'C', 'D'],
  'A-flat major': ['A-flat', 'B-flat', 'C', 'D-flat', 'E-flat', 'F', 'G'],
  'A minor': ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
  'E minor': ['E', 'F-sharp', 'G', 'A', 'B', 'C', 'D'],
  'B minor': ['B', 'C-sharp', 'D', 'E', 'F-sharp', 'G', 'A'],
  'F-sharp minor': ['F-sharp', 'G-sharp', 'A', 'B', 'C-sharp', 'D', 'E'],
  'C-sharp minor': ['C-sharp', 'D-sharp', 'E', 'F-sharp', 'G-sharp', 'A', 'B'],
  'D minor': ['D', 'E', 'F', 'G', 'A', 'B-flat', 'C'],
  'G minor': ['G', 'A', 'B-flat', 'C', 'D', 'E-flat', 'F'],
  'C minor': ['C', 'D', 'E-flat', 'F', 'G', 'A-flat', 'B-flat'],
  'F minor': ['F', 'G', 'A-flat', 'B-flat', 'C', 'D-flat', 'E-flat'],
}

// Map a pitch name to its pitch class (semitone offset from C, 0-11) so the
// natural-minor seventh-degree check can be computed without spelling
// assumptions.
const PITCH_CLASS: Record<string, number> = {
  C: 0,
  'C-sharp': 1,
  'D-flat': 1,
  D: 2,
  'D-sharp': 3,
  'E-flat': 3,
  E: 4,
  F: 5,
  'F-sharp': 6,
  'G-flat': 6,
  G: 7,
  'G-sharp': 8,
  'A-flat': 8,
  A: 9,
  'A-sharp': 10,
  'B-flat': 10,
  B: 11,
}

const pitchClass = (pitch: string): number => {
  const cls = PITCH_CLASS[pitch]
  if (cls === undefined) {
    throw new Error(`Unknown pitch name: ${pitch}`)
  }
  return cls
}

// Count the accidentals in a key's diatonic pitches. The number of
// accidentals in the seven diatonic notes equals the key signature's
// accidental count.
const accidentalCount = (pitches: string[]): number =>
  pitches.filter((p) => p.includes('-sharp') || p.includes('-flat')).length

const isMinorKey = (key: string): boolean => key.endsWith('minor')

describe('SUPPORTED_KEYS catalog', () => {
  it('contains exactly the eighteen supported keys, no more and no less', () => {
    expect(SUPPORTED_KEYS.length).toBe(18)
    expect([...SUPPORTED_KEYS].sort()).toEqual([...EXPECTED_KEYS].sort())
  })

  it('includes every expected major key', () => {
    for (const key of EXPECTED_MAJOR_KEYS) {
      expect(SUPPORTED_KEYS.includes(key)).toBe(true)
    }
  })

  it('includes every expected natural-minor key', () => {
    for (const key of EXPECTED_MINOR_KEYS) {
      expect(SUPPORTED_KEYS.includes(key)).toBe(true)
    }
  })

  it('has no supported key with more than four accidentals', () => {
    for (const key of SUPPORTED_KEYS) {
      const pitches = deriveKeyPitches(key)
      expect(accidentalCount(pitches)).toBeLessThanOrEqual(4)
    }
  })
})

describe('validateKey', () => {
  it('accepts each of the eighteen supported keys', () => {
    for (const key of SUPPORTED_KEYS) {
      const result = validateKey(key)
      expect(result.isOk).toBe(true)
      expect(unwrap(result)).toBe(key)
    }
  })

  it('accepts a supported key with surrounding whitespace by trimming', () => {
    const result = validateKey('  E-flat major  ')
    expect(result.isOk).toBe(true)
    expect(unwrap(result)).toBe('E-flat major')
  })

  it('rejects an unsupported major key (B major — five sharps) with a typed failure', () => {
    const result = validateKey('B major')
    expect(result.isErr).toBe(true)
    const failure = unwrapErr(result) as KeyValidationFailure
    expect(typeof failure).toBe('object')
  })

  it('rejects an unsupported minor key (G-sharp minor — five sharps) with a typed failure', () => {
    const result = validateKey('G-sharp minor')
    expect(result.isErr).toBe(true)
    const failure = unwrapErr(result) as KeyValidationFailure
    expect(typeof failure).toBe('object')
  })

  it('rejects an over-four-accidental key with a typed failure', () => {
    // D-flat major has five flats — over the four-accidental cap.
    const result = validateKey('D-flat major')
    expect(result.isErr).toBe(true)
    const failure = unwrapErr(result) as KeyValidationFailure
    expect(typeof failure).toBe('object')
  })

  it('rejects an empty string and never coerces to a default', () => {
    const result = validateKey('')
    expect(result.isErr).toBe(true)
    expect(typeof unwrapErr(result)).toBe('object')
  })

  it('rejects null and never coerces to a default', () => {
    const result = validateKey(null)
    expect(result.isErr).toBe(true)
    expect(typeof unwrapErr(result)).toBe('object')
  })

  it('rejects undefined and never coerces to a default', () => {
    const result = validateKey(undefined)
    expect(result.isErr).toBe(true)
    expect(typeof unwrapErr(result)).toBe('object')
  })

  it('rejects a non-string value with a typed failure', () => {
    const result = validateKey(42)
    expect(result.isErr).toBe(true)
    expect(typeof unwrapErr(result)).toBe('object')
  })
})

describe('deriveKeyPitches', () => {
  it('returns exactly seven pitch names for every supported key', () => {
    for (const key of SUPPORTED_KEYS) {
      const pitches = deriveKeyPitches(key)
      expect(pitches.length).toBe(7)
    }
  })

  it('returns the exact expected pitch array for every supported key', () => {
    for (const key of EXPECTED_KEYS) {
      const pitches = deriveKeyPitches(key)
      expect(pitches).toEqual(EXPECTED_PITCHES[key])
    }
  })

  it('for E-flat major includes B-flat and E-flat (not A-sharp and D-sharp)', () => {
    const pitches = deriveKeyPitches('E-flat major')
    expect(pitches).toContain('B-flat')
    expect(pitches).toContain('E-flat')
    expect(pitches).not.toContain('A-sharp')
    expect(pitches).not.toContain('D-sharp')
  })

  it('for A-flat major includes A-flat, B-flat, D-flat, and E-flat', () => {
    const pitches = deriveKeyPitches('A-flat major')
    expect(pitches).toContain('A-flat')
    expect(pitches).toContain('B-flat')
    expect(pitches).toContain('D-flat')
    expect(pitches).toContain('E-flat')
  })

  it('for F-sharp minor includes F-sharp and C-sharp', () => {
    const pitches = deriveKeyPitches('F-sharp minor')
    expect(pitches).toContain('F-sharp')
    expect(pitches).toContain('C-sharp')
  })

  it('for C-sharp minor includes C-sharp, D-sharp, and G-sharp', () => {
    const pitches = deriveKeyPitches('C-sharp minor')
    expect(pitches).toContain('C-sharp')
    expect(pitches).toContain('D-sharp')
    expect(pitches).toContain('G-sharp')
  })

  it('for every natural-minor key the seventh scale degree is a whole step below the tonic (natural minor)', () => {
    for (const key of SUPPORTED_KEYS) {
      if (!isMinorKey(key)) {
        continue
      }
      const pitches = deriveKeyPitches(key)
      const tonic = pitchClass(pitches[0]!)
      const seventh = pitchClass(pitches[6]!)
      // A whole step is 2 semitones; the seventh should be 2 semitones
      // below the tonic (modulo octave). Harmonic minor would raise the
      // seventh to 1 semitone below (half step); melodic minor would raise
      // both the sixth and the seventh.
      const intervalBelow = (tonic - seventh + 12) % 12
      expect(intervalBelow).toBe(2)
    }
  })

  it('produces no enharmonic duplicates for any supported key', () => {
    for (const key of SUPPORTED_KEYS) {
      const pitches = deriveKeyPitches(key)
      // No two pitches should share the same pitch class — that would
      // indicate an enharmonic duplicate (e.g. F-sharp and G-flat both
      // appearing).
      const classes = pitches.map(pitchClass)
      const unique = new Set(classes)
      expect(unique.size).toBe(7)
    }
  })
})
