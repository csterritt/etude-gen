/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Safe-redisplay value shaping.
 *
 * A pure function that takes the raw submitted values (a
 * `Record<string, string | string[]>` from the form parser) and the
 * field-addressable errors, and produces a redisplay payload with
 * `safeValues`, `fieldErrors`, and `droppedFields`.
 *
 * Each documented bound is enforced as a drop, never a truncation: an
 * offending field is removed from redisplay entirely (and its name added to
 * `droppedFields`) rather than being cut into a different value. The caller
 * (the GET handler) redisplays dropped fields from the committed aggregate
 * instead.
 *
 * An invalid value (e.g. `'abc'` for a numeric field) is never coerced into a
 * plausible default — it is either dropped (when it fails a bound) or
 * redisplayed as-is (when it passes the bounds) for the student to correct.
 *
 * The bound constants are defined once here and imported by the
 * validation-state repository so the two modules share a single source of
 * truth.
 * @module lib/safe-redisplay
 */

/**
 * Maximum number of field entries kept in a redisplay payload. Excess fields
 * are dropped (not truncated) and their names reported in `droppedFields`.
 */
export const MAX_FIELD_ENTRIES = 32

/**
 * Maximum number of values kept in a single multi-value field. A field
 * exceeding this is dropped entirely (not truncated to the limit).
 */
export const MAX_VALUES_PER_FIELD = 64

/**
 * Maximum UTF-8 byte length of a single stored value. A field whose value
 * exceeds this is dropped entirely (not truncated).
 */
export const MAX_VALUE_BYTES = 128

/**
 * Maximum UTF-8 byte length of a single error message. An error exceeding
 * this is dropped from `fieldErrors` (not truncated).
 */
export const MAX_ERROR_BYTES = 256

/**
 * Maximum total byte size of the redisplay content (safeValues +
 * fieldErrors). Fields are dropped from the end until the total is under the
 * limit; no individual value is truncated into a different value.
 */
export const MAX_TOTAL_BYTES = 16 * 1024

/**
 * A single field-addressable error for redisplay. `field` names the
 * offending control; `message` is a safe corrective description within the
 * `MAX_ERROR_BYTES` bound.
 */
export interface FieldError {
  field: string
  message: string
}

/**
 * Raw submitted values keyed by field name. A `string` field yields a single
 * string; a `string-multi` field yields a `string[]` in submission order.
 */
export type RawValues = Record<string, string | string[]>

/**
 * The shaped redisplay payload. `safeValues` are the string/string[] values
 * that passed shaping; `fieldErrors` are the field-addressable failures
 * within the byte bound; `droppedFields` names the fields that were removed
 * by a bound and must be redisplayed from the committed aggregate instead.
 */
export interface RedisplayPayload {
  safeValues: Record<string, string | string[]>
  fieldErrors: FieldError[]
  droppedFields: string[]
}

/**
 * UTF-8 byte length of a string. Uses `Buffer` when available (Node/Bun) and
 * falls back to `TextEncoder` for environments without `Buffer`.
 */
const byteLength = (s: string): number => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.byteLength(s, 'utf8')
  }
  return new TextEncoder().encode(s).length
}

/**
 * Shape the raw submitted values and field errors into a safe redisplay
 * payload, enforcing each documented bound by dropping (never truncating) any
 * field or error that exceeds a bound.
 *
 * Per-field bounds (type, value bytes, multi-value count) are applied first,
 * then the per-error byte bound, then the total-byte bound by dropping whole
 * fields from the end. An invalid value that passes the bounds (e.g. `'abc'`
 * for a numeric field) is redisplayed as-is — it is never coerced into a
 * plausible default.
 * @param rawValues - Raw submitted values from the form parser
 * @param fieldErrors - Field-addressable failures from the parser/validator
 * @returns RedisplayPayload with safeValues, fieldErrors, and droppedFields
 */
export const shapeRedisplayPayload = (
  rawValues: RawValues,
  fieldErrors: FieldError[],
): RedisplayPayload => {
  const droppedFields: string[] = []
  const safeValues: Record<string, string | string[]> = {}

  // First pass: per-field bounds (type, value bytes, multi-value count).
  const entries = Object.entries(rawValues)
  for (const [field, value] of entries) {
    if (Object.keys(safeValues).length >= MAX_FIELD_ENTRIES) {
      // Excess fields beyond the entry cap are dropped.
      droppedFields.push(field)
      continue
    }
    if (typeof value === 'string') {
      if (byteLength(value) > MAX_VALUE_BYTES) {
        droppedFields.push(field)
        continue
      }
      safeValues[field] = value
      continue
    }
    if (Array.isArray(value)) {
      if (value.length > MAX_VALUES_PER_FIELD) {
        droppedFields.push(field)
        continue
      }
      // Every element must be a string within the value-byte bound.
      let allOk = true
      for (const v of value) {
        if (typeof v !== 'string' || byteLength(v) > MAX_VALUE_BYTES) {
          allOk = false
          break
        }
      }
      if (!allOk) {
        droppedFields.push(field)
        continue
      }
      safeValues[field] = value
      continue
    }
    // Non-string, non-array values are dropped.
    droppedFields.push(field)
  }

  // Per-error bound: drop over-long messages (never truncate).
  const shapedErrors: FieldError[] = []
  for (const err of fieldErrors) {
    if (typeof err.message === 'string' && byteLength(err.message) <= MAX_ERROR_BYTES) {
      shapedErrors.push({ field: err.field, message: err.message })
    }
  }

  // Total-byte bound: drop whole fields from the end until the redisplay
  // content (safeValues + fieldErrors) is under the limit. The droppedFields
  // metadata is not counted toward the bound — it is a report of what was
  // dropped, not redisplay content. Recompute after each drop so no
  // individual value is ever truncated into a different value.
  const redisplayBytes = (): number => byteLength(JSON.stringify({ safeValues, fieldErrors: shapedErrors }))
  let guard = 0
  while (redisplayBytes() > MAX_TOTAL_BYTES && guard < entries.length) {
    guard++
    const lastKey = Object.keys(safeValues).pop()
    if (lastKey === undefined) {
      break
    }
    delete safeValues[lastKey]
    droppedFields.push(lastKey)
  }

  return { safeValues, fieldErrors: shapedErrors, droppedFields }
}
