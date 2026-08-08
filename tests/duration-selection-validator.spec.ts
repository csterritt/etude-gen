// ====================================
// Tests for the Issue 14 duration-selection rules: the offerable duration
// set per meter, validateDurationSelection (duplicate de-dup, canonical
// ordering, unknown/not-offerable rejection, empty rejection, eligibility
// with corrective suggestion), computeCorrectiveSuggestion (the smallest set
// of additional offered durations that restores eligibility), and
// resolveDurationSelectionState (all-offerable first-derivation default,
// non-re-expansion of a stored narrowed selection, re-derivation after an
// Issue 11 clear).
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'
import Result from 'true-myth/result'

import {
  computeOfferableDurations,
  computeCorrectiveSuggestion,
  validateDurationSelection,
  resolveDurationSelectionState,
  EMPTY_DURATION_MESSAGE,
  type DurationSelectionFailure,
} from '../src/lib/duration-selection-validator'
import { parseRhythmCatalog } from '../src/lib/rhythm-catalog'

const unwrap = <T, E>(result: Result<T, E>): T => {
  if (!result.isOk) {
    throw new Error(`Expected Ok, got Err: ${JSON.stringify(result.error)}`)
  }
  return result.value
}

const unwrapErr = <E>(result: { isOk: boolean; value?: unknown; error?: E }): E => {
  if (!result.isOk) {
    return result.error as E
  }
  throw new Error(`Expected Err, got Ok: ${JSON.stringify(result.value)}`)
}

// A small synthetic catalog that validates and keeps the compatibility cases
// tractable:
// - 2/4 patterns are ER and EEEE (tokens E and R appear)
// - 3/4 pattern is D (only token D appears)
// - 4/4 pattern is QQER (tokens Q, E, and R appear)
// So offerability per meter is predictable: 2/4 -> [R, E], 3/4 -> [D],
// 4/4 -> [Q, R, E] in the module's canonical order.
const CATALOG_TEXT = ['2/4', 'ER', 'EEEE', '3/4', 'D', '4/4', 'QQER'].join('\n')

const buildCatalog = () => unwrap(parseRhythmCatalog(CATALOG_TEXT))

describe('computeOfferableDurations', () => {
  it('returns exactly the distinct duration tokens present in that meter patterns, in canonical order', () => {
    const catalog = buildCatalog()
    expect(computeOfferableDurations(catalog, '2/4')).toEqual(['R', 'E'])
    expect(computeOfferableDurations(catalog, '3/4')).toEqual(['D'])
    expect(computeOfferableDurations(catalog, '4/4')).toEqual(['Q', 'R', 'E'])
  })

  it('a token present in one meter but absent from another is offerable for the former and not the latter', () => {
    const catalog = buildCatalog()
    // E appears in the 2/4 and 4/4 patterns but not in 3/4.
    const twoFour = computeOfferableDurations(catalog, '2/4')
    const threeFour = computeOfferableDurations(catalog, '3/4')
    expect(twoFour).toContain('E')
    expect(threeFour).not.toContain('E')
  })

  it('returns no duplicates and is filtered to supported tokens only', () => {
    const catalog = buildCatalog()
    const result = computeOfferableDurations(catalog, '2/4')
    expect(new Set(result).size).toBe(result.length)
    const supported = new Set(['W', 'H', 'D', 'Q', 'R', 'E'])
    expect(result.every((t) => supported.has(t))).toBe(true)
  })

  it('returns an empty array for an unsupported meter', () => {
    const catalog = buildCatalog()
    expect(computeOfferableDurations(catalog, '5/4')).toEqual([])
  })
})

const failuresFor = (
  submitted: unknown,
  meter: string,
): DurationSelectionFailure[] => {
  const result = validateDurationSelection(submitted, buildCatalog(), meter)
  if (result.isOk) {
    throw new Error(`Expected Err, got Ok: ${JSON.stringify(result.value)}`)
  }
  return result.error
}

