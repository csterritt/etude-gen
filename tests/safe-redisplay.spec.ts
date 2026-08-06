// ====================================
// Tests for the safe-redisplay value shaping module.
// Verifies shapeRedisplayPayload applies basic shape checks (only string or
// string-array values are echoed back; non-string types are dropped),
// enforces each bound (32 fields, 64 values per multi-value field, 128 bytes
// per value, 256 bytes per error, 16 KB total) by dropping the offending
// field rather than truncating it into a different value, returns a
// structured payload with fieldErrors, safeValues, and droppedFields, and
// never coerces an invalid value into a valid neighbouring value.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'

import {
  shapeRedisplayPayload,
  type FieldError,
  type RedisplayPayload,
  type RawValues,
} from '../src/lib/safe-redisplay'

describe('shapeRedisplayPayload basic shape checks', () => {
  it('returns valid string values for all fields in safeValues with no droppedFields', () => {
    const raw: RawValues = { measures: '16', meter: '3/4', hands: 'both' }
    const errors: FieldError[] = []

    const result = shapeRedisplayPayload(raw, errors)

    expect(result.safeValues.measures).toBe('16')
    expect(result.safeValues.meter).toBe('3/4')
    expect(result.safeValues.hands).toBe('both')
    expect(result.droppedFields).toEqual([])
  })

  it('drops a value that is not a string (e.g. a number) and adds its field name to droppedFields', () => {
    // The raw values come from the form parser as string/string[], but a
    // hostile or buggy caller could pass a non-string. The shaper must drop
    // it rather than coerce it.
    const raw = { measures: 42 } as unknown as RawValues
    const errors: FieldError[] = []

    const result = shapeRedisplayPayload(raw, errors)

    expect(result.safeValues.measures).toBeUndefined()
    expect(result.droppedFields).toContain('measures')
  })

  it('drops an object value and adds its field name to droppedFields', () => {
    const raw = { measures: { value: '16' } } as unknown as RawValues
    const errors: FieldError[] = []

    const result = shapeRedisplayPayload(raw, errors)

    expect(result.safeValues.measures).toBeUndefined()
    expect(result.droppedFields).toContain('measures')
  })

  it('keeps a multi-value field (string array) with valid string elements', () => {
    const raw: RawValues = { octaves: ['2', '3', '4'] }
    const errors: FieldError[] = []

    const result = shapeRedisplayPayload(raw, errors)

    expect(Array.isArray(result.safeValues.octaves)).toBe(true)
    expect(result.safeValues.octaves as string[]).toEqual(['2', '3', '4'])
    expect(result.droppedFields).toEqual([])
  })
})

describe('shapeRedisplayPayload multi-value bound', () => {
  it('keeps a multi-value field with 64 values', () => {
    const arr: string[] = []
    for (let i = 0; i < 64; i++) {
      arr.push(`v-${i}`)
    }
    const raw: RawValues = { octaves: arr }
    const errors: FieldError[] = []

    const result = shapeRedisplayPayload(raw, errors)

    expect(Array.isArray(result.safeValues.octaves)).toBe(true)
    expect((result.safeValues.octaves as string[]).length).toBe(64)
    expect(result.droppedFields).toEqual([])
  })

  it('drops a multi-value field with 65 or more values entirely (not truncated to 64)', () => {
    const arr: string[] = []
    for (let i = 0; i < 65; i++) {
      arr.push(`v-${i}`)
    }
    const raw: RawValues = { octaves: arr }
    const errors: FieldError[] = []

    const result = shapeRedisplayPayload(raw, errors)

    expect(result.safeValues.octaves).toBeUndefined()
    expect(result.droppedFields).toContain('octaves')
  })
})

describe('shapeRedisplayPayload value byte bound', () => {
  it('drops a single value exceeding 128 bytes (not truncated)', () => {
    const raw: RawValues = { measures: 'x'.repeat(129) }
    const errors: FieldError[] = []

    const result = shapeRedisplayPayload(raw, errors)

    expect(result.safeValues.measures).toBeUndefined()
    expect(result.droppedFields).toContain('measures')
  })

  it('keeps a single value of exactly 128 bytes', () => {
    const raw: RawValues = { measures: 'x'.repeat(128) }
    const errors: FieldError[] = []

    const result = shapeRedisplayPayload(raw, errors)

    expect(result.safeValues.measures).toBe('x'.repeat(128))
    expect(result.droppedFields).toEqual([])
  })

  it('drops a multi-value field if any single element exceeds 128 bytes', () => {
    const raw: RawValues = { octaves: ['ok', 'y'.repeat(129), 'ok2'] }
    const errors: FieldError[] = []

    const result = shapeRedisplayPayload(raw, errors)

    expect(result.safeValues.octaves).toBeUndefined()
    expect(result.droppedFields).toContain('octaves')
  })
})

