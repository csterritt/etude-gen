# Tasks for #8: Invalid submissions redisplayed on the same step with safe values preserved

Parent issue: #8
Parent PRD: `Notes/PRD-etude-generator.md`

## Tasks

### 1. Write failing Bun tests for the validation-state store repository

**Type**: RED
**Output**: A failing `tests/validation-state-repository.spec.ts` that asserts `storeValidationState` persists a nonce-keyed, owner-scoped record with an `expiresAt` 5 minutes in the future and returns the opaque nonce; that `consumeValidationState` returns the stored payload for the matching nonce and owner, then deletes the record so a second consumption returns `null` (single-use); that an expired record returns `null` and is unusable; that a nonce presented by a different user returns `null` and reveals nothing about the other user's record; that an unknown nonce returns `null`; that each size bound is enforced (at most 32 field entries, at most 64 values per multi-value field, at most 128 bytes per stored value, at most 256 bytes per error message, at most 16 KB total) by dropping the offending field from redisplay rather than truncating it into a different value; and that a storage failure (simulated DB error) returns `Result.err` so the caller can fall back to the generic error path without a 500.
**Depends on**: none

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test` with `describe`/`it`/`expect`, `true-myth/result` for Result handling, arrow functions, explicit types, no `any`, kebab-case filenames, look at `tests/etude-params-repository.spec.ts` and `tests/helpers/test-db.ts` for the repository test pattern and the `createTestDb` helper).

Create `tests/validation-state-repository.spec.ts` importing from `bun:test` and `true-myth/result`, and from the not-yet-existing `src/lib/validation-state-repository.ts`. Use `createTestDb` from `tests/helpers/test-db.ts` to obtain a real in-memory SQLite database. The tests must cover: (a) `storeValidationState(db, userId, payload)` returns `Result.ok` with a nonce string that is opaque (not derived from the payload or user id), and the stored record's `expiresAt` is approximately 5 minutes after `createdAt`; (b) `consumeValidationState(db, nonce, userId)` returns `Result.ok` with the payload for the matching nonce and owner, and a second call with the same nonce returns `Result.ok(null)` (single-use consumption deletes the record); (c) a record whose `expiresAt` is in the past returns `Result.ok(null)` and is unusable even on first consumption; (d) a nonce stored for user A, presented by user B, returns `Result.ok(null)` and reveals nothing about user A's payload; (e) an unknown nonce returns `Result.ok(null)`; (f) a payload with more than 32 field entries has the excess fields dropped (not truncated) and the remaining fields still redisplay; (g) a multi-value field with more than 64 values has that field dropped entirely from redisplay (not truncated to 64); (h) a value exceeding 128 bytes has that field dropped (not truncated); (i) an error message exceeding 256 bytes has that error dropped (not truncated); (j) a total payload exceeding 16 KB has fields dropped from the end until under the limit, never truncating an individual value into a different value; (k) a simulated storage failure (e.g. a closed/corrupted DB) returns `Result.err` so the caller can fall back. Assert on `isOk`/`isErr`, on the presence or absence of fields in the returned payload, and on `null` vs non-`null` — do not assert on string messages. These tests must fail because the repository module does not exist yet.

---

### 2. Implement the validation-state store schema and repository

**Type**: GREEN
**Output**: A new Drizzle migration `drizzle/0002_*.sql` and corresponding `schema.sql` update adding the `etude_validation_state` table; `src/db/schema.ts` exports the new table; `src/lib/validation-state-repository.ts` exports `storeValidationState(db, userId, payload): Promise<Result<string, Error>>` and `consumeValidationState(db, nonce, userId): Promise<Result<ValidationStatePayload | null, Error>>`. The task-1 tests pass.
**Depends on**: 1

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, `Result`-returning style, one export per file where practical, define constants for magic numbers like the 5-minute expiry and the size bounds). Read `Notes/skills/code-writing/database-access` for the database access patterns and `Notes/skills/code-writing/comment-writing` for the comment conventions.

Add a new `etude_validation_state` table to `src/db/schema.ts` with columns: `nonce` (text primary key), `userId` (text not null, FK to `user.id` with cascade delete), `payload` (text not null — a JSON blob holding the field errors and safe redisplay values), `expiresAt` (integer timestamp not null), `createdAt` (integer timestamp not null). Generate a new migration file `drizzle/0002_*.sql` and regenerate `schema.sql` (concatenate all migrations with `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` and the `--> statement-breakpoint` markers, matching the existing format). Create `src/lib/validation-state-repository.ts` importing `Result` from `true-myth/result`, the new table from `src/db/schema`, and `withRetry` from `src/lib/db-access`. Define constants: `VALIDATION_STATE_TTL_MS = 5 * 60 * 1000`, `MAX_FIELD_ENTRIES = 32`, `MAX_VALUES_PER_FIELD = 64`, `MAX_VALUE_BYTES = 128`, `MAX_ERROR_BYTES = 256`, `MAX_TOTAL_BYTES = 16 * 1024`. Implement `storeValidationState` as an arrow function that generates a cryptographically random nonce (via `crypto.randomUUID()` or `crypto.getRandomValues`), constructs the expiry timestamp, inserts the row, and returns `Result.ok(nonce)`. Implement `consumeValidationState` as an arrow function that selects the row by nonce and userId, checks `expiresAt` against `Date.now()`, deletes the row (single-use), and returns `Result.ok(payload)` if valid and not expired, or `Result.ok(null)` if not found, expired, or owner-mismatched — all three cases are identical from the caller's perspective. Wrap both in `withRetry` following the existing repository pattern. Run the task-1 tests to confirm they pass.

---

### 3. Write failing Bun tests for the nonce cookie and validation-state redirect/consume helpers

**Type**: RED
**Output**: A failing `tests/validation-state-helpers.spec.ts` that asserts the nonce cookie is set with `HttpOnly`, `Secure`, `SameSite=Lax`, path-scoped to `/etude`, and a `Max-Age` of 300 (5 minutes); that the cookie value contains only the opaque nonce and no submitted value, field name, or error text; that `redirectWithValidationState` returns a 303 response with the `Set-Cookie` header and `Location` pointing to the same step; that `consumeValidationStateFromRequest` returns the payload for a valid nonce and deletes the cookie; that an unknown, expired, already-consumed, or foreign-user nonce all yield `null` identically and reveal nothing; and that when `storeValidationState` fails, the helper still returns a 303 redirect with a generic corrective error message (via the existing `redirectWithError` flash pattern) rather than a 500.
**Depends on**: 2

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, `true-myth/result`, arrow functions, explicit types, no `any`, kebab-case filenames). Look at `src/lib/redirects.tsx` for the existing `redirectWithError`/`redirectWithMessage` pattern and `src/lib/cookie-support.ts` for the cookie utilities.

Create `tests/validation-state-helpers.spec.ts` importing from `bun:test` and `true-myth/result`, and from the not-yet-existing `src/lib/validation-state-helpers.ts`. The tests must cover: (a) `redirectWithValidationState(c, redirectUrl, userId, payload)` calls `storeValidationState` and returns a `Response` with status 303, a `Location` header matching `redirectUrl`, and a `Set-Cookie` header whose value is the nonce cookie name followed by the nonce — assert the cookie attributes include `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/etude`, and `Max-Age=300`; (b) the cookie value contains only the nonce and no portion of the submitted values, field names, or error messages (e.g. assert the cookie value does not contain a known submitted string); (c) `consumeValidationStateFromRequest(c, userId)` reads the nonce cookie, calls `consumeValidationState`, returns `Result.ok(payload)` when valid, and sets a `Set-Cookie` header that deletes the nonce cookie (expired/empty); (d) an unknown nonce, an expired nonce, an already-consumed nonce, and a nonce stored for a different user all return `Result.ok(null)` identically — no error, no partial data, no indication of which case occurred; (e) when `storeValidationState` returns `Result.err`, `redirectWithValidationState` falls back to `redirectWithError` with a generic corrective message and still returns a 303, never a 500. Mock or stub the Hono context and the repository as needed (the helpers should accept the store/consume functions or the db as parameters so they are testable in isolation). These tests must fail because the helpers module does not exist yet.

---

### 4. Implement the nonce cookie and validation-state redirect/consume helpers

**Type**: GREEN
**Output**: `src/lib/validation-state-helpers.ts` exports `redirectWithValidationState` and `consumeValidationStateFromRequest`; new cookie constants added to `src/constants.ts` for the nonce cookie name and options. The task-3 tests pass.
**Depends on**: 3

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, `Result`-returning style). Read `Notes/skills/code-writing/production-code-control-comments` for the PRODUCTION comment convention (the `Secure` attribute may need a PRODUCTION toggle if testing runs over HTTP).

Add a `VALIDATION_STATE_NONCE` cookie name and a `VALIDATION_STATE_COOKIE_OPTIONS` object to `src/constants.ts` under the `COOKIES` export, with `httpOnly: true`, `sameSite: 'Lax'`, `path: '/etude'`, `secure: true` (with a PRODUCTION comment toggle if needed for local HTTP testing), and `maxAge: 300`. Create `src/lib/validation-state-helpers.ts` importing `Context` from `hono`, `getCookie`/`deleteCookie` from `hono/cookie`, `Result` from `true-myth/result`, the cookie constants from `src/constants`, `storeValidationState`/`consumeValidationState` from `src/lib/validation-state-repository`, and `redirectWithError` from `src/lib/redirects`. Implement `redirectWithValidationState` as a generic arrow function that takes the Hono context, redirect URL, db, userId, and payload, calls `storeValidationState`, and on success builds a 303 response with the nonce cookie set (appending to the `Set-Cookie` header directly on the response, matching the `redirectWithMessage` pattern in `src/lib/redirects.tsx`). On `storeValidationState` failure, fall back to `redirectWithError(c, redirectUrl, 'Your submission could not be processed. Please check your entries and try again.')` — never a 500. Implement `consumeValidationStateFromRequest` as an arrow function that reads the nonce cookie, returns `Result.ok(null)` if no cookie is present, otherwise calls `consumeValidationState(db, nonce, userId)` and deletes the nonce cookie via `Set-Cookie` on the response. Run the task-3 tests to confirm they pass.

---

### 5. Write failing Bun tests for safe-redisplay value shaping

**Type**: RED
**Output**: A failing `tests/safe-redisplay.spec.ts` that asserts `shapeRedisplayPayload` applies basic shape checks (only string or string-array values are echoed back; non-string types are dropped), enforces each bound (32 fields, 64 values per multi-value field, 128 bytes per value, 256 bytes per error, 16 KB total) by dropping the offending field rather than truncating it into a different value, returns a structured payload with `fieldErrors`, `safeValues`, and `droppedFields`, and never coerces an invalid value into a valid neighbouring value.
**Depends on**: none

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, `true-myth/result`, arrow functions, explicit types, no `any`, kebab-case filenames). Look at `tests/setup-validator.spec.ts` and `tests/etude-form-parser.spec.ts` for the pure-function test pattern.

Create `tests/safe-redisplay.spec.ts` importing from `bun:test` and from the not-yet-existing `src/lib/safe-redisplay.ts`. The tests must cover: (a) a payload with valid string values for all fields returns those values in `safeValues` with no `droppedFields`; (b) a value that is not a string (e.g. a number or object) is dropped and its field name appears in `droppedFields`; (c) a multi-value field (string array) with 64 or fewer values is kept; with 65 or more values the entire field is dropped (not truncated to 64); (d) a single value exceeding 128 bytes (UTF-8) has its field dropped, not truncated; (e) an error message exceeding 256 bytes is dropped from `fieldErrors`, not truncated; (f) a total payload exceeding 16 KB has fields dropped from the end (in a deterministic order) until under the limit, and no individual value is truncated into a different value; (g) more than 32 field entries causes the excess fields to be dropped; (h) an invalid value (e.g. `'abc'` for a numeric field) is never coerced into a plausible default — it is either dropped or redisplayed as-is for the student to correct; (i) the `fieldErrors` array entries are field-addressable (each has a `field` name and a `message` string within the 256-byte bound). Assert on the structure of the returned object, on which fields are present in `safeValues` vs `droppedFields`, and on the byte lengths of values — do not assert on specific error message strings. These tests must fail because the module does not exist yet.

---

### 6. Implement the safe-redisplay value shaping module

**Type**: GREEN
**Output**: `src/lib/safe-redisplay.ts` exports `shapeRedisplayPayload(rawValues, fieldErrors)` returning `{ safeValues: Record<string, string | string[]>, fieldErrors: FieldError[], droppedFields: string[] }` and the bound constants. The task-5 tests pass.
**Depends on**: 5

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, one export per file where practical, define constants for all bounds). Read `Notes/skills/code-writing/comment-writing` for the comment conventions.

Create `src/lib/safe-redisplay.ts` exporting the bound constants (`MAX_FIELD_ENTRIES = 32`, `MAX_VALUES_PER_FIELD = 64`, `MAX_VALUE_BYTES = 128`, `MAX_ERROR_BYTES = 256`, `MAX_TOTAL_BYTES = 16 * 1024`) and a `FieldError` interface (`field: string`, `message: string`). Implement `shapeRedisplayPayload` as a pure arrow function that takes the raw submitted values (a `Record<string, string | string[]>` from the form parser) and the field errors (an array of `FieldError`), and produces the redisplay payload. For each field: check the value is a string or array of strings (drop if not); check the byte length of each value against `MAX_VALUE_BYTES` (drop the entire field if any value exceeds); check multi-value fields against `MAX_VALUES_PER_FIELD` (drop the entire field if exceeded); accumulate the running total against `MAX_TOTAL_BYTES` and drop fields from the end if the total is exceeded. For each error: check the message byte length against `MAX_ERROR_BYTES` (drop the error if exceeded). Enforce `MAX_FIELD_ENTRIES` by dropping excess fields. Never truncate a value into a different value — always drop the whole field and add its name to `droppedFields`. The caller (the GET handler) will use `droppedFields` to redisplay those fields from the committed aggregate instead. Run the task-5 tests to confirm they pass.

---

### 7. Write failing Playwright e2e tests for POST invalid submission redirect

**Type**: RED
**Output**: A failing `e2e-tests/etude/10-etude-setup-invalid-redisplay.spec.ts` (first describe block) asserting: an invalid setup submission (e.g. measures=33 with valid meter/hands) returns a 303 redirect to `/etude/setup`; the response sets a nonce cookie whose value contains only the opaque nonce and no submitted value, field name, or error text; the stored aggregate is unchanged (no domain state persisted); and a simulated storage failure still returns a 303 with a generic corrective error (not a 500).
**Depends on**: 4, 6

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (Playwright tests, `testWithDatabase` helper, `signInUser` and `navigateToHome` from `e2e-tests/support/`, `data-testid` naming with kebab-case, look at `e2e-tests/etude/05-etude-setup-submit.spec.ts` for the `postSetupViaBrowser` pattern and `e2e-tests/support/test-helpers.ts` for `testWithDatabase`).

Create `e2e-tests/etude/10-etude-setup-invalid-redisplay.spec.ts` importing from `@playwright/test` and the support helpers. The tests must cover: (a) submit an invalid measures value (33) alongside valid meter/hands/octaves via `postSetupViaBrowser` with `maxRedirects: 0`, assert the response status is 303 and the `Location` header contains `/etude/setup`; (b) inspect the `Set-Cookie` header on the 303 response and assert that a nonce cookie is present, that its value is an opaque string, and that it does not contain the submitted value `33`, the field name `measures`, or any error text (e.g. assert the cookie value does not contain `33` or `measures` or `range`); (c) after the redirect, navigate to `/etude/setup` and assert the stored measures value is still the default (8) — no domain state was persisted; (d) submit an invalid meter (6/8) and assert the same 303 + nonce cookie + no-persistence behavior; (e) submit an empty measures value and assert the same behavior (no coercion to a default); (f) if the test harness supports simulating a DB failure (look at `e2e-tests/support/` and the existing `set-db-failures` test route), trigger a storage failure and assert the response is still a 303 with a generic error message, not a 500. These tests must fail because the POST handler does not yet store validation state or set a nonce cookie.

---

### 8. Wire the setup POST handler to store validation state and redirect with nonce

**Type**: GREEN
**Output**: `src/routes/build-etude.tsx` POST handler, on parse or validation failure, calls `shapeRedisplayPayload` with the raw submitted values and the field-addressable failures, then `redirectWithValidationState` to store the payload server-side and redirect with the nonce cookie. On storage failure the helper falls back to `redirectWithError` with a generic message. No domain state is persisted on rejection. The task-7 e2e tests pass.
**Depends on**: 7

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, Hono route style, `redirectWithMessage`/`redirectWithError` never `c.redirect`, `data-testid` naming). Read `Notes/skills/code-writing/production-code-control-comments` for the PRODUCTION comment convention.

Modify the POST handler in `src/routes/build-etude.tsx`: when `parseParameterForm` returns `Result.err`, collect the parse failures as field-addressable errors (each with a `field` name and a `message`), call `shapeRedisplayPayload` with the raw values that were parseable (or an empty record if parsing failed entirely) and the errors, then call `redirectWithValidationState(c, PATHS.ETUDE_SETUP, db, user.id, shapedPayload)` instead of `redirectWithError`. When `validateSetup` returns `Result.err`, do the same — pass the raw values from the parser and the validation failures to `shapeRedisplayPayload`, then redirect with validation state. The existing success path (load aggregate, update with epoch check, redirect with success message) is unchanged. Ensure the raw values passed to `shapeRedisplayPayload` are the string/string[] values from the parser, not the typed domain values — the shaping module applies its own bounds. Run the task-7 e2e tests to confirm they pass.

---

### 9. Write failing Playwright e2e tests for GET form redisplay with safe values and field errors

**Type**: RED
**Output**: Failing e2e tests (second describe block in `e2e-tests/etude/10-etude-setup-invalid-redisplay.spec.ts`) asserting: after an invalid submission, the redisplayed form shows the valid submitted values preserved (e.g. meter and hands still show the student's choices), a field-level error is shown on the offending field, the stored aggregate is unchanged, reloading the step a second time no longer shows the stale error (state was consumed), a forged or foreign nonce yields a clean step with no errors and no redisplayed values, and a submitted value containing HTML and quote characters (e.g. `<script>alert("x")</script>` in a field that accepts free text, or via a direct POST bypassing native constraints) is rendered escaped rather than interpreted.
**Depends on**: 8

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (Playwright tests, `testWithDatabase`, support helpers, `data-testid` naming). Look at `e2e-tests/etude/04-etude-setup-form.spec.ts` for the form-assertion pattern and `e2e-tests/support/finders.ts` and `e2e-tests/support/page-verifiers.ts` for helpers.

Extend `e2e-tests/etude/10-etude-setup-invalid-redisplay.spec.ts` with a second describe block. The tests must cover: (a) submit an invalid submission (measures=33) alongside valid changes (meter=3/4, hands=both) via the browser, follow the redirect to `/etude/setup`, and assert the form shows meter=3/4 and hands=both (the safe values are preserved) while the measures field shows an error (e.g. a `data-testid='measures-error'` element is present with corrective text); (b) assert the stored aggregate is unchanged — reload and confirm measures is still the default (8); (c) reload the step a second time and assert the field error is gone (the validation state was consumed on the first GET); (d) the safe values are also gone on the second reload — the form shows the committed aggregate values; (e) forge a nonce cookie with a random unknown value, navigate to `/etude/setup`, and assert the step renders cleanly with no errors and no redisplayed values (just the committed aggregate); (f) submit a value containing HTML and quote characters via a direct POST (bypassing native constraints) in a field that would fail validation, follow the redirect, and assert the value is rendered escaped in the HTML source (e.g. `&lt;script&gt;` not `<script>`) and is not interpreted as markup (no script execution, no DOM mutation). Use `data-testid` attributes for any new error-display elements (e.g. `measures-error`, `meter-error`, `hands-error`). These tests must fail because the GET handler does not yet consume validation state or redisplay values.

---

### 10. Wire the setup GET form to consume validation state and redisplay safe values with field errors

**Type**: GREEN
**Output**: `src/routes/build-etude.tsx` GET handler calls `consumeValidationStateFromRequest` and passes the redisplay data (safe values, field errors, dropped fields) to `renderEtudeSetupForm`. The form renders redisplayed safe values in place of the committed aggregate values where present, renders field-level errors near each offending field with `data-testid` attributes, and falls back to committed aggregate values for dropped fields. All redisplayed values are escaped by the TSX template's contextual output encoding. The task-9 e2e tests pass.
**Depends on**: 9

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, TSX rendering with contextual escaping, `data-testid` naming with kebab-case, `value` attribute for form inputs not `defaultValue`). Read `Notes/skills/code-writing/styling-html-and-tsx` for the HTML/TSX conventions and `Notes/skills/code-writing/production-code-control-comments` for the PRODUCTION comment convention.

Modify the GET handler in `src/routes/build-etude.tsx` to call `consumeValidationStateFromRequest(c, db, user.id)` after loading the aggregate. If the result is a payload (non-null), pass the `safeValues`, `fieldErrors`, and `droppedFields` to `renderEtudeSetupForm`. Extend `renderEtudeSetupForm` to accept an optional redisplay parameter: for each field, if a safe value is present in `safeValues`, use it to populate the form control's `value` attribute instead of the committed aggregate value; if the field is in `droppedFields`, use the committed aggregate value. For each field with an error in `fieldErrors`, render an error element with `data-testid='<field>-error'` and `aria-describedby` wiring (the full accessible error summary and focus management is Issue 9's scope — this issue renders the field-level error text and the data attributes Issue 9 will wire). TSX contextual encoding automatically escapes redisplayed values — do not add any manual sanitization or markup stripping (the issue explicitly states stripping is not the defence). Run the task-9 e2e tests to confirm they pass.

---

### 11. Refactor the validation-state modules, helpers, and route wiring

**Type**: REFACTOR
**Output**: No duplication between the validation-state repository, helpers, and safe-redisplay module. No route bypasses the store by calling `redirectWithError` for field-level validation failures. The nonce cookie options and the validation-state TTL constants are defined once. `tsc --noEmit` reports zero errors in any file created or modified for this issue. The full Bun unit suite and the Playwright e2e suite pass.
**Depends on**: 10

Read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md`. Search `src/routes/`, `src/lib/`, and `tests/` for any direct dependency on the raw `etude_validation_state` physical schema outside `src/lib/validation-state-repository.ts`, any inline bound-checking that should live in `src/lib/safe-redisplay.ts`, or any inline cookie logic that should live in `src/lib/validation-state-helpers.ts`. Move any such logic behind the appropriate module. Ensure the bound constants are defined in one place (`src/lib/safe-redisplay.ts`) and imported where needed, not duplicated. Run `tsc --noEmit`, the full `bun test` suite, and `npx playwright test` and confirm they are green. Do not modify the parent issue, the parent PRD, or prior task/issue/walkthrough files in `Notes/`.

