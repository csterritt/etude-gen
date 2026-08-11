// ====================================
// Tests for the Issue 15 duration-disabled-set algorithm: the pure function
// `computeDisabledDurations` that returns the duration tokens whose
// deselection from the current selection would leave no eligible
// complete-measure pattern. A pattern is eligible when every token it
// contains is in the selected set.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'

import { computeDisabledDurations } from '../src/lib/duration-disabled-set'

describe('computeDisabledDurations', () => {
  it('marks a token disabled when removing it eliminates every eligible pattern', () => {
    // Patterns: [E, R] and [E, E, E, E]. Both require E, so removing E
    // leaves no eligible pattern. Removing R still leaves [E, E, E, E].
    const patterns = [['E', 'R'], ['E', 'E', 'E', 'E']]
    const selected = new Set(['E', 'R'])
    expect(computeDisabledDurations(selected, patterns)).toEqual(['E'])
  })

  it('returns an empty disabled set when every selected token can be removed and a pattern remains', () => {
    // Patterns: [E] and [Q]. Selecting both: removing E leaves [Q] eligible,
    // removing Q leaves [E] eligible. Nothing is disabled.
    const patterns = [['E'], ['Q']]
    const selected = new Set(['E', 'Q'])
    expect(computeDisabledDurations(selected, patterns)).toEqual([])
  })

  it('marks the only selected token as disabled (removing it leaves the empty set)', () => {
    // Single selected token: removing it leaves an empty selection, which
    // admits no eligible pattern.
    const patterns = [['E', 'R'], ['E', 'E', 'E', 'E']]
    const selected = new Set(['E'])
    expect(computeDisabledDurations(selected, patterns)).toEqual(['E'])
  })

  it('marks multiple tokens disabled when each is individually required', () => {
    // Pattern: [Q, Q, E, R] only. Selecting Q, E, R: removing any one leaves
    // no eligible pattern because the single pattern requires all three.
    const patterns = [['Q', 'Q', 'E', 'R']]
    const selected = new Set(['Q', 'E', 'R'])
    expect(computeDisabledDurations(selected, patterns)).toEqual(['Q', 'R', 'E'])
  })

  it('marks only the required token when one of two patterns shares a dependency', () => {
    // Patterns: [E, Q] and [Q, R]. Selecting E, Q, R:
    // - removing E: {Q, R} -> [Q, R] eligible -> E not disabled
    // - removing Q: {E, R} -> none eligible -> Q disabled
    // - removing R: {E, Q} -> [E, Q] eligible -> R not disabled
    const patterns = [['E', 'Q'], ['Q', 'R']]
    const selected = new Set(['E', 'Q', 'R'])
    expect(computeDisabledDurations(selected, patterns)).toEqual(['Q'])
  })

  it('returns disabled tokens in canonical order regardless of selection order', () => {
    // Patterns: [W, H] and [Q, E]. Selecting all four: removing any one
    // leaves the other pattern still eligible, so nothing is disabled.
    // Use a pattern that requires all to force all disabled and check order.
    // Pattern: [W, H, Q] only. Selecting W, H, Q: all three are required.
    // Canonical order is W, H, D, Q, R, E — so [W, H, Q].
    const patterns = [['W', 'H', 'Q']]
    const selected = new Set(['Q', 'H', 'W'])
    expect(computeDisabledDurations(selected, patterns)).toEqual(['W', 'H', 'Q'])
  })

  it('does not mutate the selectedTokens set', () => {
    const patterns = [['E', 'R'], ['E', 'E', 'E', 'E']]
    const selected = new Set(['E', 'R'])
    const snapshot = new Set(selected)
    computeDisabledDurations(selected, patterns)
    expect(selected).toEqual(snapshot)
  })

  it('does not mutate the patterns array', () => {
    const patterns = [['E', 'R'], ['E', 'E', 'E', 'E']]
    const snapshot = patterns.map((p) => [...p])
    computeDisabledDurations(new Set(['E', 'R']), patterns)
    expect(patterns).toEqual(snapshot)
  })

  it('returns an empty array when there are no patterns (nothing is required)', () => {
    const selected = new Set(['E', 'Q'])
    expect(computeDisabledDurations(selected, [])).toEqual([])
  })

  it('returns an empty array when the selection is empty', () => {
    const patterns = [['E', 'R']]
    expect(computeDisabledDurations(new Set(), patterns)).toEqual([])
  })

  it('does not mark a token disabled if a pattern uses only that token and it remains', () => {
    // Patterns: [E, R] and [Q]. Selecting E, R, Q:
    // - removing E: {R, Q} -> [Q] eligible -> E not disabled
    // - removing R: {E, Q} -> [Q] eligible -> R not disabled
    // - removing Q: {E, R} -> [E, R] eligible -> Q not disabled
    const patterns = [['E', 'R'], ['Q']]
    const selected = new Set(['E', 'R', 'Q'])
    expect(computeDisabledDurations(selected, patterns)).toEqual([])
  })

  it('handles a token in the selection that appears in no pattern (not disabled)', () => {
    // Patterns: [E, E, E, E]. Selecting E and Q (Q appears in no pattern):
    // - removing E: {Q} -> no eligible pattern -> E disabled
    // - removing Q: {E} -> [E, E, E, E] eligible -> Q not disabled
    const patterns = [['E', 'E', 'E', 'E']]
    const selected = new Set(['E', 'Q'])
    expect(computeDisabledDurations(selected, patterns)).toEqual(['E'])
  })
})
