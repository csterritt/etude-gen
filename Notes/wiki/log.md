# Wiki Log

A chronological, append-only log of ingests, queries, and lint passes.

## [2026-08-04] ingest | issue-001 etude infrastructure config and health

Ingested the configuration and health validation surface for the etude feature (issue #1).

New source files:
- `src/lib/config-validator.ts` — validates etude configuration bindings (D1, R2, LilyPond secrets, timeout) and collects all defects in one pass.
- `src/routes/build-health.tsx` — split health route with anonymous liveness and privileged detailed report; pluggable rhythm-catalog health surface.

Modified source files:
- `wrangler.jsonc` — added private R2 bucket binding (`ETUDE_GEN_STORAGE`) and LilyPond vars (`LILYPOND_SERVICE_URL`, `LILYPOND_API_KEY`, `LILYPOND_TIMEOUT_MS`).
- `src/local-types.ts` — extended `Bindings` with R2 binding, LilyPond vars, and `OPERATOR_TOKEN`.
- `src/constants.ts` — added `PATHS.HEALTH`.
- `src/index.ts` — wired `buildHealth` route.

New test files:
- `tests/config-validator.spec.ts` — 16 tests covering complete config, missing values, timeout validation, aggregate defects, and no-secret-leak guarantees.
- `tests/health-route.spec.ts` — 13 tests covering anonymous liveness, privileged detailed report, catalog contribution surface, and no-secret-leak guarantees.
- `tests/no-hardcoded-lilypond-version.spec.ts` — 1 guardrail test ensuring no permanent LilyPond version string in `src/`.

## [2026-08-04] ingest | issue-002 correlation ids safe errors logging

Ingested the correlation identifier, PII-free structured logging, and safe error surface for the etude feature (issue #2).

New source files:
- `src/lib/correlation-id.ts` — generates a UUID v4 correlation identifier per call via `crypto.randomUUID()`.
- `src/middleware/correlation-id.ts` — generates a per-request UUID v4, stores it on the Hono context, and sets the `X-Correlation-ID` response header; wired globally as the first middleware.
- `src/routes/build-safe-error.tsx` — safe error page and global `app.onError` handler; logs with the correlation identifier (no PII/secrets) and renders a generic safe message plus the visible identifier.
- `src/lib/correlation-context.ts` — typed correlation context (`request` vs `operation` kind), service stub interfaces (Workflow Service, renderer, repository, artifact-store), and a deferred-cleanup runner that carries the originating id or generates a labelled operation id.
- `src/lib/refusal-logger.ts` — typed refusal categories (`lost-lock`, `stale-operation`, `stale-epoch`, `stale-Piece`) and a logger that emits only safe fields.
- `src/routes/test/forced-error.ts` — test-only forced-error endpoint gated by the test-route flag.

Modified source files:
- `src/lib/logger.ts` — added `redactContext` (redacts names, email, session, token, secret, key, authorization, bearer, credential, password, LilyPond request bodies; passes `correlationId` through) and `logRoutineSuccess` no-op; `logInfo`/`logError`/`logWarn` now redact context.
- `src/local-types.ts` — added `correlationId` to `AppVariables`.
- `src/index.ts` — wired `correlationIdMiddleware` first, `handleUnexpectedError` as `app.onError`, and the `testForcedErrorRouter` under the test-route flag.

New test files:
- `tests/correlation-id.spec.ts` — 3 tests for UUID v4 generation and uniqueness.
- `tests/logger-redaction.spec.ts` — 14 tests for sensitive-field redaction, correlation passthrough, and routine-success no-log.
- `tests/correlation-middleware.spec.ts` — 3 tests for the header, context storage, and per-request uniqueness.
- `tests/safe-error-page.spec.ts` — 5 tests for the safe message, no-leak, header, and safe logging.
- `tests/correlation-propagation.spec.ts` — 9 tests for service-stub propagation and deferred-cleanup operation ids.
- `tests/refusal-logging.spec.ts` — 10 tests for typed categories and no forbidden fields.
- `e2e-tests/general/06-correlation-id-and-safe-error.spec.ts` — 2 Playwright tests for the header and forced-error safe page.

Wiki pages updated: `source-code.md`, `unit-tests.md`, `e2e-tests.md` (new), `project-overview.md`, `index.md`.
