// ====================================
// Tests for computeEligibleRhythms: the eligible-rhythm calculation that
// returns only patterns whose every token is in the selected duration set.
// Verifies that, given a parsed catalog, a meter, and a set of selected
// duration tokens, only patterns whose every token is selected are
// returned; that a selection with no qualifying pattern returns an empty
// array rather than throwing or returning an error; and that the eligible
// set contains no duplicate patterns (because the parsed catalog is
// already de-duplicated).
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'
import Result from 'true-myth/result'

import { parseRhythmCatalog, computeEligibleRhythms } from '../src/lib/rhythm-catalog'

const unwrap = <T, E>(result: Result<T, E>): T => {
  if (!result.isOk) {
    throw new Error(`Expected Ok, got Err: ${JSON.stringify(result.error)}`)
  }
  return result.value
}

// A small synthetic catalog covering the 2/4 patterns used by the tests,
// plus one pattern each for 3/4 and 4/4 so the catalog validates.
const CATALOG_TEXT = ['2/4', 'QQ', 'EEEE', 'ER', 'H', '3/4', 'QQQ', '4/4', 'QQQQ'].join('\n')

const buildCatalog = () => unwrap(parseRhythmCatalog(CATALOG_TEXT))

describe('computeEligibleRhythms - token-selection filter', () => {
  it('returns only patterns whose every token is in the selected set', () => {
    const catalog = buildCatalog()
    expect(computeEligibleRhythms(catalog, '2/4', new Set(['Q']))).toEqual(['QQ'])
  })

  it('returns multiple patterns when all their tokens are selected', () => {
    const catalog = buildCatalog()
    expect(computeEligibleRhythms(catalog, '2/4', new Set(['E', 'R']))).toEqual(['EEEE', 'ER'])
  })

  it('returns a single-token pattern when only that token is selected', () => {
    const catalog = buildCatalog()
    expect(computeEligibleRhythms(catalog, '2/4', new Set(['H']))).toEqual(['H'])
  })

  it('returns an empty array when no pattern qualifies, rather than throwing', () => {
    const catalog = buildCatalog()
    // D (dotted half = 3 quarter beats) cannot form a 2/4 measure alone, so
    // no 2/4 pattern uses only D.
    const result = computeEligibleRhythms(catalog, '2/4', new Set(['D']))
    expect(result).toEqual([])
    expect(Array.isArray(result)).toBe(true)
  })

  it('returns an empty array for a meter with patterns but a disjoint selection', () => {
    const catalog = buildCatalog()
    expect(computeEligibleRhythms(catalog, '2/4', new Set(['W']))).toEqual([])
  })

  it('returns an empty array for an unsupported meter rather than throwing', () => {
    const catalog = buildCatalog()
    expect(computeEligibleRhythms(catalog, '5/4', new Set(['Q']))).toEqual([])
  })

  it('the eligible set contains no duplicate patterns', () => {
    const catalog = buildCatalog()
    const result = computeEligibleRhythms(catalog, '2/4', new Set(['E', 'R', 'Q', 'H']))
    expect(new Set(result).size).toBe(result.length)
  })

  it('does not mutate its arguments', () => {
    const catalog = buildCatalog()
    const selected = new Set(['Q'])
    const snapshot = new Set(selected)
    computeEligibleRhythms(catalog, '2/4', selected)
    expect(selected).toEqual(snapshot)
  })
})
