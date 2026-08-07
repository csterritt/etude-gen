// ====================================
// Tests for the error-summary entry builder.
// Verifies buildErrorSummaryEntries produces one summary entry per error
// (each with a unique anchor id), dedupes duplicate error text for the same
// field (emitting each distinct message once), orders entries by the order
// the fields appear in the form, routes a group-level error to the group's
// first member control id and tags it as a group error, and returns an empty
// array when there are no field errors.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'

import {
  buildErrorSummaryEntries,
  type ErrorSummaryEntry,
} from '../src/components/error-summary'
import type { FieldError } from '../src/lib/safe-redisplay'

const FIELD_ORDER = ['measures', 'meter', 'hands', 'key', 'octaves']
const GROUP_FIELDS = {
  octaves: { firstMemberId: 'octaves-field-2' },
}

describe('buildErrorSummaryEntries basic behaviour', () => {
  it('returns an empty array when there are no field errors', () => {
    const result = buildErrorSummaryEntries([], FIELD_ORDER, GROUP_FIELDS)

    expect(result).toEqual([])
  })

  it('produces one entry for a single field error whose href targets that field control id', () => {
    const errors: FieldError[] = [{ field: 'measures', message: 'Choose between 4 and 32.' }]

    const result = buildErrorSummaryEntries(errors, FIELD_ORDER, GROUP_FIELDS)

    expect(result).toHaveLength(1)
    const entry = result[0] as ErrorSummaryEntry
    expect(entry.controlId).toBe('measures-field')
    expect(entry.text).toBe('Choose between 4 and 32.')
    expect(entry.isGroup).toBe(false)
    // The anchor id is unique and derived from the field name and error index.
    expect(entry.anchorId).toBe('measures-error-0')
  })
})

describe('buildErrorSummaryEntries multi-error and dedupe rules', () => {
  it('produces two entries with unique anchor ids for a field with two distinct errors', () => {
    const errors: FieldError[] = [
      { field: 'measures', message: 'Choose between 4 and 32.' },
      { field: 'measures', message: 'Measures must be a whole number.' },
    ]

    const result = buildErrorSummaryEntries(errors, FIELD_ORDER, GROUP_FIELDS)

    expect(result).toHaveLength(2)
    expect(result[0]!.anchorId).toBe('measures-error-0')
    expect(result[1]!.anchorId).toBe('measures-error-1')
    // Both entries link to the same control.
    expect(result[0]!.controlId).toBe('measures-field')
    expect(result[1]!.controlId).toBe('measures-field')
    // Distinct text.
    expect(result[0]!.text).not.toBe(result[1]!.text)
  })

  it('emits duplicate error text for the same field only once', () => {
    const errors: FieldError[] = [
      { field: 'measures', message: 'Choose between 4 and 32.' },
      { field: 'measures', message: 'Choose between 4 and 32.' },
    ]

    const result = buildErrorSummaryEntries(errors, FIELD_ORDER, GROUP_FIELDS)

    expect(result).toHaveLength(1)
    expect(result[0]!.text).toBe('Choose between 4 and 32.')
    expect(result[0]!.anchorId).toBe('measures-error-0')
  })

  it('keeps distinct messages for the same field while deduping identical ones', () => {
    const errors: FieldError[] = [
      { field: 'measures', message: 'Choose between 4 and 32.' },
      { field: 'measures', message: 'Measures must be a whole number.' },
      { field: 'measures', message: 'Choose between 4 and 32.' },
    ]

    const result = buildErrorSummaryEntries(errors, FIELD_ORDER, GROUP_FIELDS)

    expect(result).toHaveLength(2)
    expect(result[0]!.text).toBe('Choose between 4 and 32.')
    expect(result[1]!.text).toBe('Measures must be a whole number.')
  })
})

