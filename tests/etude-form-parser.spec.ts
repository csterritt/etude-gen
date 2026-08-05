// ====================================
// Tests for the parameter-form parser.
// Verifies hostile-shape tolerance: an absent field, an empty string, a
// repeated field (multi-value), an unexpected extra field, and fields in an
// arbitrary order each resolve to a deterministic accept or field-addressable
// reject with no thrown error and no coercion.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'
import Result from 'true-myth/result'

import {
  parseParameterForm,
  type FieldSpec,
  type ParseFailure,
} from '../src/lib/etude-form-parser'

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

const failureFor = (failures: ParseFailure[], field: string): ParseFailure | undefined =>
  failures.find((f) => f.field === field)

/**
 * The setup form field specification used across these tests. The setup form
 * has three expected fields and declares no repeated-field normalization, so
 * a repeated field is a reject.
 */
const setupSpec: FieldSpec = {
  fields: {
    measures: { type: 'string' },
    meter: { type: 'string' },
    hands: { type: 'string' },
  },
}

const buildFormData = (entries: Array<[string, string]>): FormData => {
  const fd = new FormData()
  for (const [name, value] of entries) {
    fd.append(name, value)
  }
  return fd
}

describe('parseParameterForm normal body', () => {
  it('parses a valid body to the expected raw values with no failures', () => {
    const fd = buildFormData([
      ['measures', '16'],
      ['meter', '3/4'],
      ['hands', 'both'],
    ])
    const result = parseParameterForm(fd, setupSpec)
    expect(result.isOk).toBe(true)
    const values = unwrap(result)
    expect(values.measures).toBe('16')
    expect(values.meter).toBe('3/4')
    expect(values.hands).toBe('both')
  })
})

describe('parseParameterForm empty value', () => {
  it('rejects an empty string for measures as a field-addressable failure and does not coerce it', () => {
    const fd = buildFormData([
      ['measures', ''],
      ['meter', '4/4'],
      ['hands', 'right'],
    ])
    const result = parseParameterForm(fd, setupSpec)
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result)
    expect(failureFor(failures, 'measures')).toBeDefined()
  })
})

describe('parseParameterForm absent field', () => {
  it('rejects an absent meter field as a field-addressable failure', () => {
    const fd = buildFormData([
      ['measures', '8'],
      ['hands', 'right'],
    ])
    const result = parseParameterForm(fd, setupSpec)
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result)
    expect(failureFor(failures, 'meter')).toBeDefined()
  })
})

describe('parseParameterForm repeated field', () => {
  it('rejects a repeated hands field with two values rather than taking first or last', () => {
    const fd = buildFormData([
      ['measures', '8'],
      ['meter', '4/4'],
      ['hands', 'left'],
      ['hands', 'right'],
    ])
    const result = parseParameterForm(fd, setupSpec)
    expect(result.isErr).toBe(true)
    const failures = unwrapErr(result)
    expect(failureFor(failures, 'hands')).toBeDefined()
  })
})

describe('parseParameterForm unexpected extra field', () => {
  it('ignores an unexpected extra field and validates the expected fields identically', () => {
    const fd = buildFormData([
      ['measures', '16'],
      ['meter', '3/4'],
      ['hands', 'both'],
      ['foo', 'bar'],
    ])
    const result = parseParameterForm(fd, setupSpec)
    expect(result.isOk).toBe(true)
    const values = unwrap(result)
    expect(values.measures).toBe('16')
    expect(values.meter).toBe('3/4')
    expect(values.hands).toBe('both')
    // The extra field is not present in the parsed values.
    expect(values.foo).toBeUndefined()
  })
})

describe('parseParameterForm arbitrary field order', () => {
  it('parses fields in an arbitrary order identically to the canonical order', () => {
    const fd = buildFormData([
      ['hands', 'both'],
      ['measures', '16'],
      ['meter', '3/4'],
    ])
    const result = parseParameterForm(fd, setupSpec)
    expect(result.isOk).toBe(true)
    const values = unwrap(result)
    expect(values.measures).toBe('16')
    expect(values.meter).toBe('3/4')
    expect(values.hands).toBe('both')
  })
})

describe('parseParameterForm never throws', () => {
  it('does not throw on a body with many extra fields', () => {
    const fd = buildFormData([
      ['measures', '8'],
      ['meter', '4/4'],
      ['hands', 'right'],
      ['extra1', 'a'],
      ['extra2', 'b'],
      ['extra3', 'c'],
    ])
    expect(() => parseParameterForm(fd, setupSpec)).not.toThrow()
  })

  it('does not throw on an empty form', () => {
    const fd = new FormData()
    expect(() => parseParameterForm(fd, setupSpec)).not.toThrow()
  })
})

describe('parseParameterForm repeated-field normalization', () => {
  it('applies a stated first-wins normalization when the spec declares it', () => {
    const spec: FieldSpec = {
      fields: {
        measures: { type: 'string', repeated: 'first-wins' },
        meter: { type: 'string' },
        hands: { type: 'string' },
      },
    }
    const fd = buildFormData([
      ['measures', '8'],
      ['measures', '16'],
      ['meter', '4/4'],
      ['hands', 'right'],
    ])
    const result = parseParameterForm(fd, spec)
    expect(result.isOk).toBe(true)
    expect(unwrap(result).measures).toBe('8')
  })
})
