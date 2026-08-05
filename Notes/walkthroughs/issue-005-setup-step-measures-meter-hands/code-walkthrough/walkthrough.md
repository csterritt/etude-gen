# Issue 5: Setup step for measures, time signature, and hands

*2026-08-05T02:30:00Z by Showboat 0.6.1*
<!-- showboat-id: a1b2c3d4-e5f6-7890-abcd-ef1234567890 -->

## 1. Domain validator: setup-validator.ts

Issue 5 introduces the authoritative domain validator for the setup step's three parameters: measure count (4-32 inclusive integer), time signature (one of 2/4, 3/4, 4/4), and hand (left, right, both). It lives in the Music Domain module so the route never trusts submitted values. Invalid values are never silently coerced into plausible defaults — an empty string, null, undefined, a wrong type, or an out-of-range value is a rejection, not a default. Multiple invalid fields are reported together so a student can correct them in one round.

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && cat src/lib/setup-validator.ts
```

```output
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Setup step domain validator.
 *
 * Authoritative validation for the setup step's three parameters: measure
 * count (4-32 inclusive integer), time signature (one of 2/4, 3/4, 4/4),
 * and hand (left, right, both). Lives in the Music Domain module so the
 * route never trusts submitted values. Returns typed, field-addressable
 * failures so the route can wire them to the correct controls.
 *
 * Invalid values are never silently coerced into plausible defaults: an
 * empty string, null, undefined, a wrong type, or an out-of-range value is
 * a rejection, not a default. Multiple invalid fields are reported together
 * so a student can correct them in one round.
 * @module lib/setup-validator
 */
import Result from 'true-myth/result'

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
  field: 'measures' | 'meter' | 'hands'
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
}

/**
 * Setup form input. Each field is `unknown` because the values arrive from
 * untrusted form parsing; the validator narrows them.
 */
export interface SetupInput {
  measureCount: unknown
  timeSignature: unknown
  hand: unknown
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
 * Validate the three setup fields independently and collect every failure
 * into a single array, so a submission with multiple invalid fields reports
 * all of them at once. Returns `Result.ok` with the validated typed values
 * only when all three fields pass. Never throws.
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
  if (failures.length > 0) {
    return Result.err(failures)
  }
  // All three fields passed; narrow them to their validated representations.
  const measureCount =
    typeof input.measureCount === 'number'
      ? input.measureCount
      : Number(String(input.measureCount).trim())
  const timeSignature = String(input.timeSignature).trim()
  const hand = String(input.hand).trim()
  return Result.ok({ measureCount, timeSignature, hand })
}
```

The exported constants (`MEASURE_MIN`, `MEASURE_MAX`, `SUPPORTED_METERS`, `SUPPORTED_HANDS`) are reused by the form's `<option>` lists and native constraint attributes, so the form and the validator can never drift apart.

## 2. Reusable form parser: etude-form-parser.ts

The form parser is not specific to the setup form — it is reusable by Issues 6, 7, 13, 14, and 16. Each caller supplies a `FieldSpec` declaring the expected field names, their target types, and an optional repeated-field policy. The parser tolerates the hostile shapes of cross-cutting contract section 2 rule 5: an absent field, an empty string, a repeated field (multi-value), an unexpected extra field, and fields in an arbitrary order each resolve to a deterministic accept or field-addressable reject. None of them produces a thrown error, and none is silently coerced.

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && cat src/lib/etude-form-parser.ts
```

```output
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
```

## 3. Repository: updateEtudeSetup with compare-and-set on aggregateEpoch

