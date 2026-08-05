// ====================================
// Tests for the setup domain validator.
// Verifies the supported musical domain for the setup step: measure count
// 4-32, meters 2/4, 3/4, 4/4, and hands left, right, both. Invalid values
// are rejected with field-addressable failures and are never coerced into
// plausible defaults.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'
import Result from 'true-myth/result'

import {
  validateSetup,
  type SetupValidationFailure,
} from '../src/lib/setup-validator'

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

const failureFor = (failures: SetupValidationFailure[], field: string): SetupValidationFailure | undefined =>
  failures.find((f) => f.field === field)

describe('validateSetup measure count', () => {
  it('accepts the lower boundary 4', () => {
    const result = validateSetup({ measureCount: '4', timeSignature: '4/4', hand: 'right' })
    expect(result.isOk).toBe(true)
    expect(unwrap(result).measureCount).toBe(4)
  })

  it('accepts the upper boundary 32', () => {
    const result = validateSetup({ measureCount: '32', timeSignature: '4/4', hand: 'right' })
    expect(result.isOk).toBe(true)
    expect(unwrap(result).measureCount).toBe(32)
  })

  it('accepts a mid-range value like 16', () => {
    const result = validateSetup({ measureCount: '16', timeSignature: '4/4', hand: 'right' })
    expect(result.isOk).toBe(true)
    expect(unwrap(result).measureCount).toBe(16)
  })

  it('rejects 3 as below the minimum with a measures field failure', () => {
    const result = validateSetup({ measureCount: '3', timeSignature: '4/4', hand: 'right' })
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result)
    expect(failureFor(failures, 'measures')).toBeDefined()
  })

  it('rejects 33 as above the maximum with a measures field failure', () => {
    const result = validateSetup({ measureCount: '33', timeSignature: '4/4', hand: 'right' })
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result)
    expect(failureFor(failures, 'measures')).toBeDefined()
  })

  it('rejects a decimal like 8.5 with a measures field failure', () => {
    const result = validateSetup({ measureCount: '8.5', timeSignature: '4/4', hand: 'right' })
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result)
    expect(failureFor(failures, 'measures')).toBeDefined()
  })

  it('rejects a non-numeric string with a measures field failure', () => {
    const result = validateSetup({ measureCount: 'abc', timeSignature: '4/4', hand: 'right' })
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result)
    expect(failureFor(failures, 'measures')).toBeDefined()
  })

  it('rejects an empty string and does not coerce it to a default', () => {
    const result = validateSetup({ measureCount: '', timeSignature: '4/4', hand: 'right' })
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result)
    expect(failureFor(failures, 'measures')).toBeDefined()
  })

  it('rejects null and does not coerce it to a default', () => {
    const result = validateSetup({ measureCount: null, timeSignature: '4/4', hand: 'right' })
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result)
    expect(failureFor(failures, 'measures')).toBeDefined()
  })

  it('rejects undefined and does not coerce it to a default', () => {
    const result = validateSetup({ measureCount: undefined, timeSignature: '4/4', hand: 'right' })
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result)
    expect(failureFor(failures, 'measures')).toBeDefined()
  })
})

describe('validateSetup time signature', () => {
  it('accepts 2/4', () => {
    const result = validateSetup({ measureCount: '8', timeSignature: '2/4', hand: 'right' })
    expect(result.isOk).toBe(true)
    expect(unwrap(result).timeSignature).toBe('2/4')
  })

  it('accepts 3/4', () => {
    const result = validateSetup({ measureCount: '8', timeSignature: '3/4', hand: 'right' })
    expect(result.isOk).toBe(true)
    expect(unwrap(result).timeSignature).toBe('3/4')
  })

  it('accepts 4/4', () => {
    const result = validateSetup({ measureCount: '8', timeSignature: '4/4', hand: 'right' })
    expect(result.isOk).toBe(true)
    expect(unwrap(result).timeSignature).toBe('4/4')
  })

  it('rejects 6/8 with a meter field failure', () => {
    const result = validateSetup({ measureCount: '8', timeSignature: '6/8', hand: 'right' })
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result)
    expect(failureFor(failures, 'meter')).toBeDefined()
  })

  it('rejects an unsupported meter like 5/4 with a meter field failure', () => {
    const result = validateSetup({ measureCount: '8', timeSignature: '5/4', hand: 'right' })
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result)
    expect(failureFor(failures, 'meter')).toBeDefined()
  })

  it('rejects an empty string and does not coerce it to a default', () => {
    const result = validateSetup({ measureCount: '8', timeSignature: '', hand: 'right' })
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result)
    expect(failureFor(failures, 'meter')).toBeDefined()
  })

  it('rejects null and does not coerce it to a default', () => {
    const result = validateSetup({ measureCount: '8', timeSignature: null, hand: 'right' })
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result)
    expect(failureFor(failures, 'meter')).toBeDefined()
  })
})

describe('validateSetup hand', () => {
  it('accepts left', () => {
    const result = validateSetup({ measureCount: '8', timeSignature: '4/4', hand: 'left' })
    expect(result.isOk).toBe(true)
    expect(unwrap(result).hand).toBe('left')
  })

  it('accepts right', () => {
    const result = validateSetup({ measureCount: '8', timeSignature: '4/4', hand: 'right' })
    expect(result.isOk).toBe(true)
    expect(unwrap(result).hand).toBe('right')
  })

  it('accepts both', () => {
    const result = validateSetup({ measureCount: '8', timeSignature: '4/4', hand: 'both' })
    expect(result.isOk).toBe(true)
    expect(unwrap(result).hand).toBe('both')
  })

  it('rejects an unknown hand string with a hands field failure', () => {
    const result = validateSetup({ measureCount: '8', timeSignature: '4/4', hand: 'both-hands' })
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result)
    expect(failureFor(failures, 'hands')).toBeDefined()
  })

  it('rejects an empty string and does not coerce it to a default', () => {
    const result = validateSetup({ measureCount: '8', timeSignature: '4/4', hand: '' })
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result)
    expect(failureFor(failures, 'hands')).toBeDefined()
  })

  it('rejects null and does not coerce it to a default', () => {
    const result = validateSetup({ measureCount: '8', timeSignature: '4/4', hand: null })
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result)
    expect(failureFor(failures, 'hands')).toBeDefined()
  })
})

describe('validateSetup multiple invalid fields', () => {
  it('reports all invalid fields at once, not just the first', () => {
    const result = validateSetup({ measureCount: '99', timeSignature: '6/8', hand: 'both-hands' })
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result)
    expect(failureFor(failures, 'measures')).toBeDefined()
    expect(failureFor(failures, 'meter')).toBeDefined()
    expect(failureFor(failures, 'hands')).toBeDefined()
    expect(failures.length).toBe(3)
  })

  it('never throws on invalid input', () => {
    expect(() => validateSetup({ measureCount: {}, timeSignature: [], hand: {} })).not.toThrow()
  })
})
