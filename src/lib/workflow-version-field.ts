/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Pure parser for the hidden `workflowVersion` form field.
 *
 * Extracts a non-negative integer from the raw string submitted by a
 * parameter form (setup, notes, split) or an operation POST. A missing,
 * empty, non-numeric, negative, or non-integer value is a field-addressable
 * `ParseFailure` — never a thrown error. The function is pure (no DB, no
 * side effects) and reusable by every form that carries the workflow version
 * as a compare-and-set token or precondition (Issues 10, 13, 14, 16, 20,
 * 30, 31, 32, 33, 34, 35, 37, 38).
 * @module lib/workflow-version-field
 */
import Result from 'true-myth/result'

import type { ParseFailure } from './etude-form-parser'

const missingReason = (field: string): string =>
  `The ${field} field is required.`

const invalidReason = (field: string): string =>
  `The ${field} field must be a non-negative integer.`

/**
 * Parse a raw workflow-version form field value into a non-negative integer.
 *
 * Trims surrounding whitespace before validating. A valid value matches the
 * pattern of one or more digits (`/^\d+$/`), so `"  3  "` is accepted as `3`
 * but `"1abc"`, `"1.5"`, `"-1"`, `""`, `null`, and `undefined` are all
 * rejected with a `ParseFailure` whose `field` matches the provided name.
 * @param raw - The raw submitted string, or null/undefined when absent
 * @param field - The field name for the ParseFailure (e.g. 'workflowVersion')
 * @returns Result<number, ParseFailure> — Ok with the parsed integer, or
 * Err with a field-addressable ParseFailure
 */
export const parseWorkflowVersionField = (
  raw: string | null | undefined,
  field: string,
): Result<number, ParseFailure> => {
  if (raw === null || raw === undefined) {
    return Result.err({ field, reason: missingReason(field) })
  }
  const trimmed = raw.trim()
  if (trimmed === '') {
    return Result.err({ field, reason: missingReason(field) })
  }
  if (!/^\d+$/.test(trimmed)) {
    return Result.err({ field, reason: invalidReason(field) })
  }
  return Result.ok(Number(trimmed))
}