---

### 12. Update wiki and notes documentation

**Type**: DOCUMENT
**Output**: Wiki and Notes updates describing the new `etude_validation_state` table and migration, `src/lib/validation-state-repository.ts`, `src/lib/validation-state-helpers.ts`, `src/lib/safe-redisplay.ts`, the new cookie constants, and the changes to `src/routes/build-etude.tsx` (POST handler stores validation state, GET handler consumes and redisplays). Follow `Notes/wiki/wiki-rules.md` and `Notes/wiki/AGENTS.md` for the wiki ingest operation.
**Depends on**: 11

Before writing documentation, read `Notes/wiki/AGENTS.md` and `Notes/wiki/wiki-rules.md` for the wiki conventions (ingest operation, kebab-case filenames, update `index.md` and append to `log.md` with the `## [YYYY-MM-DD] <operation> | <subject>` format).

Update the relevant wiki pages: `Notes/wiki/source-code.md` (add `src/lib/validation-state-repository.ts`, `src/lib/validation-state-helpers.ts`, `src/lib/safe-redisplay.ts`, the new `etude_validation_state` table in `src/db/schema.ts`, the new migration, the cookie constants in `src/constants.ts`, and the changed `src/routes/build-etude.tsx`), `Notes/wiki/e2e-tests.md` (catalog `e2e-tests/etude/10-etude-setup-invalid-redisplay.spec.ts`), `Notes/wiki/unit-tests.md` (catalog `tests/validation-state-repository.spec.ts`, `tests/validation-state-helpers.spec.ts`, and `tests/safe-redisplay.spec.ts`), `Notes/wiki/project-overview.md` (describe the server-managed validation state pattern, the opaque nonce cookie, the safe-redisplay bounds, and how this issue establishes the redisplay contract inherited by Issues 6, 7, 13, 14, and 16), and `Notes/wiki/index.md` if new sections are added. Append a `## [YYYY-MM-DD] ingest | issue-008 invalid submission redisplay` entry to `Notes/wiki/log.md`. Do not modify the parent issue or the parent PRD.