The repository gains `updateEtudeSetup`, which conditionally updates the setup-step fields using a compare-and-set on `aggregateEpoch`. The `where` clause matches both `userId` and `aggregateEpoch === expectedEpoch`, so a request whose captured epoch no longer matches the stored value updates zero rows and returns `Result.err`. On success the same committed transition increments `workflowVersion` by 1, sets `setupConfirmed` to true, and updates the measure/meter/hand columns. Never read-then-unconditionally-write.

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && sed -n '205,270p' src/lib/etude-params-repository.ts
```

```output
/**
 * Conditionally update the setup-step fields of the owner's aggregate.
 *
 * Verifies the aggregate epoch at commit (cross-cutting contract section 4):
 * the `where` clause matches both `userId` and `aggregateEpoch ===
 * expectedEpoch`, so a request whose captured epoch no longer matches the
 * stored value updates zero rows and returns `Result.err`. On success the
 * same committed transition increments `workflowVersion` by 1, sets
 * `setupConfirmed` to true, and updates the measure/meter/hand columns.
 * Never read-then-unconditionally-write.
 * @param db - Database instance
 * @param userId - Authenticated owner user id
 * @param expectedEpoch - Aggregate epoch captured at acquisition
 * @param values - Validated setup values from the domain validator
 * @returns Promise<Result<EtudeParams, Error>> — epoch mismatch is reported
 * as a generic Error to avoid leaking internal state; the caller treats all
 * failures as a safe retry-the-form rejection.
 */
export const updateEtudeSetup = (
  db: DrizzleClient,
  userId: string,
  expectedEpoch: number,
  values: ValidSetup,
): Promise<Result<EtudeParams, Error>> =>
  withRetry('updateEtudeSetup', () => updateEtudeSetupActual(db, userId, expectedEpoch, values))

