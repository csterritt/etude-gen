// ====================================
// Tests for validatePitchSelection and resolvePitchSelectionState — pure
// functions encoding the Issue 13 pitch-selection rules: the cardinality
// minimums (one pitch for one-hand mode, two for two-hand mode with the exact
// message), the rejection of pitches outside the derived available set, the
// hostile-shape tolerance, and the first-derivation / non-re-expansion
// semantics for the stored selection.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'

import {
  validatePitchSelection,
  resolvePitchSelectionState,
} from '../src/lib/pitch-selection-validator'
import type { PitchSelectionFailure } from '../src/lib/pitch-selection-validator'

const unwrap = <T>(result: { isOk: boolean; value?: T; error?: unknown }): T => {
  if (result.isOk) {
    return result.value as T
  }
  throw new Error(`Expected Ok, got Err: ${JSON.stringify(result.error)}`)
}

const unwrapErr = <E>(result: { isOk: boolean; value?: unknown; error?: E }): E => {
  if (!result.isOk) {
    return result.error as E
  }
  throw new Error(`Expected Err, got Ok: ${JSON.stringify(result.value)}`)
}

const AVAILABLE = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']

describe('validatePitchSelection', () => {
  it('is a pure function: does not mutate its arguments or throw', () => {
    const submitted = ['C4', 'D4']
    const available = [...AVAILABLE]
    const snapshot = [...submitted]
    const availSnapshot = [...available]
    expect(() => validatePitchSelection(submitted, available, 'both')).not.toThrow()
    expect(submitted).toEqual(snapshot)
    expect(available).toEqual(availSnapshot)
  })

  it('one-hand mode: zero pitches is rejected', () => {
    const result = validatePitchSelection([], AVAILABLE, 'right')
    expect(result.isOk).toBe(false)
    const failures = unwrapErr<PitchSelectionFailure[]>(result)
    expect(failures.length).toBeGreaterThanOrEqual(1)
    expect(failures.every((f) => f.field === 'pitches')).toBe(true)
  })

  it('one-hand mode: one pitch is accepted', () => {
    const result = validatePitchSelection(['C4'], AVAILABLE, 'right')
    expect(result.isOk).toBe(true)
    expect(unwrap(result)).toEqual(['C4'])
  })

  it('one-hand mode: multiple pitches are accepted', () => {
    const result = validatePitchSelection(['C4', 'D4', 'E4'], AVAILABLE, 'left')
    expect(result.isOk).toBe(true)
    expect(unwrap(result)).toEqual(['C4', 'D4', 'E4'])
  })

  it('two-hand mode: zero pitches is rejected', () => {
    const result = validatePitchSelection([], AVAILABLE, 'both')
    expect(result.isOk).toBe(false)
    const failures = unwrapErr<PitchSelectionFailure[]>(result)
    expect(failures.length).toBeGreaterThanOrEqual(1)
    expect(failures.every((f) => f.field === 'pitches')).toBe(true)
  })

  it('two-hand mode: one pitch is rejected with the exact two-hand message', () => {
    const result = validatePitchSelection(['C4'], AVAILABLE, 'both')
    expect(result.isOk).toBe(false)
    const failures = unwrapErr<PitchSelectionFailure[]>(result)
    const twoHandFailure = failures.find(
      (f) => f.reason === 'Select at least two pitches when using both hands.',
    )
    expect(twoHandFailure).toBeDefined()
    expect(twoHandFailure!.field).toBe('pitches')
  })

  it('two-hand mode: two pitches are accepted', () => {
    const result = validatePitchSelection(['C4', 'D4'], AVAILABLE, 'both')
    expect(result.isOk).toBe(true)
    expect(unwrap(result)).toEqual(['C4', 'D4'])
  })

  it('rejects a submitted pitch not in the available set', () => {
    const result = validatePitchSelection(['C4', 'F-sharp5'], AVAILABLE, 'right')
    expect(result.isOk).toBe(false)
    const failures = unwrapErr<PitchSelectionFailure[]>(result)
    const unavailableFailure = failures.find((f) =>
      f.reason.includes('F-sharp5'),
    )
    expect(unavailableFailure).toBeDefined()
    expect(unavailableFailure!.field).toBe('pitches')
  })

  it('accepts a submitted pitch that is available', () => {
    const result = validatePitchSelection(['C4', 'G4'], AVAILABLE, 'right')
    expect(result.isOk).toBe(true)
    expect(unwrap(result)).toEqual(['C4', 'G4'])
  })

  it('deduplicates duplicate submitted pitches', () => {
    const result = validatePitchSelection(['C4', 'C4', 'D4', 'D4'], AVAILABLE, 'both')
    expect(result.isOk).toBe(true)
    expect(unwrap(result)).toEqual(['C4', 'D4'])
  })

  it('normalizes reordered submitted pitches to available-set order', () => {
    const result = validatePitchSelection(['D4', 'C4', 'E4'], AVAILABLE, 'right')
    expect(result.isOk).toBe(true)
    expect(unwrap(result)).toEqual(['C4', 'D4', 'E4'])
  })

  it('rejects a non-array submission (null) without throwing', () => {
    expect(() => validatePitchSelection(null, AVAILABLE, 'right')).not.toThrow()
    const result = validatePitchSelection(null, AVAILABLE, 'right')
    expect(result.isOk).toBe(false)
    const failures = unwrapErr<PitchSelectionFailure[]>(result)
    expect(failures.length).toBeGreaterThanOrEqual(1)
    expect(failures.every((f) => f.field === 'pitches')).toBe(true)
  })

  it('rejects a non-array submission (undefined) without throwing', () => {
    expect(() => validatePitchSelection(undefined, AVAILABLE, 'right')).not.toThrow()
    const result = validatePitchSelection(undefined, AVAILABLE, 'right')
    expect(result.isOk).toBe(false)
  })

  it('rejects a non-array submission (a string) without throwing', () => {
    expect(() => validatePitchSelection('C4', AVAILABLE, 'right')).not.toThrow()
    const result = validatePitchSelection('C4', AVAILABLE, 'right')
    expect(result.isOk).toBe(false)
  })

  it('rejects a non-array submission (a number) without throwing', () => {
    expect(() => validatePitchSelection(42, AVAILABLE, 'right')).not.toThrow()
    const result = validatePitchSelection(42, AVAILABLE, 'right')
    expect(result.isOk).toBe(false)
  })

  it('rejects any submission when the available set is empty', () => {
    const result = validatePitchSelection(['C4'], [], 'right')
    expect(result.isOk).toBe(false)
    const failures = unwrapErr<PitchSelectionFailure[]>(result)
    expect(failures.length).toBeGreaterThanOrEqual(1)
  })

  it('two-hand mode with only one available pitch is rejected (cannot satisfy minimum)', () => {
    const result = validatePitchSelection(['C4'], ['C4'], 'both')
    expect(result.isOk).toBe(false)
    const failures = unwrapErr<PitchSelectionFailure[]>(result)
    const twoHandFailure = failures.find(
      (f) => f.reason === 'Select at least two pitches when using both hands.',
    )
    expect(twoHandFailure).toBeDefined()
  })

  it('stringifies non-string array elements then trims them', () => {
    const result = validatePitchSelection([42, 'C4'] as unknown as unknown[], AVAILABLE, 'both')
    // 42 is stringified to "42" which is not in AVAILABLE, so it is an
    // unavailable-pitch failure. The result is deterministic (reject) and
    // never a thrown exception.
    expect(result.isOk).toBe(false)
  })
})

