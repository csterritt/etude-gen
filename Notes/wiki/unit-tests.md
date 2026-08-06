# Unit Tests

A catalog and summaries of all unit tests under `tests/`.

## config-validator.spec.ts

16 tests covering `validateEtudeConfig` from `src/lib/config-validator.ts`:

- Complete configuration passes and includes the resolved timeout.
- Each individually missing value (`PROJECT_DB`, `ETUDE_GEN_STORAGE`, `LILYPOND_SERVICE_URL`, `LILYPOND_API_KEY`) fails and names that value.
- `LILYPOND_TIMEOUT_MS` validation: defaults to 30,000 when absent; fails when non-numeric, zero, or negative; passes when positive.
- Aggregate defect reporting: all defects reported together, not first-only.
- No secret values in output: API key value never appears in any defect text.

## health-route.spec.ts

13 tests covering `runHealthCheck`, `buildAnonymousLiveness`, and `buildDetailedReport` from `src/routes/build-health.tsx`:

- Config contribution: healthy when complete, unhealthy when incomplete.
- Rhythm catalog contribution surface: unhealthy when catalog is unhealthy, healthy when both pass, aggregates defects, healthy when no catalog contribution.
- Anonymous liveness: only a healthy flag; no binding names, value names, defect detail, resolved values, or secrets.
- Privileged detailed report: names every missing value, includes resolved timeout, never contains secret values.

## no-hardcoded-lilypond-version.spec.ts

1 guardrail test scanning `src/` for any hard-coded LilyPond version string (e.g. `2.x.y` near "lilypond" context). Ensures no permanent version is embedded in application source; the reported version is retained only with SVG render metadata for diagnosis.

## correlation-id.spec.ts

3 tests covering `generateCorrelationId` from `src/lib/correlation-id.ts`:

- Returns a string matching the UUID v4 format.
- Returns a different identifier on each call.
- Produces 100 unique identifiers in a sequence.

## logger-redaction.spec.ts

14 tests covering the redaction and correlation passthrough in `src/lib/logger.ts`:

- Sensitive field redaction for `logInfo`: name, email, session/sessionToken, Bearer authorization, secret/apiKey, service credentials, LilyPond request body; non-sensitive fields preserved.
- Correlation identifier passthrough: `correlationId` included verbatim and never redacted.
- `logError` and `logWarn` redact sensitive fields and include the correlation identifier.
- `logRoutineSuccess` emits no console line and is a no-op.

## correlation-middleware.spec.ts

3 tests covering `correlationIdMiddleware` from `src/middleware/correlation-id.ts`:

- Sets an `X-Correlation-ID` response header containing a UUID v4.
- Stores the same identifier in the Hono context.
- Produces different identifiers for two separate requests.

## safe-error-page.spec.ts

5 tests covering `handleUnexpectedError` and `renderSafeError` from `src/routes/build-safe-error.tsx`:

- Renders a generic safe message and the correlation identifier.
- Does not leak stack traces, SQL, service detail, or PII into the response body.
- Sets the `X-Correlation-ID` header on the error response.
- Shows the same correlation identifier in the body that is in the header.
- Logs the error with the correlation identifier and no PII or secret values.

## correlation-propagation.spec.ts

9 tests covering `src/lib/correlation-context.ts`:

- Request correlation id reaches the Workflow Service, renderer, repository, and artifact-store stubs.
- All four stubs receive the same request id in one operation.
- Deferred cleanup started by a request carries the originating request id.
- Deferred cleanup with no request context generates its own operation id.
- Operation ids are distinguishable from request ids by kind.

## refusal-logging.spec.ts

10 tests covering `logRefusal` from `src/lib/refusal-logger.ts`:

- Exposes the four typed refusal categories (`lost-lock`, `stale-operation`, `stale-epoch`, `stale-Piece`).
- Each category is logged with its typed category and the correlation identifier.
- No forbidden fields (user identifier, Piece content, LilyPond source, grant identifier, credential) leak for any category.
- Every refusal log line includes the correlation identifier.

## helpers/test-db.spec.ts

2 smoke tests for the test-database helper (`tests/helpers/test-db.ts`):

- Creates an in-memory SQLite database with the production schema applied, inserts a user row, and reads it back.
- Enforces the user email uniqueness constraint (direct second insert throws).