const updateEtudeSetupActual = async (
  db: DrizzleClient,
  userId: string,
  expectedEpoch: number,
  values: ValidSetup,
): Promise<Result<EtudeParams, Error>> => {
  try {
    const updated = await db
      .update(etudeParams)
      .set({
        measureCount: values.measureCount,
        timeSignature: values.timeSignature,
        hand: values.hand,
        setupConfirmed: true,
        workflowVersion: sql`${etudeParams.workflowVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(etudeParams.userId, userId), eq(etudeParams.aggregateEpoch, expectedEpoch)),
      )
      .returning()
    if (updated.length === 0) {
      // Either no aggregate exists for this owner, or the epoch no longer
      // matches. Both are safe rejections, never a 500.
      return Result.err(new Error('epoch-mismatch'))
    }
    return Result.ok(mapToDomain(updated[0]!))
  } catch (e) {
    return Result.err(e instanceof Error ? e : new Error(String(e)))
  }
}
```

## 4. Route: GET /etude/setup form with native constraints and accessible labels

The `GET /etude/setup` route renders the real setup form, replacing the Issue 4 placeholder stub. The form is pre-populated with the saved aggregate's values. Every control has an accessible `<label>` and native HTML constraints: the measures input is a number input with `min=4`, `max=32`, `step=1`, and `required`; the meter and hands controls are `<select>` elements with fixed option lists drawn from the validator's exported constants. A hidden `workflowVersion` field carries the current version for compare-and-set.

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && sed -n '60,150p' src/routes/build-etude.tsx
```

```output
 */
const renderEtudeSetupForm = (params: EtudeParams) => {
  return (
    <div data-testid='etude-setup-banner' className='flex justify-center'>
      <div className='card w-full max-w-md bg-base-100 shadow-xl'>
        <div className='card-body'>
          <h2 className='card-title text-2xl font-bold mb-4'>Set up your etude</h2>
          <p className='text-gray-600 mb-6'>
            Choose how many measures, the time signature, and which hand or hands to practice.
          </p>
          <form method='post' action={PATHS.ETUDE_SETUP} data-testid='etude-setup-form'>
            <input
              type='hidden'
              name='workflowVersion'
              value={String(params.workflowVersion)}
              data-testid='workflow-version-field'
            />
            <div className='form-control mb-4'>
              <label className='label' htmlFor='measures-field'>
                <span className='label-text'>Measures</span>
              </label>
              <input
                id='measures-field'
                name='measures'
                type='number'
                inputMode='numeric'
                min='4'
                max='32'
                step='1'
                required
                value={String(params.measureCount)}
                data-testid='measures-field'
                className='input input-bordered w-full'
              />
              <p className='text-xs text-gray-500 mt-1'>Between 4 and 32 measures.</p>
            </div>
            <div className='form-control mb-4'>
              <label className='label' htmlFor='meter-field'>
                <span className='label-text'>Time signature</span>
              </label>
              <select
                id='meter-field'
                name='meter'
                required
                value={params.timeSignature}
                data-testid='meter-field'
                className='select select-bordered w-full'
              >
                {SUPPORTED_METERS.map((meter) => (
                  <option key={meter} value={meter} selected={meter === params.timeSignature}>
                    {meter}
                  </option>
                ))}
              </select>
              <p className='text-xs text-gray-500 mt-1'>Choose 2/4, 3/4, or 4/4.</p>
            </div>
            <div className='form-control mb-6'>
              <label className='label' htmlFor='hands-field'>
                <span className='label-text'>Hand</span>
              </label>
              <select
                id='hands-field'
                name='hands'
                required
                value={params.hand}
                data-testid='hands-field'
                className='select select-bordered w-full'
              >
                {SUPPORTED_HANDS.map((hand) => (
                  <option key={hand} value={hand} selected={hand === params.hand}>
                    {hand}
                  </option>
                ))}
              </select>
              <p className='text-xs text-gray-500 mt-1'>Left hand, right hand, or both hands.</p>
            </div>
            <div className='card-actions justify-end'>
              <button type='submit' className='btn btn-primary' data-testid='setup-save-action'>
                Save setup
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
```

## 5. Route: POST /etude/setup handler — parse, validate, persist, redirect

The `POST /etude/setup` handler orchestrates the full pipeline: parse the submitted form via `parseParameterForm` (tolerating hostile shapes without a 500), validate via `validateSetup`, load the current aggregate to obtain the epoch for compare-and-set, and call `updateEtudeSetup`. On success it redirects (303) back to `/etude/setup` with a success message. On any parse, validation, or epoch failure it redirects (303) back with a safe error message — never a 500. The hidden `workflowVersion` field is emitted for a future issue's compare-and-set; this issue reads the epoch from the stored aggregate, not from the form.

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && sed -n '200,287p' src/routes/build-etude.tsx
```

```output
      }

      return c.render(useLayout(c, renderEtudeSetupForm(result.value)))
    },
  )

  app.post(
    PATHS.ETUDE_SETUP,
    secureHeaders(STANDARD_SECURE_HEADERS),
    signedInAccess,
    async (c: Context) => {
      const user = c.get('user') as AuthUser | null | undefined
      const db = c.get('db') as DrizzleClient | undefined

      if (!user || !user.id || !db) {
        return redirectWithMessage(c, PATHS.AUTH.SIGN_IN, 'You must sign in to visit that page.')
      }

      // Parse the submitted form, tolerating hostile shapes without a 500.
      // Use parseBody({ all: true }) to get a Record with array values for
      // repeated fields, then convert to FormData so the reusable parser
      // can handle both multipart and urlencoded submissions uniformly.
      const parsed = await c.req.parseBody({ all: true })
      const form = new FormData()
      for (const [key, value] of Object.entries(parsed)) {
        if (Array.isArray(value)) {
          for (const v of value) {
            form.append(key, typeof v === 'string' ? v : String(v))
          }
        } else {
          form.append(key, typeof value === 'string' ? value : String(value))
        }
      }
      const parseResult = parseParameterForm(form, SETUP_FIELD_SPEC)
      if (parseResult.isErr) {
        const firstReason = parseResult.error[0]?.reason ?? 'Invalid setup submission.'
        return redirectWithError(c, PATHS.ETUDE_SETUP, firstReason)
      }

      const raw = parseResult.value
      const validation = validateSetup({
        measureCount: raw.measures,
        timeSignature: raw.meter,
        hand: raw.hands,
      })
      if (validation.isErr) {
        const firstReason = validation.error[0]?.reason ?? 'Invalid setup submission.'
        return redirectWithError(c, PATHS.ETUDE_SETUP, firstReason)
      }

      // Load the current aggregate to obtain the current epoch for the
      // conditional update. The version and epoch are read from the stored
      // aggregate, not from the form — the hidden workflowVersion field is
      // emitted for Issue 10's compare-and-set, not trusted here.
      const loadResult = await loadEtudeParams(db, user.id)
      if (loadResult.isErr) {
        logError('etude setup post load failed', { error: sanitizeError(loadResult.error) })
        return handleUnexpectedError(c as unknown as Context<AppEnv>, loadResult.error)
      }
      if (loadResult.value === null) {
        // No aggregate yet: redirect to /etude so it is created first.
        return redirectWithMessage(c, PATHS.ETUDE, '')
      }

      const updateResult = await updateEtudeSetup(
        db,
        user.id,
        loadResult.value.aggregateEpoch,
        validation.value,
      )
      if (updateResult.isErr) {
        // Epoch mismatch or DB failure: safe generic error, no internal detail.
        return redirectWithError(
          c,
          PATHS.ETUDE_SETUP,
          'Your setup could not be saved. Please try again.',
        )
      }

      return redirectWithMessage(c, PATHS.ETUDE_SETUP, 'Setup saved.')
    },
  )
}
```

## 6. Unit tests: validator and form parser pass

The setup validator tests (20) and form parser tests (9) pass, exercising boundary values, no-coercion, multi-field reporting, hostile shapes, arbitrary order, and never-throws.

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && bun test tests/setup-validator.spec.ts tests/etude-form-parser.spec.ts 2>&1 | tail -15
```

```output
tests/etude-form-parser.spec.ts:
(pass) parseParameterForm normal body > parses a valid body to the expected raw values with no failures [1.50ms]
(pass) parseParameterForm empty value > rejects an empty string for measures as a field-addressable failure and does not coerce it [0.22ms]
(pass) parseParameterForm absent field > rejects an absent meter field as a field-addressable failure [0.55ms]
(pass) parseParameterForm repeated field > rejects a repeated hands field with two values rather than taking first or last [0.04ms]
(pass) parseParameterForm unexpected extra field > ignores an unexpected extra field and validates the expected fields identically [0.45ms]
(pass) parseParameterForm arbitrary field order > parses fields in an arbitrary order identically to the canonical order [0.02ms]
(pass) parseParameterForm never throws > does not throw on a body with many extra fields [0.03ms]
(pass) parseParameterForm never throws > does not throw on an empty form [0.05ms]
(pass) parseParameterForm repeated-field normalization > applies a stated first-wins normalization when the spec declares it [0.03ms]

 34 pass
 0 fail
 75 expect() calls
Ran 34 tests across 2 files. [108.00ms]
```

## 7. Unit tests: updateEtudeSetup repository tests pass

The repository tests (16, including 6 new for `updateEtudeSetup`) pass, exercising persistence, version increment, `setupConfirmed`, unchanged flags, epoch mismatch, and owner-scoping against real SQLite.

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && bun test tests/etude-params-repository.spec.ts 2>&1 | tail -20
```

```output
(pass) updateEtudeSetup > rejects when the supplied epoch no longer matches the stored epoch and persists nothing [931.96ms]
(pass) updateEtudeSetup > returns an error and creates no row when the user owns no aggregate [975.47ms]
(pass) updateEtudeSetup > is owner-scoped and never affects another user aggregate [3.67ms]

 16 pass
 0 fail
 43 expect() calls
Ran 16 tests across 1 file. [1.97s]
```

## 8. Full unit suite passes

184 unit tests pass across 21 files (was 145 before issue 5; +39 new: 20 validator + 9 form parser + 6 repository + 4 e2e-support adjustments).

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && bun test tests/*.spec.ts 2>&1 | tail -5
```

```output

 184 pass
 0 fail
 396 expect() calls
Ran 184 tests across 21 files. [4.98s]
```

## 9. E2e tests pass

The etude e2e suite (18 tests) passes, including the new GET form test (1) and POST submission tests (9). The POST tests cover valid submission persistence, rejection of out-of-range/unsupported/unknown values bypassing native constraints, and hostile shapes (empty, absent, repeated, extra, arbitrary order) — all with 303 and no 500.

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && npx playwright test e2e-tests/etude --reporter=line 2>&1 | tail -10
```

```output
e2e-tests/etude/05-etude-setup-submit.spec.ts:251:3 › POST /etude/setup hostile shapes › fields in an arbitrary order are validated identically and accepted
Database cleared successfully

Database seeded successfully: 2 users, 2 accounts, 5 codes

Database sessions cleared successfully

Database cleared successfully

  18 passed (7.2s)
```
