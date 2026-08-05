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

15 tests covering `loadOrCreateEtudeParams`, `loadEtudeParams`, and `updateEtudeSetup` from `src/lib/etude-params-repository.ts`, using the `tests/helpers/test-db.ts` real-SQLite helper:

- Creates one record with the default values (8 measures, 4/4, C major, octave range 4, right hand, `workflowVersion` 1, `aggregateEpoch` 1) for a new user.
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

## setup-validator.spec.ts

20 tests covering `validateSetup` from `src/lib/setup-validator.ts`:

- Measure count: accepts boundaries 4 and 32, accepts mid-range 16, rejects 3 (below min), rejects 33 (above max), rejects decimals, rejects non-numeric strings, rejects empty string (no coercion), rejects null (no coercion), rejects undefined (no coercion).
- Time signature: accepts 2/4, 3/4, 4/4; rejects 6/8, rejects 5/4, rejects empty string (no coercion), rejects null (no coercion).
- Hand: accepts left, right, both; rejects unknown strings, rejects empty string (no coercion), rejects null (no coercion).
- Multiple invalid fields: all reported together, not first-only; never throws on invalid input.

## etude-form-parser.spec.ts

9 tests covering `parseParameterForm` from `src/lib/etude-form-parser.ts`:

- Parses a valid body to the expected raw values with no failures.
- Rejects an empty string for a field as a field-addressable failure (no coercion).
- Rejects an absent field as a field-addressable failure.
- Rejects a repeated field with two values rather than taking first or last.
- Ignores an unexpected extra field and validates the expected fields identically.
- Parses fields in an arbitrary order identically to the canonical order.
- Never throws on a body with many extra fields.
- Never throws on an empty form.
- Applies a stated `first-wins` normalization when the spec declares it.

## canonical-route.spec.ts

2 tests covering `resolveCanonicalRoute` from `src/lib/canonical-route.ts`:

- Routes to `/etude/setup` when no aggregate exists.
- Routes to `/etude/setup` when setup is not confirmed.
