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

## [2026-08-04] ingest | issue-003 etude entry route replaces private

Ingested the `/etude` authenticated entry route and `/private` removal (issue #3).

New source files:
- `src/routes/build-etude.tsx` — authenticated etude entry route (`GET /etude`) with `signedInAccess` middleware, secure headers, and no-cache behavior; placeholder heading with `etude-page-banner` testid.

Deleted source files:
- `src/routes/build-private.tsx` — removed entirely; `/private` is unregistered and falls through to the standard 404 handler.

Modified source files:
- `src/constants.ts` — removed `PATHS.PRIVATE`, added `PATHS.ETUDE`.
- `src/index.ts` — removed `buildPrivate` import/call, added `buildEtude` import/call.
- `src/lib/auth.ts` — `redirectTo` changed from `/private` to `/etude`.
- `src/routes/auth/better-auth-response-interceptor.ts` — `handleVerifiedSignIn` redirects to `PATHS.ETUDE`.
- `src/routes/auth/build-sign-in.tsx`, `build-sign-up.tsx`, `build-gated-sign-up.tsx`, `build-interest-sign-up.tsx`, `build-gated-interest-sign-up.tsx`, `handle-interest-sign-up.ts`, `handle-gated-interest-sign-up.ts` — already-signed-in redirects repointed from `PATHS.PRIVATE` to `PATHS.ETUDE`.
- `src/routes/profile/build-profile.tsx` — `go-back-action` link href changed to `PATHS.ETUDE`.
- `src/routes/build-root.tsx` — protected-content link href changed to `PATHS.ETUDE`, testid renamed from `visit-private-action` to `visit-etude-action`.

New test files:
- `e2e-tests/etude/01-etude-protected-route.spec.ts` — 2 tests for signed-out denial and signed-in access with no-cache headers.
- `e2e-tests/etude/02-etude-destinations-and-private-removal.spec.ts` — 4 tests for sign-in destination, profile link, root link, and `/private` 404.

Modified test files:
- `e2e-tests/support/test-data.ts` — `BASE_URLS.PRIVATE` → `BASE_URLS.ETUDE`.
- `e2e-tests/support/page-verifiers.ts` — `verifyOnProtectedPage` → `verifyOnEtudePage` (checks `etude-page-banner`).
- `e2e-tests/support/navigation-helpers.ts` — `navigateToPrivatePage` → `navigateToEtudePage`.
- `e2e-tests/support/auth-helpers.ts`, `workflow-helpers.ts` — updated to `verifyOnEtudePage`.
- 10 existing spec files updated from `/private` references to `/etude` equivalents.

Wiki pages updated: `source-code.md`, `e2e-tests.md`, `project-overview.md`.

## [2026-08-04] ingest | issue-004 etude params aggregate defaults resume

Ingested the etude parameter aggregate, repository, canonical routing, and resume-on-return behavior (issue #4).

New source files:
- `src/lib/etude-params-repository.ts` — repository for the `etude_params` aggregate; `loadOrCreateEtudeParams` (atomic insert-or-load, uniqueness-violation-as-load) and `loadEtudeParams` (owner-scoped read); `EtudeParams` domain interface encapsulating physical columns.
- `src/lib/canonical-route.ts` — pure resolver mapping aggregate state to the canonical route (no aggregate / setup unconfirmed → `/etude/setup`).

Modified source files:
- `src/db/schema.ts` — added `etude_params` table (owner FK + cascade + DB UNIQUE, default values, `workflowVersion`, `aggregateEpoch`, three confirmation flags, timestamps) and inferred types.
- `src/constants.ts` — added `PATHS.ETUDE_SETUP`.
- `src/routes/build-etude.tsx` — `GET /etude` now load-or-create-and-redirect to the canonical route; added `GET /etude/setup` stub route with `etude-setup-banner`.

New test files:
- `tests/helpers/test-db.ts` — in-memory SQLite test-DB helper applying the production schema.
- `tests/helpers/test-db.spec.ts` — 2 smoke tests for the helper.
- `tests/etude-params-repository.spec.ts` — 9 tests for defaults, idempotency, owner-scoping, uniqueness, losing-caller path, Promise.all idempotency, no confirmed steps, cascade.
- `tests/canonical-route.spec.ts` — 2 tests for the no-aggregate and setup-unconfirmed cases.
- `e2e-tests/etude/03-etude-resume.spec.ts` — 2 Playwright tests for redirect-to-setup and resume-on-return.

Modified test files:
- `e2e-tests/support/page-verifiers.ts` — `verifyOnEtudePage` now checks `etude-setup-banner`.
- `e2e-tests/etude/01-etude-protected-route.spec.ts`, `02-etude-destinations-and-private-removal.spec.ts` — updated to assert `etude-setup-banner`.

Migration: `drizzle/0000_outstanding_wildside.sql` generated and applied to local D1 via `build-schema-update.sh`.

Wiki pages updated: `source-code.md`, `e2e-tests.md`, `project-overview.md`, `unit-tests.md`.

## [2026-08-04] ingest | issue-005 setup step measures meter hands

Ingested the setup-step form, domain validator, reusable form parser, and `updateEtudeSetup` repository function (issue #5).

New source files:
- `src/lib/setup-validator.ts` — authoritative domain validator for measure count (4-32), time signature (2/4, 3/4, 4/4), and hand (left, right, both); reports all failures together; never coerces invalid values to defaults.
- `src/lib/etude-form-parser.ts` — reusable parameter-form parser tolerating hostile shapes (absent, empty, repeated, extra, arbitrary-order fields) without throwing; `FieldSpec`-driven for reuse by later issues.

Modified source files:
- `src/lib/etude-params-repository.ts` — added `updateEtudeSetup` (compare-and-set on `aggregateEpoch`, increments `workflowVersion`, sets `setupConfirmed`).
- `src/routes/build-etude.tsx` — `GET /etude/setup` now renders the real form (native HTML constraints, accessible labels, hidden `workflowVersion`); added `POST /etude/setup` handler (parse → validate → load epoch → conditional update → 303 redirect; hostile shapes rejected with 303, never 500).

New test files:
- `tests/setup-validator.spec.ts` — 20 tests for measure/meter/hand validation, boundary values, no-coercion, and multi-field reporting.
- `tests/etude-form-parser.spec.ts` — 9 tests for valid parsing, hostile shapes, arbitrary order, never-throws, and first-wins normalization.
- `e2e-tests/etude/04-etude-setup-form.spec.ts` — 1 Playwright test for the GET form (pre-populated defaults, native constraints, accessible labels, hidden version).
- `e2e-tests/etude/05-etude-setup-submit.spec.ts` — 9 Playwright tests for valid submission persistence, rejection of out-of-range/unsupported/unknown values, hostile shapes (empty, absent, repeated, extra, arbitrary order), all with 303 and no 500.

Modified test files:
- `tests/etude-params-repository.spec.ts` — added 6 tests for `updateEtudeSetup` (persistence, version increment, setupConfirmed, unchanged flags, epoch mismatch, owner-scoping).

Wiki pages updated: `source-code.md`, `unit-tests.md`, `e2e-tests.md`.

## [2026-08-05] ingest | issue-006 key selection and pitch spelling

Ingested the key domain catalog, pitch derivation, extended setup validator, repository key persistence and key-change invalidation, setup form key field and derived-pitch display, and POST handler key validation (issue #6).

New source files:
- `src/lib/key-domain.ts` — eighteen supported keys (nine major, nine natural minor, no more than four accidentals), `validateKey` (typed failure, no coercion), `deriveKeyPitches` (static lookup table with conventional key-signature spelling; natural minor scale for minor keys).

Modified source files:
- `src/lib/setup-validator.ts` — added `keySignature` to `ValidSetup` and `SetupInput`, added `'key'` to the `SetupValidationFailure.field` union, delegated key validation to `validateKey` from `src/lib/key-domain.ts`; `validateSetup` now validates four fields and reports all failures together.
- `src/lib/etude-params-repository.ts` — `updateEtudeSetup` now persists `keySignature`, compares submitted values against stored values (no-op when all identical — no version increment, no write, no flag changes), and clears `notesConfirmed` and `splitConfirmed` only when the key actually changed (Issue 11 dependency map row for Key).
- `src/routes/build-etude.tsx` — added `key` to `SETUP_FIELD_SPEC`; `renderEtudeSetupForm` now renders a key `<select>` (`data-testid="key-field"`) offering the eighteen supported keys with the stored key pre-selected, plus a derived-pitch display (`data-testid="key-pitches"`) via `deriveKeyPitches`; the POST handler passes `raw.key` as `keySignature` to `validateSetup`.

New test files:
- `tests/key-domain.spec.ts` — 21 tests for the supported-key catalog, `validateKey` (accepts all eighteen, rejects unsupported/over-four-accidental/empty/null/undefined/non-string with typed failures, no coercion), and `deriveKeyPitches` (exact pitch arrays, conventional spelling, natural-minor seventh-degree check, no enharmonic duplicates).
- `e2e-tests/etude/06-etude-setup-key-form.spec.ts` — 3 Playwright tests for the GET form key control (eighteen options, default C major, accessible label, derived pitches) and the derived-pitch spelling after submitting E-flat major and F-sharp minor.
- `e2e-tests/etude/07-etude-setup-key-submit.spec.ts` — 7 Playwright tests for POST key submission (valid key persistence and pitch update, unsupported/empty/repeated key rejection with 303 and no 500, extra field ignored, identical resubmit no version increment, key-only change increments version).

Modified test files:
- `tests/setup-validator.spec.ts` — extended to 33 tests covering the key field (accepts all eighteen, rejects unsupported/over-four-accidental/empty/null/undefined/non-string with key field failures, no coercion) and multi-field reporting including the key.
- `tests/etude-params-repository.spec.ts` — extended to 22 tests covering key persistence, key-change invalidation (clears `notesConfirmed` and `splitConfirmed`), identical-key resubmit leaves flags unchanged, identical-all-fields resubmit no version increment, non-key-only change increments version but does not clear flags, epoch mismatch still rejects with no invalidation.
- `e2e-tests/etude/05-etude-setup-submit.spec.ts` — two hostile-shape tests updated to include the `key` field in their submissions.

Wiki pages updated: `source-code.md`, `unit-tests.md`, `e2e-tests.md`, `project-overview.md`.

## [2026-08-06] ingest | issue-007 octave ranges, expansion, and C7 rule

Ingested the octave scale-range selection, contiguous expansion, and C7 cap implementation for the setup step (issue #7).

New source files:
- `src/lib/music-domain.ts` — octave validation (`validateOctaves`), contiguous range expansion (`expandOctaveRange`), tonic-to-tonic scale-range pitch derivation with B-to-C octave crossing (`deriveScaleRangePitches`), and the full available-pitch derivation with the C7 cap (`deriveAvailablePitches`). The C7 cap removes every octave-7 pitch except C7, and keeps C7 only when C natural belongs to the key.

Updated source files:
- `src/lib/etude-form-parser.ts` — added the `string-multi` field type for multi-value fields (collects all submitted values into a `string[]` in submission order, preserving duplicates and arbitrary order; an absent field is a field-addressable failure). `RawValues` now allows `string | string[]`.
- `src/lib/setup-validator.ts` — extended to five parameters: added the `octaves` field to `SetupInput`, `ValidSetup`, and `SetupValidationFailure`; delegates octave validation to `validateOctaves` from `music-domain.ts`; normalizes to an ascending `number[]` in `ValidSetup`.
- `src/lib/etude-params-repository.ts` — added `selectedOctaves` (comma-separated string) to the `EtudeParams` interface and `mapToDomain`; `buildDefaultRow` sets it to `'4'`; `updateEtudeSetup` persists it and clears `notesConfirmed`/`splitConfirmed` when either key or octaves change (Issue 11 dependency map rows for Key and Octave Range); the identical-resubmit check now includes the normalized octave string.
- `src/db/schema.ts` — added the `selectedOctaves` text column (default `'4'`) to `etude_params`; the legacy `octaveRange` integer column is retained but unused.
- `src/routes/build-etude.tsx` — the setup form now renders five checkboxes (`data-testid="octaves-field"`) for octaves 2-6 with the stored octaves pre-checked, and displays the lowest and highest available pitch (`data-testid="available-range"`) derived from the selected key and octaves via `deriveAvailablePitches`; the `SETUP_FIELD_SPEC` declares the octave field as `string-multi`; the POST handler passes `raw.octaves` to `validateSetup`.
- `drizzle/0001_green_avengers.sql` — migration adding the `selectedOctaves` column.

New test files:
- `tests/music-domain.spec.ts` — 28 tests covering octave validation (normalization, rejection of empty/null/undefined/out-of-range/non-numeric), range expansion, scale-range pitch derivation (D major, E-flat major, C major with B-to-C crossing), and available-pitch derivation with the C7 cap (C7 included for C/G major, excluded for D major/F-sharp minor, every other octave-7 pitch excluded).
- `e2e-tests/etude/08-etude-setup-octave-form.spec.ts` — 4 Playwright tests covering the octave checkbox group and derived-range display on the GET setup form.
- `e2e-tests/etude/09-etude-setup-octave-submit.spec.ts` — 6 Playwright tests covering POST octave submission (valid, out-of-range, empty, arbitrary-order/duplicate normalization, version increment on octave change, no increment on identical resubmit).

Updated test files:
- `tests/etude-form-parser.spec.ts` — extended to 16 tests covering the `string-multi` field type (collects all values in submission order, preserves duplicates and arbitrary order, rejects absent field, one-element array for single value, mixes with single-value fields, ignores extra fields).
- `tests/setup-validator.spec.ts` — extended to 44 tests covering the octaves field (accepts valid set with normalized `number[]`, normalizes arbitrary order and duplicates, accepts single octave, rejects empty/null/undefined/out-of-range/non-numeric with octaves field failures, reports invalid key and empty octaves together).
- `tests/etude-params-repository.spec.ts` — extended to 28 tests covering octave persistence (normalized comma-separated string), octave-change invalidation (clears flags when only octaves change), identical-octave resubmit leaves flags unchanged, identical-all-five-fields resubmit no version increment, both key and octaves change clears flags, epoch mismatch still rejects with no octave invalidation.
- `tests/canonical-route.spec.ts` — `baseParams` updated to include `selectedOctaves: '4'`.
- `e2e-tests/etude/05-etude-setup-submit.spec.ts` — all submissions updated to include `octaves: '4'`.
- `e2e-tests/etude/07-etude-setup-key-submit.spec.ts` — all submissions updated to include `octaves: '4'`.

Wiki pages updated: `source-code.md`, `unit-tests.md`, `e2e-tests.md`.


## [2026-08-06] ingest | Issue 8 — invalid submission redisplay

Added wiki entries for three new source files (`safe-redisplay.ts`, `validation-state-repository.ts`, `validation-state-helpers.ts`), updated `schema.ts` and `build-etude.tsx` entries, and added unit-test and e2e-test catalog entries for the Issue 8 invalid submission redisplay feature.


## [2026-08-07] ingest | Issue 9 — form accessibility error summary

Added wiki entries for two new source files (`src/components/error-summary.tsx`, `src/lib/error-summary-focus.ts`), updated the `build-etude.tsx` entry to reflect the Issue 9 changes (accessible error summary, focus-on-load script, instruction association, unique error ids, octaves fieldset, `ALLOW_SCRIPTS_SECURE_HEADERS`), and added unit-test and e2e-test catalog entries for the Issue 9 form accessibility error summary feature.

New source files:
- `src/components/error-summary.tsx` — shared accessible error-summary component and `buildErrorSummaryEntries` pure entry-builder.
- `src/lib/error-summary-focus.ts` — focus-on-load inline script builder.

New test files:
- `tests/error-summary.spec.ts` — 11 tests covering entry building, multi-error dedupe, field ordering, group-level errors, and anchor uniqueness.
- `tests/error-summary-focus.spec.ts` — 6 tests covering script shape, id interpolation, focus call, null guards, and content safety.
- `e2e-tests/etude/11-etude-setup-error-summary.spec.ts` — 10 Playwright tests covering error summary focus, link targets, form accessibility, native constraints, aria-describedby wiring, unique anchor ids, group-level errors, id uniqueness, no-summary-when-valid, and multi-error ordering.

Wiki pages updated: `source-code.md`, `unit-tests.md`, `e2e-tests.md`.