describe('validateDurationSelection', () => {
  it('is a pure function: does not mutate its arguments, touch the DB, or throw for any input', () => {
    const catalog = buildCatalog()
    const submitted = ['E', 'E', 'R']
    const snapshot = [...submitted]
    expect(() => validateDurationSelection(submitted, catalog, '2/4')).not.toThrow()
    expect(submitted).toEqual(snapshot)
    expect(() => validateDurationSelection(null, catalog, '2/4')).not.toThrow()
    expect(() => validateDurationSelection(42, catalog, '2/4')).not.toThrow()
    expect(() => validateDurationSelection('E', catalog, '2/4')).not.toThrow()
    expect(() => validateDurationSelection(undefined, catalog, '2/4')).not.toThrow()
  })

  it('rejects a non-array submitted value with the empty-selection message on the durations field', () => {
    for (const bad of [null, undefined, 'E', 42]) {
      const failures = failuresFor(bad, '2/4')
      expect(failures.some((f) => f.reason === EMPTY_DURATION_MESSAGE)).toBe(true)
      expect(failures.every((f) => f.field === 'durations')).toBe(true)
    }
  })

  it('rejects an empty or all-whitespace set with the empty-selection message', () => {
    for (const bad of [[], [' '], ['', ''], ['  ']]) {
      const failures = failuresFor(bad, '2/4')
      expect(failures.some((f) => f.reason === EMPTY_DURATION_MESSAGE)).toBe(true)
      expect(failures.every((f) => f.field === 'durations')).toBe(true)
    }
  })

  it('de-duplicates duplicate submissions of the same offerable token and accepts them as a single entry', () => {
    const result = validateDurationSelection(['E', 'E', 'R', 'R'], buildCatalog(), '2/4')
    expect(result.isOk).toBe(true)
    // EEEE is eligible, so the de-duplicated set is accepted.
    expect(unwrap(result)).toEqual(['R', 'E'])
  })

  it('normalizes a reordered submission to canonical order', () => {
    const result = validateDurationSelection(['E', 'R'], buildCatalog(), '2/4')
    expect(result.isOk).toBe(true)
    expect(unwrap(result)).toEqual(['R', 'E'])
  })

  it('rejects an unknown token with a field-addressable failure naming the token', () => {
    const failures = failuresFor(['E', 'X'], '2/4')
    const unknown = failures.find((f) => f.reason.includes('X'))
    expect(unknown).toBeDefined()
    expect(unknown!.field).toBe('durations')
  })

  it('rejects a supported token not offerable for the meter with a field-addressable failure naming the token and meter', () => {
    // Q is supported but does not appear in any 2/4 pattern.
    const failures = failuresFor(['Q'], '2/4')
    const notOfferable = failures.find((f) => f.reason.includes('Q') && f.reason.includes('2/4'))
    expect(notOfferable).toBeDefined()
    expect(notOfferable!.field).toBe('durations')
    // D is supported but not in the 2/4 patterns either.
    const failuresD = failuresFor(['D'], '2/4')
    expect(failuresD.some((f) => f.reason.includes('D'))).toBe(true)
  })

  it('accepts a set with at least one eligible complete-measure pattern, in canonical order', () => {
    const result = validateDurationSelection(['E', 'R'], buildCatalog(), '2/4')
    expect(result.isOk).toBe(true)
    expect(unwrap(result)).toEqual(['R', 'E'])
  })

  it('rejects an only-offerable set with no eligible pattern using one group-level failure naming the corrective suggestion', () => {
    // {R} in 2/4 is offerable (R appears in ER) but no pattern can be built
    // from R alone. The smallest addition is E (restores the ER pattern).
    const result = validateDurationSelection(['R'], buildCatalog(), '2/4')
    expect(result.isOk).toBe(false)
    const failures = unwrapErr<DurationSelectionFailure[]>(result)
    expect(failures.length).toBe(1)
    expect(failures[0]!.field).toBe('durations')
    expect(failures[0]!.reason).toBe(
      'No complete measure can be built from the selected durations for the 2/4 meter. Add the eighth duration to make your rhythm selection valid.',
    )
  })

  it('eligibility is authoritative: an all-offerable set with no eligible pattern is rejected, never a 500', () => {
    // {E} in the 3/4 meter is not offerable at all, which is the not-offerable
    // rejection. To exercise the eligibility branch with an all-offerable
    // set, use {R} in 2/4 (offerable but ineligible).
    const result = validateDurationSelection(['R'], buildCatalog(), '2/4')
    expect(result.isOk).toBe(false)
    // Confirm no throw happened and a single group-level failure was returned.
    expect(Array.isArray(unwrapErr(result))).toBe(true)
  })

  it('rejects any submission when no patterns exist for the meter (never a 500)', () => {
    const catalog = buildCatalog()
    const result = validateDurationSelection(['R'], catalog, '5/4')
    expect(result.isOk).toBe(false)
  })
})

