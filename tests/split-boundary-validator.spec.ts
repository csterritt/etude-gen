// ====================================
// Tests for the split-boundary validator (Issue 16).
// Verifies that validateSplitBoundary accepts an eligible boundary id and
// returns the left/right assignment, rejects a non-string, an empty string,
// an unknown/tampered id, and any submission when no boundaries are eligible
// (fewer than two selected pitches); and that resolveSplitBoundaryState
// discards a stored boundary that is no longer eligible rather than
// preselecting an ineligible option.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'
import Result from 'true-myth/result'

import { deriveEligibleBoundaries } from '../src/lib/music-domain'
import {
  validateSplitBoundary,
  resolveSplitBoundaryState,
  EMPTY_BOUNDARY_MESSAGE,
  INELIGIBLE_BOUNDARY_MESSAGE,
  type SplitBoundaryFailure,
} from '../src/lib/split-boundary-validator'

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

// Three selected pitches → two eligible boundaries.
const THREE_PITCHES = ['C4', 'E4', 'G4']
const BOUNDARIES = deriveEligibleBoundaries(THREE_PITCHES)

describe('validateSplitBoundary', () => {
  it('accepts a submitted id that matches an eligible boundary and returns the boundary', () => {
    const target = BOUNDARIES[0]!
    const result = validateSplitBoundary(target.id, BOUNDARIES)
    expect(result.isOk).toBe(true)
    const b = unwrap(result)
    expect(b.id).toBe(target.id)
    expect(b.left).toEqual(['C4'])
    expect(b.right).toEqual(['E4', 'G4'])
  })

  it('accepts the second eligible boundary and returns its left/right assignment', () => {
    const target = BOUNDARIES[1]!
    const result = validateSplitBoundary(target.id, BOUNDARIES)
    expect(result.isOk).toBe(true)
    const b = unwrap(result)
    expect(b.left).toEqual(['C4', 'E4'])
    expect(b.right).toEqual(['G4'])
  })

  it('rejects null with a field-addressable failure on boundary', () => {
    const result = validateSplitBoundary(null, BOUNDARIES)
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result) as SplitBoundaryFailure[]
    expect(failures.length).toBeGreaterThan(0)
    expect(failures[0]!.field).toBe('boundary')
  })

  it('rejects undefined with a field-addressable failure on boundary', () => {
    const result = validateSplitBoundary(undefined, BOUNDARIES)
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result) as SplitBoundaryFailure[]
    expect(failures[0]!.field).toBe('boundary')
  })

  it('rejects a number with a field-addressable failure on boundary', () => {
    const result = validateSplitBoundary(42, BOUNDARIES)
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result) as SplitBoundaryFailure[]
    expect(failures[0]!.field).toBe('boundary')
  })

  it('rejects an array with a field-addressable failure on boundary', () => {
    const result = validateSplitBoundary(['C4|E4'], BOUNDARIES)
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result) as SplitBoundaryFailure[]
    expect(failures[0]!.field).toBe('boundary')
  })

  it('rejects an object with a field-addressable failure on boundary', () => {
    const result = validateSplitBoundary({ id: 'C4|E4' }, BOUNDARIES)
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result) as SplitBoundaryFailure[]
    expect(failures[0]!.field).toBe('boundary')
  })

  it('rejects an empty string with the empty-selection message', () => {
    const result = validateSplitBoundary('', BOUNDARIES)
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result) as SplitBoundaryFailure[]
    expect(failures[0]!.field).toBe('boundary')
    expect(failures[0]!.reason).toBe(EMPTY_BOUNDARY_MESSAGE)
  })

  it('rejects a whitespace-only string with the empty-selection message', () => {
    const result = validateSplitBoundary('   ', BOUNDARIES)
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result) as SplitBoundaryFailure[]
    expect(failures[0]!.reason).toBe(EMPTY_BOUNDARY_MESSAGE)
  })

  it('rejects an id that is not among the eligible boundaries (stale or tampered)', () => {
    const result = validateSplitBoundary('A4|B4', BOUNDARIES)
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result) as SplitBoundaryFailure[]
    expect(failures[0]!.field).toBe('boundary')
    expect(failures[0]!.reason).toBe(INELIGIBLE_BOUNDARY_MESSAGE)
  })

  it('rejects any submission when the eligible boundary list is empty', () => {
    const empty = deriveEligibleBoundaries(['C4'])
    expect(empty).toEqual([])
    const result = validateSplitBoundary('C4|D4', empty)
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result) as SplitBoundaryFailure[]
    expect(failures[0]!.field).toBe('boundary')
  })

  it('trims a submitted id before matching', () => {
    const target = BOUNDARIES[0]!
    const result = validateSplitBoundary(`  ${target.id}  `, BOUNDARIES)
    expect(result.isOk).toBe(true)
    expect(unwrap(result).id).toBe(target.id)
  })

  it('is pure: does not mutate its arguments', () => {
    const snapshot = [...BOUNDARIES]
    validateSplitBoundary(BOUNDARIES[0]!.id, BOUNDARIES)
    expect(BOUNDARIES).toEqual(snapshot)
  })
})

describe('resolveSplitBoundaryState', () => {
  it('returns no preselected boundary on a first derivation (stored is null)', () => {
    const state = resolveSplitBoundaryState(null, BOUNDARIES)
    expect(state.selectedBoundaryId).toBeNull()
    expect(state.isFirstDerivation).toBe(true)
  })

  it('returns no preselected boundary when stored is an empty string', () => {
    const state = resolveSplitBoundaryState('', BOUNDARIES)
    expect(state.selectedBoundaryId).toBeNull()
    expect(state.isFirstDerivation).toBe(true)
  })

  it('returns no preselected boundary when stored is a whitespace-only string', () => {
    const state = resolveSplitBoundaryState('   ', BOUNDARIES)
    expect(state.selectedBoundaryId).toBeNull()
    expect(state.isFirstDerivation).toBe(true)
  })

  it('preselects a stored boundary that is still eligible', () => {
    const target = BOUNDARIES[1]!
    const state = resolveSplitBoundaryState(target.id, BOUNDARIES)
    expect(state.selectedBoundaryId).toBe(target.id)
    expect(state.isFirstDerivation).toBe(false)
  })

  it('trims a stored boundary id before matching', () => {
    const target = BOUNDARIES[0]!
    const state = resolveSplitBoundaryState(`  ${target.id}  `, BOUNDARIES)
    expect(state.selectedBoundaryId).toBe(target.id)
    expect(state.isFirstDerivation).toBe(false)
  })

  it('discards a stored boundary that is no longer eligible and preselects nothing', () => {
    // A stale boundary from a prior, wider pitch selection.
    const state = resolveSplitBoundaryState('A4|B4', BOUNDARIES)
    expect(state.selectedBoundaryId).toBeNull()
    expect(state.isFirstDerivation).toBe(false)
  })

  it('discards a stored boundary when the eligible list is now empty', () => {
    const empty = deriveEligibleBoundaries(['C4'])
    const state = resolveSplitBoundaryState('C4|D4', empty)
    expect(state.selectedBoundaryId).toBeNull()
    expect(state.isFirstDerivation).toBe(false)
  })

  it('is pure: does not mutate its arguments', () => {
    const snapshot = [...BOUNDARIES]
    resolveSplitBoundaryState(BOUNDARIES[0]!.id, BOUNDARIES)
    expect(BOUNDARIES).toEqual(snapshot)
  })
})
