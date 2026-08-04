# Tasks for #2: Correlation IDs, safe error responses, and PII-free structured logging

Parent issue: #2
Parent PRD: `Notes/PRD-etude-generator.md`

## Tasks

### 1. Correlation ID generator tests

**Type**: RED
**Output**: `tests/correlation-id.spec.ts` containing failing assertions that a generated correlation identifier matches UUID v4 format and that two generated identifiers differ.
**Depends on**: none

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, kebab-case test filenames, `bun:test`). Reference `tests/validators.spec.ts` and `tests/health-route.spec.ts` for the existing `bun:test` style in this repo.

Write `tests/correlation-id.spec.ts` using `bun:test`. The generator does not exist yet, so these tests must fail. Assert that a generated identifier matches the canonical UUID v4 string format (8-4-4-4-12 hex digits with the version nibble `4` and a valid variant nibble), and that two successive calls return different identifiers. Do not assert any specific UUID value. Import the generator from `src/lib/correlation-id.ts` (a module that does not yet exist).

---

### 2. Correlation ID generator implementation

**Type**: GREEN
**Output**: `src/lib/correlation-id.ts` that makes the task-1 tests pass by generating a UUID v4 per call.
**Depends on**: 1

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, early returns, `readonly` for immutable result fields, one export per file where practical). Follow the existing `src/lib/` module style (see `src/lib/validators.ts`, `src/lib/url-validation.ts`).

Implement the minimal code to make task-1 tests pass. Export a function that returns a freshly generated UUID v4 string, using the platform's `crypto.randomUUID()` (available in the Cloudflare Workers runtime and Node/Bun). Do not add middleware, header, or logging behavior here — those are later tasks. Keep the module focused on generation only.

---

### 3. Logger redaction and correlation inclusion tests

**Type**: RED
**Output**: `tests/logger-redaction.spec.ts` containing failing assertions that log payloads redact each sensitive field category (names, email addresses, session values, Bearer tokens, secrets, service credentials, LilyPond request bodies), that a `correlationId` supplied in context is included verbatim in the emitted line, and that a routine successful operation emits no log line.
**Depends on**: none

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, kebab-case test filenames, arrow functions, explicit types, braces around all `if`/`while` bodies).

Write `tests/logger-redaction.spec.ts` using `bun:test`. The existing `src/lib/logger.ts` exports `logInfo`, `logError`, `logWarn`, and `sanitizeError`; these tests must drive new redaction behavior that does not yet exist, so they should fail. Capture `console.log`/`console.error`/`console.warn` output (e.g. by spying on the console methods) and parse each emitted line as JSON. Assert that for each sensitive category — a name field, an email field, a session token/value field, a `Bearer`-prefixed authorization value, a secret or API key field, service credentials, and a LilyPond request body field — the serialized payload never contains the raw sensitive value and instead carries a redaction marker. Assert that a `correlationId` string passed in the context object appears verbatim in the serialized line. Assert that calling the logger to record a routine successful operation (a helper that this slice will introduce, e.g. a `logRoutineSuccess` no-op or the absence of a call) emits no line — express this by asserting that the success path of an operation does not invoke any console output method. Do not include real secret values in the test file beyond clearly fake placeholders.

---

### 4. Extend logger with redaction and correlation passthrough

**Type**: GREEN
**Output**: `src/lib/logger.ts` extended (not replaced) so that `logInfo`, `logError`, and `logWarn` redact every sensitive field category and pass a supplied `correlationId` through verbatim, making the task-3 tests pass.
**Depends on**: 3

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, early returns, `readonly` for immutable fields). Extend the existing `src/lib/logger.ts` rather than creating a parallel logging system.

Implement the minimal changes to make task-3 tests pass. Add a redaction pass over the context object that replaces values for sensitive keys (names, email, session/token/secret/key/authorization fields, service credentials, and LilyPond request bodies) with a redaction marker, while leaving non-sensitive fields and the `correlationId` field untouched. Preserve the existing `sanitizeError`, `logInfo`, `logError`, and `logWarn` export signatures (additive change only). Do not introduce a new module. Do not add middleware or HTTP behavior here.

---

### 5. Correlation middleware tests