describe('computeCorrectiveSuggestion', () => {
  it('returns the smallest set of additional offered durations (in canonical order) that restores eligibility', () => {
    const catalog = buildCatalog()
    // {R} in 2/4: adding E restores the ER pattern (one token).
    expect(computeCorrectiveSuggestion(catalog, '2/4', new Set(['R']))).toEqual(['E'])
    // {E} in 4/4: no single token restores QQER, but adding Q and R does.
    expect(computeCorrectiveSuggestion(catalog, '4/4', new Set(['E']))).toEqual(['Q', 'R'])
    // {} in 3/4: adding D restores the single-token D pattern.
    expect(computeCorrectiveSuggestion(catalog, '3/4', new Set())).toEqual(['D'])
  })

  it('returns an empty suggestion when the selection already has an eligible pattern', () => {
    const catalog = buildCatalog()
    expect(computeCorrectiveSuggestion(catalog, '2/4', new Set(['E']))).toEqual([])
    expect(computeCorrectiveSuggestion(catalog, '4/4', new Set(['Q', 'R', 'E']))).toEqual([])
  })

  it('is deterministic and does not mutate its arguments', () => {
    const catalog = buildCatalog()
    const selected = new Set(['R'])
    const snapshot = new Set(selected)
    const a = computeCorrectiveSuggestion(catalog, '2/4', selected)
    const b = computeCorrectiveSuggestion(catalog, '2/4', selected)
    expect(a).toEqual(b)
    expect(selected).toEqual(snapshot)
  })
})

describe('resolveDurationSelectionState', () => {
  it('is a pure function: does not mutate its arguments or throw', () => {
    const offerable = ['R', 'E']
    const snapshot = [...offerable]
    expect(() => resolveDurationSelectionState(null, offerable)).not.toThrow()
    expect(() => resolveDurationSelectionState('R', offerable)).not.toThrow()
    expect(offerable).toEqual(snapshot)
  })

  it('null stored durations: first derivation preselects every offerable duration', () => {
    const state = resolveDurationSelectionState(null, ['R', 'E'])
    expect(state.selectedDurations).toEqual(['R', 'E'])
    expect(state.isFirstDerivation).toBe(true)
  })

  it('empty-string stored durations is treated as null (first derivation with all offerable preselected)', () => {
    const state = resolveDurationSelectionState('', ['R', 'E'])
    expect(state.selectedDurations).toEqual(['R', 'E'])
    expect(state.isFirstDerivation).toBe(true)
  })

  it('whitespace-only stored durations is treated as null (first derivation)', () => {
    const state = resolveDurationSelectionState('   ', ['R', 'E'])
    expect(state.selectedDurations).toEqual(['R', 'E'])
    expect(state.isFirstDerivation).toBe(true)
  })

  it('a stored narrowed selection is returned as-is in offerable order, never re-expanded', () => {
    const state = resolveDurationSelectionState('E', ['R', 'E'])
    expect(state.selectedDurations).toEqual(['E'])
    expect(state.isFirstDerivation).toBe(false)
  })

  it('a stored token no longer offerable for the current meter is filtered out, offerable ones retained', () => {
    const state = resolveDurationSelectionState('D,E', ['R', 'E'])
    expect(state.selectedDurations).toEqual(['E'])
    expect(state.isFirstDerivation).toBe(false)
  })

  it('preserves offerable order for a stored set submitted out of order', () => {
    const state = resolveDurationSelectionState('E,R', ['R', 'E'])
    expect(state.selectedDurations).toEqual(['R', 'E'])
    expect(state.isFirstDerivation).toBe(false)
  })
})