---

### 13. Code walkthrough

**Type**: CODE WALKTHROUGH
**Output**: `Notes/walkthroughs/issue-008-invalid-submission-redisplay/code-walkthrough/` containing the files generated by `uvx showboat` for this implementation.
**Depends on**: 12

Run `uvx showboat --help` for current usage, then generate a walkthrough of the issue-008 implementation into a new directory `Notes/walkthroughs/issue-008-invalid-submission-redisplay/code-walkthrough/`. The walkthrough should cover: (1) the `etude_validation_state` table and migration, (2) the validation-state repository with single-use consumption, expiry, owner scoping, and size bounds, (3) the nonce cookie and redirect/consume helpers, (4) the safe-redisplay value shaping module with drop-not-truncate bounds, (5) the POST handler wiring to store validation state on rejection, (6) the GET form redisplay with safe values, field errors, and contextual escaping, and (7) the storage-failure fallback. Place all generated files there.

---

### 14. Human review against the PRD and cross-cutting contract

**Type**: REVIEW
**Output**: A human verifies the implementation against the PRD's "Validation, errors, logging, and accessibility" sections, the issue's "Storage, integrity, and bounds" design, cross-cutting contract §1 (universal route requirements), §2 (parameter-form contract: PRG 303, safe redisplay with field-level errors, hostile-shape tolerance), and §6 (applicability matrix row for Issue 8), confirming every acceptance criterion in the parent issue is met.
**Depends on**: 13

This is a human-in-the-loop step. The human must verify: (a) an invalid submission returns a 303 redirect to the same step with field-level errors; (b) valid edits alongside an invalid field are redisplayed in the form; (c) no domain state is persisted on an invalid submission; (d) a redisplayed error is consumed on the next GET and does not reappear on reload; (e) an invalid value is never coerced into a valid neighbouring value; (f) the client-side cookie contains only an opaque single-use nonce — no submitted value, field name, or error text; (g) an unknown, expired, already-consumed, or foreign-user nonce all render a clean step with no errors and no redisplayed values, revealing nothing about the other case; (h) a payload exceeding any documented bound has the offending field redisplayed from the committed aggregate (not truncated) while remaining fields still redisplay; (i) a storage failure still produces a 303 redirect with a generic corrective message and the saved values, not a 500; (j) a submitted value containing markup, quotes, or control characters is rendered through contextual output escaping and is never interpreted as markup. Record the result in the review notes. Do not modify the parent issue or the parent PRD.

---
