/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Setup step domain validator.
 *
 * Authoritative validation for the setup step's four parameters: measure
 * count (4-32 inclusive integer), time signature (one of 2/4, 3/4, 4/4),
 * hand (left, right, both), and key (one of the eighteen supported keys).
 * Lives in the Music Domain module so the route never trusts submitted
 * values. Returns typed, field-addressable failures so the route can wire
 * them to the correct controls.
 *
 * Invalid values are never silently coerced into plausible defaults: an
 * empty string, null, undefined, a wrong type, or an out-of-range value is
 * a rejection, not a default. Multiple invalid fields are reported together
 * so a student can correct them in one round.
 * @module lib/setup-validator
 */
import Result from 'true-myth/result'

import { validateKey } from './key-domain'

/**
 * Inclusive lower bound for the measure count.
 */
export const MEASURE_MIN = 4

/**
 * Inclusive upper bound for the measure count.
 */
export const MEASURE_MAX = 32

/**
 * Supported time signatures for v1.
 */
export const SUPPORTED_METERS = ['2/4', '3/4', '4/4'] as const

/**
 * Supported hand selections for v1.
 */
export const SUPPORTED_HANDS = ['left', 'right', 'both'] as const

/**
 * Field-addressable validation failure. `field` names the offending control
 * so the route can wire the error to the correct element; `reason` is a safe
 * description of the supported range or combination.
 */
export interface SetupValidationFailure {
  field: 'measures' | 'meter' | 'hands' | 'key'
  reason: string
}

/**
 * Validated setup values. The route and repository may depend only on this
 * typed shape after validation has succeeded.
 */
export interface ValidSetup {
  measureCount: number
  timeSignature: string
  hand: string
  keySignature: string
}

/**
 * Setup form input. Each field is `unknown` because the values arrive from
 * untrusted form parsing; the validator narrows them.
 */
export interface SetupInput {
  measureCount: unknown
  timeSignature: unknown
  hand: unknown
  keySignature: unknown
}

const MEASURES_REASON = `Measure count must be a whole number between ${MEASURE_MIN} and ${MEASURE_MAX}.`
const METER_REASON = `Time signature must be one of: ${SUPPORTED_METERS.join(', ')}.`
const HANDS_REASON = `Hand selection must be one of: ${SUPPORTED_HANDS.join(', ')}.`

/**
 * Validate the measure count. Accepts a string (the form representation) or
 * a number, but rejects anything that is not a finite integer in the
 * inclusive range 4-32. An empty string, null, undefined, a decimal, or a
 * non-numeric value is rejected and never coerced.
 */
const validateMeasures = (value: unknown): SetupValidationFailure | null => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      return { field: 'measures', reason: MEASURES_REASON }
    }
    if (value < MEASURE_MIN || value > MEASURE_MAX) {
      return { field: 'measures', reason: MEASURES_REASON }
    }
    return null
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return { field: 'measures', reason: MEASURES_REASON }
  }
  const trimmed = value.trim()
  // Reject anything that is not purely digits so decimals, exponents, and
  // trailing characters are caught before parsing.
  if (!/^-?\d+$/.test(trimmed)) {
    return { field: 'measures', reason: MEASURES_REASON }
  }
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return { field: 'measures', reason: MEASURES_REASON }
  }
  if (parsed < MEASURE_MIN || parsed > MEASURE_MAX) {
    return { field: 'measures', reason: MEASURES_REASON }
  }
  return null
}

/**
 * Validate the time signature. Accepts exactly one of the supported meters.
 */
const validateMeter = (value: unknown): SetupValidationFailure | null => {
  if (typeof value !== 'string' || value.trim() === '') {
    return { field: 'meter', reason: METER_REASON }
  }
  const trimmed = value.trim()
  if (!(SUPPORTED_METERS as readonly string[]).includes(trimmed)) {
    return { field: 'meter', reason: METER_REASON }
  }
  return null
}

/**
 * Validate the hand selection. Accepts exactly one of the supported hands.
 */
const validateHand = (value: unknown): SetupValidationFailure | null => {
  if (typeof value !== 'string' || value.trim() === '') {
    return { field: 'hands', reason: HANDS_REASON }
  }
  const trimmed = value.trim()
  if (!(SUPPORTED_HANDS as readonly string[]).includes(trimmed)) {
    return { field: 'hands', reason: HANDS_REASON }
  }
  return null
}

/**
 * Validate the four setup fields independently and collect every failure
 * into a single array, so a submission with multiple invalid fields reports
 * all of them at once. Returns `Result.ok` with the validated typed values
 * only when all four fields pass. Never throws.
 * @param input - Untrusted setup values from the form parser
 * @returns Result<ValidSetup, SetupValidationFailure[]>
 */
export const validateSetup = (input: SetupInput): Result<ValidSetup, SetupValidationFailure[]> => {
  const failures: SetupValidationFailure[] = []
  const measuresFailure = validateMeasures(input.measureCount)
  if (measuresFailure !== null) {
    failures.push(measuresFailure)
  }
  const meterFailure = validateMeter(input.timeSignature)
  if (meterFailure !== null) {
    failures.push(meterFailure)
  }
  const handFailure = validateHand(input.hand)
  if (handFailure !== null) {
    failures.push(handFailure)
  }
  const keyResult = validateKey(input.keySignature)
  if (keyResult.isErr) {
    failures.push(keyResult.error)
  }
  if (failures.length > 0) {
    return Result.err(failures)
  }
  // All four fields passed; narrow them to their validated representations.
  const measureCount =
    typeof input.measureCount === 'number'
      ? input.measureCount
      : Number(String(input.measureCount).trim())
  const timeSignature = String(input.timeSignature).trim()
  const hand = String(input.hand).trim()
  const keySignature = keyResult.isOk ? keyResult.value : ''
  return Result.ok({ measureCount, timeSignature, hand, keySignature })
}