**Type**: RED
**Output**: `tests/correlation-middleware.spec.ts` containing failing assertions that the correlation middleware generates a UUID, sets the `X-Correlation-ID` response header, stores the identifier in the Hono context for downstream handlers, and that two separate requests receive different identifiers.
**Depends on**: 1, 2

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, kebab-case test filenames, arrow functions, explicit types, braces around all `if`/`while` bodies).

Write `tests/correlation-middleware.spec.ts` using `bun:test`. The middleware does not exist yet, so these tests must fail. Construct a minimal Hono app, apply the middleware from `src/middleware/correlation-id.ts`, and add a trivial handler that returns the stored identifier from context. Assert the response carries an `X-Correlation-ID` header whose value is a UUID v4, that the handler-returned identifier matches the header value, and that two requests yield different identifiers. Follow the existing middleware style in `src/middleware/signed-in-access.ts` and `src/middleware/guard-sign-up-mode.ts`.

---

### 6. Correlation middleware and global wiring

**Type**: GREEN
**Output**: `src/middleware/correlation-id.ts` that makes the task-5 tests pass, applied globally in `src/index.ts` before route handlers so every response carries the `X-Correlation-ID` header.
**Depends on**: 5

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, `createMiddleware` from `hono/factory`, `readonly` for immutable fields). Follow the existing middleware style in `src/middleware/signed-in-access.ts`.

Implement the minimal middleware to make task-5 tests pass: generate a UUID v4 via the task-2 generator, store it on the Hono context under a typed key, and set the `X-Correlation-ID` response header. Then wire it globally in `src/index.ts` as the first middleware applied to the `app` (before `secureHeaders`, CSRF, body limit, and route declarations) so every response — including error responses — carries the header. Extend `AppVariables` in `src/local-types.ts` with the correlation identifier field. Do not add redaction or error-page behavior here.

---

### 7. Safe error page and global error handler tests

**Type**: RED
**Output**: `tests/safe-error-page.spec.ts` containing failing assertions that an unexpected error renders a generic safe message plus the request's correlation identifier and no stack trace, SQL, or service detail, and that the logged error line carries the same correlation identifier and no PII or secret values.
**Depends on**: 4, 6

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, kebab-case test filenames, arrow functions, explicit types, braces around all `if`/`while` bodies, `data-testid` attributes named `name-action` for actionable elements).

Write `tests/safe-error-page.spec.ts` using `bun:test`. The safe error page and global error handler do not exist yet, so these tests must fail. Construct a minimal Hono app with the correlation middleware applied and a route that throws an error carrying sensitive detail (a fake stack, a SQL fragment, a service response snippet, and a PII value), then trigger `app.onError`. Assert the rendered response body contains a generic safe message and the request's correlation identifier, and that it does not contain the stack trace, SQL fragment, service detail, or PII value. Spy on the console error method and assert the logged line carries the same correlation identifier and none of the sensitive values. Use a `data-testid` such as `safe-error-correlation-id` for the visible identifier element so later e2e tests can locate it.

---

### 8. Safe error page and global error handler

**Type**: GREEN
**Output**: `src/routes/build-safe-error.tsx` rendering the generic safe message and visible correlation identifier, plus `app.onError` wiring in `src/index.ts`, making the task-7 tests pass.
**Depends on**: 7

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, Hono route style matching existing routes, `data-testid` naming for actionable elements, DaisyUI components for layout). Follow the existing route-builder style in `src/routes/build-404.tsx` and `src/routes/build-private.tsx`.

Implement the minimal code to make task-7 tests pass. Create `src/routes/build-safe-error.tsx` exporting a renderer that shows a generic safe message and the request's correlation identifier (read from context) with a `data-testid` such as `safe-error-correlation-id`, and no stack trace, SQL, or service detail. Wire `app.onError` in `src/index.ts` to log the error via the redacting logger (passing the correlation identifier from context) and return the rendered safe error page with the `X-Correlation-ID` header preserved. Do not modify the parent issue or PRD.

---

### 9. Correlation propagation stub tests

**Type**: RED
**Output**: `tests/correlation-propagation.spec.ts` containing failing assertions that a request's correlation identifier reaches stub Workflow Service, renderer, repository, and artifact-store calls; that deferred cleanup started by a request carries the originating identifier; and that deferred cleanup with no remaining request context generates its own identifier labelled as an operation identifier rather than a request one.
**Depends on**: 1, 2

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, kebab-case test filenames, arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies).

