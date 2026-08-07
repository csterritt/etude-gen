// ====================================
// Tests for parseWorkflowVersionField — a pure parser for the hidden
// workflowVersion form field. Validates that a valid non-negative integer
// string is accepted, and that missing, empty, non-numeric, negative, and
// non-integer values are rejected with a field-addressable ParseFailure.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'

import { parseWorkflowVersionField } from '../src/lib/workflow-version-field'
import type { ParseFailure } from '../src/lib/etude-form-parser'

const unwrapOk = (result: { isOk: boolean; value?: number }): number => {
  if (!result.isOk) {
    throw new Error(`Expected Ok, got Err`)
  }
  return result.value!
}

const unwrapErr = (result: { isErr: boolean; error?: ParseFailure }): ParseFailure => {
  if (!result.isErr) {
    throw new Error(`Expected Err, got Ok`)
  }
  return result.error!
}

describe('parseWorkflowVersionField valid inputs', () => {
  it('accepts "1" and returns Ok with 1', () => {
    const result = parseWorkflowVersionField('1', 'workflowVersion')
    expect(unwrapOk(result)).toBe(1)
  })

  it('accepts "42" and returns Ok with 42', () => {
    const result = parseWorkflowVersionField('42', 'workflowVersion')
    expect(unwrapOk(result)).toBe(42)
  })

  it('accepts "0" and returns Ok with 0', () => {
    const result = parseWorkflowVersionField('0', 'workflowVersion')
    expect(unwrapOk(result)).toBe(0)
  })

  it('accepts a value with surrounding whitespace and trims it', () => {
    const result = parseWorkflowVersionField('  3  ', 'workflowVersion')
    expect(unwrapOk(result)).toBe(3)
  })
})

describe('parseWorkflowVersionField invalid inputs', () => {
  it('rejects a missing value (undefined) with a ParseFailure naming the field', () => {
    const result = parseWorkflowVersionField(undefined, 'workflowVersion')
    const err = unwrapErr(result)
    expect(err.field).toBe('workflowVersion')
  })

  it('rejects a missing value (null) with a ParseFailure naming the field', () => {
    const result = parseWorkflowVersionField(null, 'workflowVersion')
    const err = unwrapErr(result)
    expect(err.field).toBe('workflowVersion')
  })

  it('rejects an empty string with a ParseFailure naming the field', () => {
    const result = parseWorkflowVersionField('', 'workflowVersion')
    const err = unwrapErr(result)
    expect(err.field).toBe('workflowVersion')
  })

  it('rejects a non-numeric string with a ParseFailure naming the field', () => {
    const result = parseWorkflowVersionField('abc', 'workflowVersion')
    const err = unwrapErr(result)
    expect(err.field).toBe('workflowVersion')
  })

  it('rejects a negative number with a ParseFailure naming the field', () => {
    const result = parseWorkflowVersionField('-1', 'workflowVersion')
    const err = unwrapErr(result)
    expect(err.field).toBe('workflowVersion')
  })

  it('rejects a non-integer like "1.5" with a ParseFailure naming the field', () => {
    const result = parseWorkflowVersionField('1.5', 'workflowVersion')
    const err = unwrapErr(result)
    expect(err.field).toBe('workflowVersion')
  })

  it('rejects a tampered value like "1abc" with a ParseFailure naming the field', () => {
    const result = parseWorkflowVersionField('1abc', 'workflowVersion')
    const err = unwrapErr(result)
    expect(err.field).toBe('workflowVersion')
  })
})

describe('parseWorkflowVersionField field name parameterization', () => {
  it('uses the provided field name in the ParseFailure', () => {
    const result = parseWorkflowVersionField('bad', 'customField')
    const err = unwrapErr(result)
    expect(err.field).toBe('customField')
  })
})