describe('buildErrorSummaryEntries field ordering', () => {
  it('orders entries by the order the fields appear in fieldOrder, not by error array order', () => {
    // Errors arrive in reverse field order; the summary must list them in
    // fieldOrder order.
    const errors: FieldError[] = [
      { field: 'octaves', message: 'Select at least one octave.' },
      { field: 'key', message: 'Choose a supported key.' },
      { field: 'measures', message: 'Choose between 4 and 32.' },
    ]

    const result = buildErrorSummaryEntries(errors, FIELD_ORDER, GROUP_FIELDS)

    expect(result).toHaveLength(3)
    expect(result[0]!.controlId).toBe('measures-field')
    expect(result[1]!.controlId).toBe('key-field')
    expect(result[2]!.controlId).toBe('octaves-field-2')
  })

  it('preserves the per-field error order within a single field', () => {
    const errors: FieldError[] = [
      { field: 'measures', message: 'First error.' },
      { field: 'key', message: 'Key error.' },
      { field: 'measures', message: 'Second error.' },
    ]

    const result = buildErrorSummaryEntries(errors, FIELD_ORDER, GROUP_FIELDS)

    expect(result).toHaveLength(3)
    // measures comes first in fieldOrder; its two errors keep their order.
    expect(result[0]!.text).toBe('First error.')
    expect(result[1]!.text).toBe('Second error.')
    // key comes next.
    expect(result[2]!.text).toBe('Key error.')
  })

  it('places a field not in fieldOrder at the end in error-array order', () => {
    const errors: FieldError[] = [
      { field: 'unknown', message: 'Unknown field error.' },
      { field: 'measures', message: 'Choose between 4 and 32.' },
    ]

    const result = buildErrorSummaryEntries(errors, FIELD_ORDER, GROUP_FIELDS)

    expect(result).toHaveLength(2)
    expect(result[0]!.controlId).toBe('measures-field')
    expect(result[1]!.controlId).toBe('unknown-field')
  })
})

describe('buildErrorSummaryEntries group-level errors', () => {
  it('routes a group field error to the group first member control id and marks it as a group error', () => {
    const errors: FieldError[] = [
      { field: 'octaves', message: 'Select at least one octave.' },
    ]

    const result = buildErrorSummaryEntries(errors, FIELD_ORDER, GROUP_FIELDS)

    expect(result).toHaveLength(1)
    const entry = result[0] as ErrorSummaryEntry
    expect(entry.controlId).toBe('octaves-field-2')
    expect(entry.isGroup).toBe(true)
  })

  it('routes a non-group field error to the field control id and marks it as not a group error', () => {
    const errors: FieldError[] = [{ field: 'measures', message: 'Out of range.' }]

    const result = buildErrorSummaryEntries(errors, FIELD_ORDER, GROUP_FIELDS)

    expect(result[0]!.isGroup).toBe(false)
    expect(result[0]!.controlId).toBe('measures-field')
  })

  it('gives each error in a group field a unique anchor id', () => {
    const errors: FieldError[] = [
      { field: 'octaves', message: 'Select at least one octave.' },
      { field: 'octaves', message: 'Select at least two octaves for both hands.' },
    ]

    const result = buildErrorSummaryEntries(errors, FIELD_ORDER, GROUP_FIELDS)

    expect(result).toHaveLength(2)
    expect(result[0]!.anchorId).toBe('octaves-error-0')
    expect(result[1]!.anchorId).toBe('octaves-error-1')
    expect(result[0]!.isGroup).toBe(true)
    expect(result[1]!.isGroup).toBe(true)
  })
})

describe('buildErrorSummaryEntries anchor uniqueness across fields', () => {
  it('produces unique anchor ids across multiple fields', () => {
    const errors: FieldError[] = [
      { field: 'measures', message: 'Out of range.' },
      { field: 'meter', message: 'Unsupported meter.' },
      { field: 'measures', message: 'Must be a whole number.' },
    ]

    const result = buildErrorSummaryEntries(errors, FIELD_ORDER, GROUP_FIELDS)

    const anchorIds = result.map((e) => e.anchorId)
    expect(new Set(anchorIds).size).toBe(anchorIds.length)
  })
})
