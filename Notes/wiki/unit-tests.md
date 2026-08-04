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
