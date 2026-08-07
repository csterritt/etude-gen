// ====================================
// Tests for checkOperationPrecondition — a pure function that verifies
// the workflowVersion precondition and the aggregate epoch for operation
// POSTs (generate, render retry, pdf, start-over). Verifies that matching
// version and epoch return Ok, and that any mismatch returns a typed
// failure (version-mismatch or epoch-mismatch). The function is pure: no
// DB, no side effects, no mutation, no throws.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'

import { checkOperationPrecondition } from '../src/lib/operation-precondition'
import type { EtudeParams } from '../src/lib/etude-params-repository'
import type { OperationPreconditionFailure } from '../src/lib/operation-precondition'

const makeParams = (overrides: Partial<EtudeParams> = {}): EtudeParams => ({
  id: 'test-id',
  userId: 'test-user',
  measureCount: 8,
  timeSignature: '4/4',
  keySignature: 'C major',
  selectedOctaves: '4',
  octaveRange: 4,
  hand: 'right',
  workflowVersion: 1,
  aggregateEpoch: 1,
  setupConfirmed: false,
  notesConfirmed: false,
  splitConfirmed: false,
  selectedPitches: null,
  selectedDurations: null,
  splitBoundary: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...overrides,
})

const unwrapOk = (result: { isOk: boolean; value?: { workflowVersion: number } }): { workflowVersion: number } => {
  if (!result.isOk) {
    throw new Error('Expected Ok, got Err')
  }
  return result.value!
}

const unwrapErr = (result: { isErr: boolean; error?: OperationPreconditionFailure }): OperationPreconditionFailure => {
  if (!result.isErr) {
    throw new Error('Expected Err, got Ok')
  }
  return result.error!
}

describe('checkOperationPrecondition matching version and epoch', () => {
  it('returns Ok with the parsed workflowVersion when both version and epoch match', () => {
    const current = makeParams({ workflowVersion: 1, aggregateEpoch: 1 })
    const result = checkOperationPrecondition(current, '1', 1)
    expect(unwrapOk(result).workflowVersion).toBe(1)
  })

  it('returns Ok when version is 42 and epoch is 7 and both match', () => {
    const current = makeParams({ workflowVersion: 42, aggregateEpoch: 7 })
    const result = checkOperationPrecondition(current, '42', 7)
    expect(unwrapOk(result).workflowVersion).toBe(42)
  })
})

describe('checkOperationPrecondition version mismatch', () => {
  it('rejects a stale version (submitted 1 when current is 2) as version-mismatch', () => {
    const current = makeParams({ workflowVersion: 2, aggregateEpoch: 1 })
    const result = checkOperationPrecondition(current, '1', 1)
    expect(unwrapErr(result).kind).toBe('version-mismatch')
  })

  it('rejects a missing version (empty string) as version-mismatch', () => {
    const current = makeParams({ workflowVersion: 1, aggregateEpoch: 1 })
    const result = checkOperationPrecondition(current, '', 1)
    expect(unwrapErr(result).kind).toBe('version-mismatch')
  })

  it('rejects a non-numeric version as version-mismatch', () => {
    const current = makeParams({ workflowVersion: 1, aggregateEpoch: 1 })
    const result = checkOperationPrecondition(current, 'abc', 1)
    expect(unwrapErr(result).kind).toBe('version-mismatch')
  })

  it('rejects a negative version as version-mismatch', () => {
    const current = makeParams({ workflowVersion: 1, aggregateEpoch: 1 })
    const result = checkOperationPrecondition(current, '-1', 1)
    expect(unwrapErr(result).kind).toBe('version-mismatch')
  })

  it('rejects a newer-than-current version (submitted 3 when current is 2) as version-mismatch', () => {
    const current = makeParams({ workflowVersion: 2, aggregateEpoch: 1 })
    const result = checkOperationPrecondition(current, '3', 1)
    expect(unwrapErr(result).kind).toBe('version-mismatch')
  })
})

describe('checkOperationPrecondition epoch mismatch', () => {
  it('rejects a matching version but stale epoch as epoch-mismatch', () => {
    const current = makeParams({ workflowVersion: 1, aggregateEpoch: 1 })
    const result = checkOperationPrecondition(current, '1', 0)
    expect(unwrapErr(result).kind).toBe('epoch-mismatch')
  })

  it('rejects a matching version but newer epoch as epoch-mismatch', () => {
    const current = makeParams({ workflowVersion: 1, aggregateEpoch: 1 })
    const result = checkOperationPrecondition(current, '1', 5)
    expect(unwrapErr(result).kind).toBe('epoch-mismatch')
  })
})

describe('checkOperationPrecondition purity', () => {
  it('does not mutate the current aggregate', () => {
    const current = makeParams({ workflowVersion: 1, aggregateEpoch: 1 })
    const snapshot = { ...current }
    checkOperationPrecondition(current, '1', 1)
    expect(current).toEqual(snapshot)
  })

  it('does not throw for any hostile input', () => {
    const current = makeParams({ workflowVersion: 1, aggregateEpoch: 1 })
    const hostileInputs = ['', 'abc', '-1', '1.5', '1abc', '999']
    for (const input of hostileInputs) {
      expect(() => checkOperationPrecondition(current, input, 1)).not.toThrow()
    }
  })
})
