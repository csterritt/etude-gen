// ====================================
// Tests for the music domain: octave validation, contiguous range
// expansion, tonic-to-tonic scale-range derivation, and the C7 cap.
// Verifies that validateOctaves accepts octaves 2 through 6, rejects an
// empty selection and any octave outside 2-6 with a typed failure, and
// normalizes duplicate values and arbitrary order to one ascending set;
// that expandOctaveRange returns the contiguous min/max; that
// deriveScaleRangePitches produces the tonic-to-tonic pitch set using the
// key's diatonic spelling; and that deriveAvailablePitches applies the
// contiguous expansion and the C7 cap at all four exact boundaries.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'
import Result from 'true-myth/result'

import {
  OCTAVE_MIN,
  OCTAVE_MAX,
  validateOctaves,
  expandOctaveRange,
  deriveScaleRangePitches,
  deriveAvailablePitches,
  type OctaveValidationFailure,
} from '../src/lib/music-domain'

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

describe('octave boundaries', () => {
  it('exposes OCTAVE_MIN === 2 and OCTAVE_MAX === 6', () => {
    expect(OCTAVE_MIN).toBe(2)
    expect(OCTAVE_MAX).toBe(6)
  })
})

describe('validateOctaves', () => {
  it('accepts octaves 2 through 6 and returns a sorted unique number[]', () => {
    const result = validateOctaves(['2', '4', '6'])
    expect(result.isOk).toBe(true)
    expect(unwrap(result)).toEqual([2, 4, 6])
  })

  it('accepts a single octave as a one-element array', () => {
    const result = validateOctaves(['3'])
    expect(result.isOk).toBe(true)
    expect(unwrap(result)).toEqual([3])
  })

  it('normalizes arbitrary order to one ascending set', () => {
    const result = validateOctaves(['5', '2', '3'])
    expect(result.isOk).toBe(true)
    expect(unwrap(result)).toEqual([2, 3, 5])
  })

  it('normalizes duplicate values to one ascending set', () => {
    const result = validateOctaves(['4', '4', '2', '2'])
    expect(result.isOk).toBe(true)
    expect(unwrap(result)).toEqual([2, 4])
  })

  it('rejects an empty array with a typed failure naming the octaves field', () => {
    const result = validateOctaves([])
    expect(result.isErr).toBe(true)
    const failure = unwrapErr(result) as OctaveValidationFailure
    expect(failure.field).toBe('octaves')
  })

  it('rejects null with a typed failure naming the octaves field', () => {
    const result = validateOctaves(null)
    expect(result.isErr).toBe(true)
    expect((unwrapErr(result) as OctaveValidationFailure).field).toBe('octaves')
  })

  it('rejects undefined with a typed failure naming the octaves field', () => {
    const result = validateOctaves(undefined)
    expect(result.isErr).toBe(true)
    expect((unwrapErr(result) as OctaveValidationFailure).field).toBe('octaves')
  })

  it('rejects a non-array value with a typed failure naming the octaves field', () => {
    const result = validateOctaves('2,4,6')
    expect(result.isErr).toBe(true)
    expect((unwrapErr(result) as OctaveValidationFailure).field).toBe('octaves')
  })

  it('rejects an out-of-range octave below the minimum with a typed failure', () => {
    const result = validateOctaves(['1'])
    expect(result.isErr).toBe(true)
    expect((unwrapErr(result) as OctaveValidationFailure).field).toBe('octaves')
  })

  it('rejects an out-of-range octave above the maximum with a typed failure', () => {
    const result = validateOctaves(['7'])
    expect(result.isErr).toBe(true)
    expect((unwrapErr(result) as OctaveValidationFailure).field).toBe('octaves')
  })

  it('rejects a non-numeric string element with a typed failure', () => {
    const result = validateOctaves(['x'])
    expect(result.isErr).toBe(true)
    expect((unwrapErr(result) as OctaveValidationFailure).field).toBe('octaves')
  })

  it('rejects when one valid and one out-of-range octave are mixed', () => {
    const result = validateOctaves(['4', '9'])
    expect(result.isErr).toBe(true)
    expect((unwrapErr(result) as OctaveValidationFailure).field).toBe('octaves')
  })
})

describe('expandOctaveRange', () => {
  it('returns the min and max of the selected octaves', () => {
    expect(expandOctaveRange([2, 5])).toEqual({ min: 2, max: 5 })
  })

  it('returns min === max for a single octave', () => {
    expect(expandOctaveRange([3])).toEqual({ min: 3, max: 3 })
  })

  it('returns the contiguous min/max regardless of input order', () => {
    expect(expandOctaveRange([5, 2, 3])).toEqual({ min: 2, max: 5 })
  })
})