describe('resolvePitchSelectionState', () => {
  it('is a pure function: does not mutate its arguments or throw', () => {
    const available = [...AVAILABLE]
    const snapshot = [...available]
    expect(() => resolvePitchSelectionState(null, available)).not.toThrow()
    expect(available).toEqual(snapshot)
  })

  it('null stored pitches: first derivation preselects all available pitches', () => {
    const result = resolvePitchSelectionState(null, AVAILABLE)
    expect(result.selectedPitches).toEqual(AVAILABLE)
    expect(result.isFirstDerivation).toBe(true)
  })

  it('stored narrowed selection is not re-expanded', () => {
    const result = resolvePitchSelectionState('C4,D4', AVAILABLE)
    expect(result.selectedPitches).toEqual(['C4', 'D4'])
    expect(result.isFirstDerivation).toBe(false)
  })

  it('stored single-pitch selection is shown as-is', () => {
    const result = resolvePitchSelectionState('C4', AVAILABLE)
    expect(result.selectedPitches).toEqual(['C4'])
    expect(result.isFirstDerivation).toBe(false)
  })

  it('empty string stored pitches is treated as null (first derivation)', () => {
    const result = resolvePitchSelectionState('', AVAILABLE)
    expect(result.selectedPitches).toEqual(AVAILABLE)
    expect(result.isFirstDerivation).toBe(true)
  })

  it('whitespace-only stored pitches is treated as null (first derivation)', () => {
    const result = resolvePitchSelectionState('   ', AVAILABLE)
    expect(result.selectedPitches).toEqual(AVAILABLE)
    expect(result.isFirstDerivation).toBe(true)
  })

  it('unavailable stored pitches are filtered out, available ones retained', () => {
    const result = resolvePitchSelectionState('C4,D4', ['C4'])
    expect(result.selectedPitches).toEqual(['C4'])
    expect(result.isFirstDerivation).toBe(false)
  })

  it('all stored pitches unavailable yields empty selection (not first derivation)', () => {
    const result = resolvePitchSelectionState('D4,E4', ['C4'])
    expect(result.selectedPitches).toEqual([])
    expect(result.isFirstDerivation).toBe(false)
  })

  it('stored pitches with surrounding whitespace are trimmed', () => {
    const result = resolvePitchSelectionState(' C4 , D4 ', AVAILABLE)
    expect(result.selectedPitches).toEqual(['C4', 'D4'])
    expect(result.isFirstDerivation).toBe(false)
  })

  it('preserves available-set order for stored pitches', () => {
    const result = resolvePitchSelectionState('D4,C4', AVAILABLE)
    expect(result.selectedPitches).toEqual(['C4', 'D4'])
    expect(result.isFirstDerivation).toBe(false)
  })
})