describe('shapeRedisplayPayload error byte bound', () => {
  it('drops an error message exceeding 256 bytes from fieldErrors (not truncated)', () => {
    const raw: RawValues = { measures: '16' }
    const errors: FieldError[] = [
      { field: 'measures', message: 'e'.repeat(257) },
      { field: 'meter', message: 'short reason' },
    ]

    const result = shapeRedisplayPayload(raw, errors)

    const keptFields = result.fieldErrors.map((e) => e.field)
    expect(keptFields).not.toContain('measures')
    expect(keptFields).toContain('meter')
  })

  it('keeps an error message of exactly 256 bytes', () => {
    const raw: RawValues = { measures: '16' }
    const errors: FieldError[] = [{ field: 'measures', message: 'e'.repeat(256) }]

    const result = shapeRedisplayPayload(raw, errors)

    expect(result.fieldErrors.length).toBe(1)
    expect(result.fieldErrors[0]!.field).toBe('measures')
    expect(result.fieldErrors[0]!.message.length).toBe(256)
  })
})

describe('shapeRedisplayPayload total byte bound', () => {
  it('drops fields from the end until the total payload is under 16 KB, never truncating an individual value', () => {
    // Build a payload well over 16 KB using multi-value fields that each
    // pass the per-field bounds (64 values × 128 bytes = 8 KB per field).
    // Three such fields = 24 KB of values, exceeding the 16 KB total bound.
    const bigArray: string[] = []
    for (let i = 0; i < 64; i++) {
      bigArray.push('y'.repeat(128))
    }
    const raw: RawValues = {
      'keep-first': bigArray.slice(),
      'keep-second': bigArray.slice(),
      'drop-third': bigArray.slice(),
    }
    const errors: FieldError[] = []

    const result = shapeRedisplayPayload(raw, errors)

    const redisplayBytes = JSON.stringify({
      safeValues: result.safeValues,
      fieldErrors: result.fieldErrors,
    }).length
    expect(redisplayBytes).toBeLessThanOrEqual(16 * 1024)
    // No kept value was truncated.
    for (const key of Object.keys(result.safeValues)) {
      const v = result.safeValues[key]
      if (Array.isArray(v)) {
        expect(v.length).toBe(64)
        for (const item of v) {
          expect(item.length).toBe(128)
        }
      }
    }
    // The first field is kept; the last (drop-third) is dropped from the end.
    expect(result.safeValues['keep-first']).toBeDefined()
    expect(result.safeValues['drop-third']).toBeUndefined()
    expect(result.droppedFields).toContain('drop-third')
  })
})

describe('shapeRedisplayPayload field entry bound', () => {
  it('drops excess fields when more than 32 entries are supplied', () => {
    const raw: RawValues = {}
    for (let i = 0; i < 40; i++) {
      raw[`field-${i}`] = `v-${i}`
    }
    const errors: FieldError[] = []

    const result = shapeRedisplayPayload(raw, errors)

    const keptKeys = Object.keys(result.safeValues)
    expect(keptKeys.length).toBeLessThanOrEqual(32)
    expect(result.safeValues['field-0']).toBe('v-0')
    expect(result.safeValues['field-31']).toBe('v-31')
    expect(result.safeValues['field-32']).toBeUndefined()
    expect(result.safeValues['field-39']).toBeUndefined()
    expect(result.droppedFields).toContain('field-32')
    expect(result.droppedFields).toContain('field-39')
  })
})

describe('shapeRedisplayPayload no coercion', () => {
  it('never coerces an invalid value into a plausible default — it is redisplayed as-is for the student to correct', () => {
    // An invalid value like 'abc' for a numeric field is redisplayed as-is
    // (the student corrects it), not coerced to a default.
    const raw: RawValues = { measures: 'abc' }
    const errors: FieldError[] = [{ field: 'measures', message: 'Must be a number.' }]

    const result = shapeRedisplayPayload(raw, errors)

    expect(result.safeValues.measures).toBe('abc')
    expect(result.droppedFields).toEqual([])
  })
})

describe('shapeRedisplayPayload fieldErrors structure', () => {
  it('each fieldErrors entry has a field name and a message string within the 256-byte bound', () => {
    const raw: RawValues = { measures: '33' }
    const errors: FieldError[] = [
      { field: 'measures', message: 'Measure count must be a whole number between 4 and 32.' },
    ]

    const result = shapeRedisplayPayload(raw, errors)

    expect(result.fieldErrors.length).toBe(1)
    const err = result.fieldErrors[0]!
    expect(typeof err.field).toBe('string')
    expect(typeof err.message).toBe('string')
    expect(err.message.length).toBeLessThanOrEqual(256)
  })

  it('the returned payload has safeValues, fieldErrors, and droppedFields properties', () => {
    const raw: RawValues = { measures: '16' }
    const errors: FieldError[] = []

    const result: RedisplayPayload = shapeRedisplayPayload(raw, errors)

    expect(result).toHaveProperty('safeValues')
    expect(result).toHaveProperty('fieldErrors')
    expect(result).toHaveProperty('droppedFields')
    expect(Array.isArray(result.fieldErrors)).toBe(true)
    expect(Array.isArray(result.droppedFields)).toBe(true)
  })
})