describe('deriveScaleRangePitches', () => {
  it('produces the tonic-to-tonic pitch set for C major octave 4', () => {
    expect(deriveScaleRangePitches('C major', 4)).toEqual([
      'C4',
      'D4',
      'E4',
      'F4',
      'G4',
      'A4',
      'B4',
      'C5',
    ])
  })

  it('produces the tonic-to-tonic pitch set for D major octave 4 using key spelling', () => {
    expect(deriveScaleRangePitches('D major', 4)).toEqual([
      'D4',
      'E4',
      'F-sharp4',
      'G4',
      'A4',
      'B4',
      'C-sharp5',
      'D5',
    ])
  })

  it('produces the tonic-to-tonic pitch set for E-flat major octave 4 using flat spelling', () => {
    expect(deriveScaleRangePitches('E-flat major', 4)).toEqual([
      'E-flat4',
      'F4',
      'G4',
      'A-flat4',
      'B-flat4',
      'C5',
      'D5',
      'E-flat5',
    ])
  })

  it('produces eight pitches tonic-to-tonic for every supported key and octave', () => {
    const keys = [
      'C major',
      'G major',
      'D major',
      'A major',
      'E major',
      'F major',
      'B-flat major',
      'E-flat major',
      'A-flat major',
      'A minor',
      'E minor',
      'B minor',
      'F-sharp minor',
      'C-sharp minor',
      'D minor',
      'G minor',
      'C minor',
      'F minor',
    ]
    for (const key of keys) {
      for (let octave = 2; octave <= 6; octave += 1) {
        const pitches = deriveScaleRangePitches(key, octave)
        expect(pitches.length).toBe(8)
        // The first pitch is the tonic at the given octave; the last is the
        // tonic at octave + 1 (tonic-to-tonic).
        const tonicName = pitches[0].replace(/\d+$/, '')
        expect(pitches[0]).toBe(`${tonicName}${octave}`)
        expect(pitches[7]).toBe(`${tonicName}${octave + 1}`)
      }
    }
  })
})

describe('deriveAvailablePitches', () => {
  it('covers the continuous expansion from octave 2 through 5 for C major [2,5]', () => {
    const result = deriveAvailablePitches('C major', [2, 5])
    expect(result.lowest).toBe('C2')
    expect(result.highest).toBe('C6')
    // No octave-7 pitches appear because the range tops at C6.
    expect(result.pitches.every((p: string) => !/-?7$/.test(p))).toBe(true)
    // The set is continuous: every octave from 2 through 5 is represented.
    expect(result.pitches).toContain('C2')
    expect(result.pitches).toContain('C3')
    expect(result.pitches).toContain('C4')
    expect(result.pitches).toContain('C5')
    expect(result.pitches).toContain('C6')
  })

  it('includes C7 as the top pitch for C major octaves 2 through 6 (C in key, C7 at top)', () => {
    const result = deriveAvailablePitches('C major', [2, 3, 4, 5, 6])
    expect(result.lowest).toBe('C2')
    expect(result.highest).toBe('C7')
    expect(result.pitches).toContain('C7')
  })

  it('includes C7 for G major octaves 2 through 6 (C in key, C7 inside range)', () => {
    const result = deriveAvailablePitches('G major', [2, 3, 4, 5, 6])
    expect(result.pitches).toContain('C7')
    // Every other octave-7 pitch is excluded even though it falls inside the
    // expanded range.
    expect(result.pitches).not.toContain('D7')
    expect(result.pitches).not.toContain('E7')
    expect(result.pitches).not.toContain('F-sharp7')
    expect(result.pitches).not.toContain('G7')
    expect(result.highest).toBe('C7')
  })

  it('leaves C7 absent for B-flat major [2,3,4,5] (C in key, C7 one step outside)', () => {
    const result = deriveAvailablePitches('B-flat major', [2, 3, 4, 5])
    expect(result.pitches).not.toContain('C7')
    expect(result.highest).toBe('B-flat6')
    expect(result.lowest).toBe('B-flat2')
  })

  it('leaves C7 absent for D major [2,3,4,5,6] (C not in key, range reaches octave 7)', () => {
    const result = deriveAvailablePitches('D major', [2, 3, 4, 5, 6])
    expect(result.pitches).not.toContain('C7')
    // The octave-6 range of D major crosses the B-to-C boundary, so its
    // seventh degree (C-sharp) and top tonic (D) both land in octave 7
    // (C-sharp7 and D7). Both are octave-7 pitches other than C7 and are
    // excluded, leaving B6 as the highest available pitch.
    expect(result.pitches).not.toContain('C-sharp7')
    expect(result.pitches).not.toContain('D7')
    expect(result.highest).toBe('B6')
    expect(result.lowest).toBe('D2')
  })

  it('leaves C7 absent for F-sharp minor [2,3,4,5,6] (C not in key)', () => {
    const result = deriveAvailablePitches('F-sharp minor', [2, 3, 4, 5, 6])
    expect(result.pitches).not.toContain('C7')
    // The octave-6 range of F-sharp minor crosses the B-to-C boundary, so
    // C-sharp7, D7, E7, and the top tonic F-sharp7 all land in octave 7 and
    // are excluded, leaving B6 as the highest available pitch.
    expect(result.pitches).not.toContain('F-sharp7')
    expect(result.pitches).not.toContain('E7')
    expect(result.highest).toBe('B6')
    expect(result.lowest).toBe('F-sharp2')
  })

  it('excludes every octave-7 pitch other than C7 for A minor octaves 2 through 6', () => {
    // A minor contains C natural, so C7 is available; A7 and B7 are excluded.
    const result = deriveAvailablePitches('A minor', [2, 3, 4, 5, 6])
    expect(result.pitches).toContain('C7')
    expect(result.pitches).not.toContain('A7')
    expect(result.pitches).not.toContain('B7')
    expect(result.highest).toBe('C7')
  })

  it('produces identical pitches for canonical and arbitrary-order submissions', () => {
    const canonical = deriveAvailablePitches('C major', [2, 3, 5])
    const shuffled = deriveAvailablePitches('C major', [5, 2, 3])
    expect(shuffled.pitches).toEqual(canonical.pitches)
    expect(shuffled.lowest).toBe(canonical.lowest)
    expect(shuffled.highest).toBe(canonical.highest)
  })
})