## etude-params-repository.spec.ts

28 tests covering `loadOrCreateEtudeParams`, `loadEtudeParams`, and `updateEtudeSetup` from `src/lib/etude-params-repository.ts`, using the `tests/helpers/test-db.ts` real-SQLite helper:

- Creates one record with the default values (8 measures, 4/4, C major, selected octaves `'4'`, octave range 4, right hand, `workflowVersion` 1, `aggregateEpoch` 1) for a new user.
- Does not create a second record on a second call and returns the same aggregate (idempotent).
- Reports no confirmed steps on a freshly created aggregate.
- Treats a uniqueness violation as a load of the winner aggregate, not an error (losing-caller path).
- Results in exactly one aggregate when two concurrent `Promise.all` calls race for the same new user.
- Rejects a direct second insert for a user who already has one aggregate (database UNIQUE constraint).
- `loadEtudeParams` is owner-scoped and never returns another user's aggregate.
- `loadEtudeParams` returns the owner aggregate when one exists.
- Cascade deletion: removing the user row removes the `etude_params` row.
- `updateEtudeSetup` persists the measure count, time signature, and hand values.
- `updateEtudeSetup` increments `workflowVersion` by exactly 1.
- `updateEtudeSetup` sets `setupConfirmed` to true.
- `updateEtudeSetup` leaves `notesConfirmed` and `splitConfirmed` unchanged.
- `updateEtudeSetup` rejects when the supplied epoch no longer matches the stored epoch and persists nothing.
- `updateEtudeSetup` returns an error and creates no row when the user owns no aggregate.
- `updateEtudeSetup` is owner-scoped and never affects another user's aggregate.
- `updateEtudeSetup` persists the `keySignature` value and increments the workflow version.
- `updateEtudeSetup` clears `notesConfirmed` and `splitConfirmed` when the submitted key differs from the stored key.
- `updateEtudeSetup` leaves `notesConfirmed` and `splitConfirmed` unchanged when the submitted key is identical to the stored key.
- `updateEtudeSetup` does not increment the workflow version and changes no flags when all submitted values are identical to the stored ones.
- `updateEtudeSetup` changing only a non-key field increments the version but does not clear `notesConfirmed` or `splitConfirmed`.
- `updateEtudeSetup` still rejects an epoch mismatch and performs no invalidation.
- `updateEtudeSetup` persists the `selectedOctaves` value as a normalized comma-separated string.
- `updateEtudeSetup` clears `notesConfirmed` and `splitConfirmed` when only the octaves change.
- `updateEtudeSetup` leaves the flags unchanged when octaves are identical but another field changes.
- `updateEtudeSetup` does not increment the workflow version when all five fields are identical to the stored ones.
- `updateEtudeSetup` clears the flags when both key and octaves change.
- `updateEtudeSetup` still rejects an epoch mismatch and performs no octave invalidation.

## key-domain.spec.ts

21 tests covering `SUPPORTED_KEYS`, `validateKey`, and `deriveKeyPitches` from `src/lib/key-domain.ts`:

- `SUPPORTED_KEYS` contains exactly the eighteen supported keys (nine major, nine natural minor), no more and no less.
- No supported key has more than four accidentals (verified via the derived pitches).
- `validateKey` accepts each of the eighteen supported keys and trims surrounding whitespace.
- `validateKey` rejects an unsupported major key (B major — five sharps), an unsupported minor key (G-sharp minor — five sharps), an over-four-accidental key (D-flat major — five flats), an empty string, null, undefined, and a non-string value, each with a typed failure and never coercing to a default.
- `deriveKeyPitches` returns exactly seven pitch names for every supported key.
- `deriveKeyPitches` returns the exact expected pitch array for every supported key.
- For E-flat major the derived pitches include B-flat and E-flat (not A-sharp and D-sharp).
- For A-flat major the derived pitches include A-flat, B-flat, D-flat, and E-flat.
- For F-sharp minor the derived pitches include F-sharp and C-sharp.
- For C-sharp minor the derived pitches include C-sharp, D-sharp, and G-sharp.
- For every natural-minor key the seventh scale degree is a whole step below the tonic (natural minor, not harmonic or melodic minor).
- No supported key produces enharmonic duplicate pitch classes.