Write `tests/correlation-propagation.spec.ts` using `bun:test`. The stubs do not exist yet, so these tests must fail. Define fake stub implementations of the four service interfaces (Workflow Service, renderer, repository, artifact-store) that record the correlation identifier they receive, plus a deferred-cleanup runner. Assert that when an operation is invoked with a request correlation identifier, each of the four stubs records that same identifier. Assert that deferred cleanup started by a request records the originating request identifier. Assert that deferred cleanup invoked with no remaining request context instead receives a freshly generated identifier labelled as an operation identifier (distinct from a request identifier), and that the two identifier kinds are distinguishable in the recorded context. Import the stub interfaces and the deferred-cleanup runner from `src/lib/correlation-context.ts` (a module that does not yet exist).

---

### 10. Correlation propagation stubs

**Type**: GREEN
**Output**: `src/lib/correlation-context.ts` plus stub modules/contracts for the Workflow Service, renderer, repository, and artifact-store, and a deferred-cleanup runner, each accepting a correlation identifier parameter, making the task-9 tests pass.
**Depends on**: 9

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, interfaces over types, no `any`, braces around all `if`/`while` bodies, `readonly` for immutable fields, RO-RO where useful). Follow the existing `src/lib/` module style.

Implement the minimal code to make task-9 tests pass. Define a typed correlation context carrying either a request identifier or an operation identifier (with a labelled kind discriminator so the two are distinguishable). Define stub interfaces for the Workflow Service, renderer, repository, and artifact-store that accept a correlation identifier parameter — these are contracts later issues will fill with real behavior; this slice provides only the typed surface and trivial stub implementations sufficient for the tests. Implement a deferred-cleanup runner that carries forward an originating request identifier when one is in scope, and otherwise generates a fresh operation identifier labelled as such via the task-2 generator. Do not implement real LilyPond, R2, or D1 behavior here.

---

### 11. Refusal logging tests

**Type**: RED
**Output**: `tests/refusal-logging.spec.ts` containing failing assertions that each of the lost-lock, stale-operation, stale-epoch, and stale-Piece refusals is logged with a typed category and none of a user identifier, Piece content, LilyPond source, grant identifier, or credential.
**Depends on**: 4

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, kebab-case test filenames, arrow functions, explicit types, braces around all `if`/`while` bodies).

Write `tests/refusal-logging.spec.ts` using `bun:test`. The refusal logger does not exist yet, so these tests must fail. For each of the four refusal categories — `lost-lock`, `stale-operation`, `stale-epoch`, `stale-Piece` — invoke the refusal logger with a context object that includes a user identifier, a Piece content value, a LilyPond source string, a grant identifier, and a credential, plus a correlation identifier. Spy on the console error method and assert the emitted line carries the correct typed category and the correlation identifier, and that it does not contain any of the forbidden values (user identifier, Piece content, LilyPond source, grant identifier, credential). Use clearly fake placeholder values for the forbidden fields.

---

### 12. Refusal logging module

**Type**: GREEN
**Output**: `src/lib/refusal-logger.ts` with a typed refusal-category union and a logger that emits only safe context, making the task-11 tests pass.
**Depends on**: 11

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, interfaces over types, no `any` and no enums — use a string-literal union and a typed map instead, braces around all `if`/`while` bodies, `readonly` for immutable fields, early returns). Follow the existing `src/lib/` module style.

Implement the minimal code to make task-11 tests pass. Define a refusal-category string-literal union (`lost-lock`, `stale-operation`, `stale-epoch`, `stale-Piece`) and a typed refusal context that carries only safe, diagnosable fields plus a correlation identifier. Export a refusal logger that emits one structured line via the redacting `logWarn`/`logError` from `src/lib/logger.ts`, including the typed category and the correlation identifier, and excluding user identifiers, Piece content, LilyPond source, grant identifiers, and credentials. Do not implement the refusal decisions themselves — later issues own those; this slice provides only the logging surface.

---

### 13. E2e: correlation header and forced error safe message

**Type**: RED
**Output**: An e2e test under `e2e-tests/` asserting the `X-Correlation-ID` response header is present on any page and that a forced unexpected error renders the safe message with a visible identifier.
**Depends on**: 6, 8

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (Playwright for e2e, `data-testid` attributes named `name-action` for actionable elements, kebab-case). Look in `e2e-tests/support` for helpers and `e2e-tests/sign-in` for examples before writing.

