/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reusable parameter-form parser.
 *
 * Extracts typed raw values from a `FormData` submission, tolerating the
 * hostile shapes of cross-cutting contract section 2 rule 5: an absent
 * field, an empty string, a repeated field (multi-value), an unexpected
 * extra field, and fields in an arbitrary order each resolve to a
 * deterministic accept or field-addressable reject. None of them produces a
 * thrown error, and none is silently coerced into a plausible value.
 *
 * This parser is reusable by Issues 6, 7, 13, 14, and 16 — it is not
 * specific to the setup form. Each caller supplies a `FieldSpec` declaring
 * the expected field names, their target types, and an optional repeated-
 * field policy.
 * @module lib/etude-form-parser
 */
import Result from 'true-myth/result'

/**
 * Repeated-field policy. When a field is submitted with multiple values:
 * - `reject` (default): a field-addressable failure is produced.
 * - `first-wins`: the first submitted value is kept, the rest discarded.
 *
 * The setup form declares no normalization, so a repeated field is a reject.
 * Other forms may declare `first-wins` when the PRD states that rule.
 */
export type RepeatedFieldPolicy = 'reject' | 'first-wins'

/**
 * Per-field specification within a `FieldSpec`.
 */
export interface FieldSpecEntry {
  /** Target type for the field. Currently only `string` is supported. */
  type: 'string'
  /** Repeated-field policy; defaults to `reject` when omitted. */
  repeated?: RepeatedFieldPolicy
}

/**
 * Field specification: the expected field names and their per-field rules.
 * Fields not listed here are ignored as unexpected extras.
 */
export interface FieldSpec {
  fields: Record<string, FieldSpecEntry>
}

/**
 * Field-addressable parse failure. `field` names the offending control so
 * the route can wire the error to the correct element; `reason` is a safe
 * description of the failure.
 */
export interface ParseFailure {
  field: string
  reason: string
}

/**
 * Extracted raw values keyed by expected field name. Each value is the
 * single string the form parser kept after applying the repeated-field
 * policy. Unexpected extra fields do not appear here.
 */
export type RawValues = Record<string, string>

const repeatedReason = (field: string): string =>
  `The ${field} field was submitted more than once. Please submit it once.`

const absentReason = (field: string): string => `The ${field} field is required.`

const emptyReason = (field: string): string => `The ${field} field must not be empty.`

/**
 * Read all values for a single field name from the `FormData` and apply the
 * repeated-field policy. Returns the kept single value (if any), the count
 * of submitted values, and a parse failure if the policy rejected the
 * submission.
 */
const readField = (
  formData: FormData,
  name: string,
  entry: FieldSpecEntry,
): { value: string | null; count: number; failure: ParseFailure | null } => {
  const all = formData.getAll(name)
  const count = all.length
  if (count === 0) {
    return { value: null, count, failure: { field: name, reason: absentReason(name) } }
  }
  if (count > 1) {
    const policy: RepeatedFieldPolicy = entry.repeated ?? 'reject'
    if (policy === 'first-wins') {
      const first = all[0]
      const value = typeof first === 'string' ? first : String(first ?? '')
      if (value === '') {
        return { value: null, count, failure: { field: name, reason: emptyReason(name) } }
      }
      return { value, count, failure: null }
    }
    return { value: null, count, failure: { field: name, reason: repeatedReason(name) } }
  }
  const single = all[0]
  const value = typeof single === 'string' ? single : String(single ?? '')
  if (value === '') {
    return { value: null, count, failure: { field: name, reason: emptyReason(name) } }
  }
  return { value, count, failure: null }
}

/**
 * Parse a `FormData` submission against a `FieldSpec`, returning either the
 * extracted raw values or a list of field-addressable failures. Never
 * throws. An unexpected extra field is ignored without affecting the
 * outcome for the expected fields. Field order in the `FormData` does not
 * affect the outcome.
 * @param formData - The submitted form data
 * @param spec - The expected field specification
 * @returns Result<RawValues, ParseFailure[]>
 */
export const parseParameterForm = (
  formData: FormData,
  spec: FieldSpec,
): Result<RawValues, ParseFailure[]> => {
  const failures: ParseFailure[] = []
  const values: RawValues = {}
  for (const [name, entry] of Object.entries(spec.fields)) {
    const { value, failure } = readField(formData, name, entry)
    if (failure !== null) {
      failures.push(failure)
      continue
    }
    if (value !== null) {
      values[name] = value
    }
  }
  if (failures.length > 0) {
    return Result.err(failures)
  }
  return Result.ok(values)
}