## setup-validator.spec.ts

44 tests covering `validateSetup` from `src/lib/setup-validator.ts`:

- Measure count: accepts boundaries 4 and 32, accepts mid-range 16, rejects 3 (below min), rejects 33 (above max), rejects decimals, rejects non-numeric strings, rejects empty string (no coercion), rejects null (no coercion), rejects undefined (no coercion).
- Time signature: accepts 2/4, 3/4, 4/4; rejects 6/8, rejects 5/4, rejects empty string (no coercion), rejects null (no coercion).
- Hand: accepts left, right, both; rejects unknown strings, rejects empty string (no coercion), rejects null (no coercion).
- Key signature: accepts each of the eighteen supported keys and echoes it back; rejects an unsupported key (B major), an over-four-accidental key (G-sharp minor), an empty string (no coercion to C major), null, undefined, and a non-string value, each with a key field failure.
- Octaves: accepts a valid set and returns the normalized `number[]`; normalizes arbitrary order to one ascending set; normalizes duplicates to one ascending set; accepts a single octave as a one-element array; rejects an empty array, null, undefined, an out-of-range octave below the minimum, an out-of-range octave above the maximum, and a non-numeric string element, each with an octaves field failure.
- Multiple invalid fields: all reported together (including the key and octaves fields), not first-only; an invalid key and an empty octave array reported together; never throws on invalid input.

## music-domain.spec.ts

28 tests covering `validateOctaves`, `expandOctaveRange`, `deriveScaleRangePitches`, and `deriveAvailablePitches` from `src/lib/music-domain.ts`:

- `validateOctaves`: accepts a valid ascending set and returns the normalized `number[]`; normalizes arbitrary order to one ascending set; normalizes duplicate values to one ascending set; accepts a single octave; accepts the full range 2-6; rejects a non-array, null, undefined, an empty array, a non-numeric string element, an out-of-range octave below the minimum (1), an out-of-range octave above the maximum (7), and a non-integer decimal, each with a typed `OctaveValidationFailure` naming the octaves field.
- `expandOctaveRange`: returns the contiguous min/max regardless of input order; returns the same range for a single-element selection.
- `deriveScaleRangePitches`: produces the tonic-to-tonic pitch set for D major octave 4 using key spelling (D E F-sharp G A B C-sharp D5); produces the tonic-to-tonic pitch set for E-flat major octave 4 using flat spelling (E-flat F G A-flat B-flat C D-flat E-flat5); produces the correct set for C major octave 4 (C D E F G A B C5).
- `deriveAvailablePitches`: includes C7 for G major octaves 2 through 6 (C in key, C7 inside range); includes C7 for C major octaves 2 through 6; excludes every octave-7 pitch other than C7 for A minor octaves 2 through 6; leaves C7 absent for D major octaves 2-6 (C not in key, range reaches octave 7); leaves C7 absent for F-sharp minor octaves 2-6 (C not in key); produces identical pitches for canonical and arbitrary-order submissions.

## etude-form-parser.spec.ts

16 tests covering `parseParameterForm` from `src/lib/etude-form-parser.ts`:

- Parses a valid body to the expected raw values with no failures.
- Rejects an empty string for a field as a field-addressable failure (no coercion).
- Rejects an absent field as a field-addressable failure.
- Rejects a repeated field with two values rather than taking first or last.
- Ignores an unexpected extra field and validates the expected fields identically.
- Parses fields in an arbitrary order identically to the canonical order.
- Never throws on a body with many extra fields.
- Never throws on an empty form.
- Applies a stated `first-wins` normalization when the spec declares it.
- `string-multi` field type: collects all submitted values into a `string[]` in submission order; preserves arbitrary submission order without sorting; preserves duplicate values without deduplicating; rejects an absent multi-value field as a field-addressable failure; returns a one-element array for a single submitted value; mixes a single-value field and a multi-value field in the same result; ignores an unexpected extra field and leaves the multi-value field intact.

## canonical-route.spec.ts

2 tests covering `resolveCanonicalRoute` from `src/lib/canonical-route.ts`:

- Routes to `/etude/setup` when no aggregate exists.
- Routes to `/etude/setup` when setup is not confirmed.