Write a Playwright test under `e2e-tests/` (e.g. `e2e-tests/general/correlation-id-and-safe-error.spec.ts`). Assert that a GET to any signed-in page returns a response carrying an `X-Correlation-ID` header whose value is a UUID v4. Then trigger a forced unexpected server error via a test-only route (or a dedicated forced-error endpoint introduced for this test and gated by the existing test-route flag) and assert the rendered page shows the generic safe message and a visible correlation identifier (located via the `safe-error-correlation-id` `data-testid`), and that the page body does not contain any stack trace, SQL, or service detail. The test may fail initially if the forced-error route or the visible identifier element does not yet exist.

---

### 14. Verify e2e and final wiring

**Type**: GREEN
**Output**: The task-13 Playwright test passes; any wiring gaps in `src/index.ts`, the safe error page, or a test-only forced-error route are filled.
**Depends on**: 13

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, `data-testid` naming, test-only routes gated by the existing `isTestRouteEnabled` flag with `PRODUCTION:REMOVE` markers).

Make the task-13 e2e test pass. If a forced-error test route is needed, add it under `src/routes/test/` gated by the existing `isTestRouteEnabled` flag (follow the pattern of the existing test routers in `src/routes/test/`), and wire it in `src/index.ts` behind the same flag. Confirm the `X-Correlation-ID` header is present on normal pages and on the forced-error response, and that the safe error page renders the visible identifier. Do not modify the parent issue or PRD. Do not commit secrets.

---

### 15. Document correlation, logging, and safe-error surface

**Type**: DOCUMENT
**Output**: Wiki updates describing the correlation identifier lifecycle, the `X-Correlation-ID` header, the redaction rules, the safe error page contract, the operation-vs-request identifier distinction, the four typed refusal categories, and the routine-success-no-log rule. Follow `Notes/wiki/wiki-rules.md` and `Notes/wiki/AGENTS.md` for wiki ingestion.
**Depends on**: 14

Update the relevant wiki pages (`Notes/wiki/source-code.md`, `Notes/wiki/index.md`, `Notes/wiki/log.md`, and `Notes/wiki/project-overview.md` where appropriate) to record the new modules: `src/lib/correlation-id.ts`, the extended `src/lib/logger.ts`, `src/middleware/correlation-id.ts`, `src/routes/build-safe-error.tsx`, `src/lib/correlation-context.ts` and its stubs, and `src/lib/refusal-logger.ts`. Append a `## [YYYY-MM-DD] ingest | issue-002 correlation ids safe errors logging` entry to `Notes/wiki/log.md`. Do not modify the parent issue or the parent PRD.

---

### 16. Code walkthrough

**Type**: CODE WALKTHROUGH
**Output**: `Notes/walkthroughs/issue-002-correlation-ids-safe-errors-logging/code-walkthrough/` containing the files generated by `uvx showboat` for this implementation.
**Depends on**: 15

Run `uvx showboat --help` for current usage, then generate a walkthrough of the issue-002 implementation into a new directory `Notes/walkthroughs/issue-002-correlation-ids-safe-errors-logging/code-walkthrough/`. Place all generated files there.

---

### 17. Human: review correlation and logging contract

**Type**: REVIEW
**Output**: A human confirms the redaction rules, the four refusal categories, the operation-vs-request identifier distinction, and the routine-success-no-log rule match the PRD's "Validation, errors, logging, and accessibility" section and cross-cutting contract section 7.
**Depends on**: 16

This is a human-in-the-loop step. The human must review the implemented correlation and logging surface against the parent PRD and `Notes/issues/etude-cross-cutting-contract.md` section 7, confirming: every response carries an `X-Correlation-ID` UUID; the safe error page shows the identifier and no technical detail; logs never carry names, emails, session values, Bearer tokens, secrets, service credentials, or LilyPond request bodies; correlation propagates into the four service stubs and deferred cleanup; deferred work without request context generates a labelled operation identifier; the four refusal categories are logged with typed categories and no forbidden fields; and routine successful operations emit no log line. Record the result in the project history. Do not modify the parent issue or PRD.

---
