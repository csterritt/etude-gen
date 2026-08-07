# Tasks for #10: Workflow version compare-and-set rejects stale submissions

Parent issue: #10
Parent PRD: `Notes/PRD-etude-generator.md`

## Tasks

### 1. Write failing Bun tests for `updateEtudeSetup` workflowVersion CAS + typed conflict

**Type**: RED
**Output**: New and updated cases in `tests/etude-params-repository.spec.ts` that fail because `updateEtudeSetup` does not yet take an `expectedWorkflowVersion` parameter and does not yet return a typed conflict. The tests assert: (a) an update with the expected version succeeds and increments the version by 1; (b) an update with an older version returns a typed `version-mismatch` conflict and persists nothing (reload confirms unchanged values, unchanged version, unchanged flags); (c) an update with a newer-than-current version returns a typed `version-mismatch` conflict and persists nothing; (d) two concurrent `Promise.all` updates with the same expected version result in at most one succeeding (the other returns a typed conflict); (e) an epoch mismatch returns a typed `epoch-mismatch` conflict and persists nothing; (f) no aggregate returns a typed conflict. The typed error is a discriminated union `EtudeUpdateError` with kinds `version-mismatch`, `epoch-mismatch`, and `db-error` (the last wrapping an `Error`).
**Depends on**: none

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test` with `describe`/`it`/`expect`, arrow functions, explicit types, no `any`, kebab-case filenames, look at `tests/etude-params-repository.spec.ts` for the existing repository test pattern — `createTestDb`, `insertUser`, `unwrap`, `loadOrCreateEtudeParams`, `loadEtudeParams`, `confirmNotesAndSplit`, the existing `validSetup` constant). Read `Notes/skills/code-writing/typescript-rules` for the TypeScript conventions and `Notes/skills/code-writing/database-access` for the DB access conventions.

Add new `describe` blocks to `tests/etude-params-repository.spec.ts` for the workflowVersion CAS behavior. The tests call `updateEtudeSetup` with a new fourth positional argument `expectedWorkflowVersion` (after `expectedEpoch`, before `values`) and assert on the typed error kind via `result.isErr` and `result.error.kind`. Cover: (a) expected version equals the stored version → Ok, version increments by 1; (b) expected version is `stored - 1` (older) → Err with `kind: 'version-mismatch'`, reload confirms nothing changed; (c) expected version is `stored + 1` (newer-than-current) → Err with `kind: 'version-mismatch'`, reload confirms nothing changed; (d) two `Promise.all` calls each passing the same expected version (the current one) with different `ValidSetup` values → exactly one Ok and one Err with `kind: 'version-mismatch'`, reload confirms the winner's values persisted and the version incremented exactly once; (e) a stale epoch with the correct version → Err with `kind: 'epoch-mismatch'`, reload confirms nothing changed; (f) no aggregate (user owns no row) → Err with a conflict kind. Also update the existing `updateEtudeSetup` test cases to pass the new `expectedWorkflowVersion` argument (use `before.workflowVersion`) so they continue to compile and pass once the signature changes — these existing cases are not new assertions, just signature updates. These tests must fail because the module does not yet accept `expectedWorkflowVersion` or return a typed conflict.

---

### 2. Add `expectedWorkflowVersion` CAS + typed conflict to `updateEtudeSetup`

**Type**: GREEN
**Output**: `updateEtudeSetup` in `src/lib/etude-params-repository.ts` takes `expectedWorkflowVersion: number`, checks it in the conditional `where` clause alongside `aggregateEpoch`, and returns `Result<EtudeParams, EtudeUpdateError>` where `EtudeUpdateError` is an exported discriminated union (`version-mismatch` | `epoch-mismatch` | `db-error`). On success the version increments by 1 in the same committed transition. The task-1 tests pass, and all existing repository tests (updated to the new signature) pass.
**Depends on**: 1

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, one export per file where practical, `Result` from `true-myth/result`). Read `Notes/skills/code-writing/database-access` for the DB access conventions and `Notes/skills/code-writing/typescript-rules` for the TypeScript conventions. Look at the existing `updateEtudeSetupActual` for the current epoch-CAS pattern — the version CAS follows the same shape.

Export an `EtudeUpdateError` discriminated union type from `src/lib/etude-params-repository.ts`: `{ kind: 'version-mismatch' } | { kind: 'epoch-mismatch' } | { kind: 'db-error', error: Error }`. Change `updateEtudeSetup` and `updateEtudeSetupActual` to accept `expectedWorkflowVersion: number` after `expectedEpoch` and to return `Result<EtudeParams, EtudeUpdateError>`. In the conditional `update`, add `eq(etudeParams.workflowVersion, expectedWorkflowVersion)` to the `and(...)` in the `where` clause so the row updates only when both the epoch and the version match. When the `update` returns zero rows, distinguish `version-mismatch` from `epoch-mismatch` by re-loading the current row and comparing: if the stored `aggregateEpoch` no longer equals `expectedEpoch`, return `{ kind: 'epoch-mismatch' }`; otherwise return `{ kind: 'version-mismatch' }` (this covers older, newer, and tampered values uniformly — the CAS rejects any non-match). When the initial load finds no row, return `{ kind: 'version-mismatch' }` (a missing aggregate is a safe conflict, never a 500). Wrap any thrown DB error in `{ kind: 'db-error', error }`. The identical-resubmit no-op path (where all submitted values equal the stored ones) must still return Ok with the unchanged row and must still verify the version matches before returning Ok — if the version does not match on an identical resubmit, return `{ kind: 'version-mismatch' }`. Update the existing `updateEtudeSetup` test cases to pass `before.workflowVersion` as the new argument. Run the task-1 tests and the full repository suite to confirm they pass.

---

### 3. Write failing Bun tests for `parseWorkflowVersionField` pure function

**Type**: RED
**Output**: A failing `tests/workflow-version-field.spec.ts` that asserts `parseWorkflowVersionField` accepts a raw string (or absent value) from a form field and returns `Result<number, ParseFailure>` — Ok for a valid non-negative integer string, Err for a missing value, an empty string, a non-numeric string, a negative number, a non-integer (e.g. `1.5`), and a tampered value. The function is pure (no DB, no side effects) and reusable by the notes and split forms (Issues 13, 14, 16).
**Depends on**: none

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, arrow functions, explicit types, no `any`, kebab-case filenames). Look at `tests/etude-form-parser.spec.ts` for the pure-parser test pattern and at `src/lib/etude-form-parser.ts` for the `ParseFailure` shape (`{ field: string, reason: string }`).

Create `tests/workflow-version-field.spec.ts` importing from `bun:test` and from the not-yet-existing `src/lib/workflow-version-field.ts`. The tests must cover: (a) `parseWorkflowVersionField('1', 'workflowVersion')` returns Ok with `1`; (b) `parseWorkflowVersionField('42', 'workflowVersion')` returns Ok with `42`; (c) a missing/absent value (represented as `undefined` or `null`) returns Err with a `ParseFailure` whose `field` is `'workflowVersion'`; (d) an empty string returns Err; (e) a non-numeric string like `'abc'` returns Err; (f) a negative number like `'-1'` returns Err; (g) a non-integer like `'1.5'` returns Err; (h) a tampered value with leading/trailing whitespace that is not a clean integer (e.g. `' 1 '` — decide whether to trim; if trimming, `' 1 '` is Ok with `1`, but `'1abc'` is Err) — assert the chosen behavior explicitly and document it in the function's docstring in task 4. The function signature under test is `parseWorkflowVersionField(raw: string | null | undefined, field: string): Result<number, ParseFailure>`. Import `ParseFailure` from `src/lib/etude-form-parser`. These tests must fail because the module does not exist yet.

---

### 4. Implement `parseWorkflowVersionField`

**Type**: GREEN
**Output**: `src/lib/workflow-version-field.ts` exports `parseWorkflowVersionField(raw: string | null | undefined, field: string): Result<number, ParseFailure>` returning Ok for a valid non-negative integer string and Err otherwise. The task-3 tests pass.
**Depends on**: 3

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, one export per file where practical). Read `Notes/skills/code-writing/typescript-rules` for the TypeScript conventions. Look at `src/lib/etude-form-parser.ts` for the `ParseFailure` type and the safe-parse style (no throws, descriptive `reason` strings).

Create `src/lib/workflow-version-field.ts` exporting `parseWorkflowVersionField` as a pure arrow function. Treat `null`/`undefined`/empty string as a missing-field failure. Trim surrounding whitespace, then require the result to match a non-negative integer (use `Number.isInteger` after `Number(raw)` or a regex like `/^\d+$/`). A negative, fractional, or non-numeric value is a failure with a safe `reason` string (e.g. "The workflow version field must be a non-negative integer."). Reuse the `ParseFailure` type from `src/lib/etude-form-parser`. This function is reusable by the notes and split forms (Issues 13, 14, 16) so it must not hardcode the field name — it takes `field` as a parameter. Run the task-3 tests to confirm they pass.

---

### 5. Write failing Bun tests for `checkOperationPrecondition` pure function

**Type**: RED
**Output**: A failing `tests/operation-precondition.spec.ts` that asserts `checkOperationPrecondition` is a pure function taking the current aggregate (`EtudeParams`), the submitted `workflowVersion` string, and the captured `aggregateEpoch` number, and returning `Result<{ workflowVersion: number }, OperationPreconditionFailure>` — Ok when both the version and epoch match the current aggregate, and a typed failure (`version-mismatch` or `epoch-mismatch`) otherwise. This defines the epoch check and the operation-POST precondition pattern inherited by Issues 20, 30, 31, 32, 33, 34, 35, 37, and 38.
**Depends on**: none

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, arrow functions, explicit types, no `any`, kebab-case filenames). Look at `tests/etude-params-repository.spec.ts` for the `EtudeParams` shape and at `src/lib/etude-form-parser.ts` for the typed-failure style.

Create `tests/operation-precondition.spec.ts` importing from `bun:test` and from the not-yet-existing `src/lib/operation-precondition.ts`. The tests must cover: (a) matching version (string `'1'`) and matching epoch → Ok with `{ workflowVersion: 1 }`; (b) a stale version (submitted `'1'` when current is `2`) → Err with `kind: 'version-mismatch'`; (c) a missing version (empty string or null) → Err with `kind: 'version-mismatch'`; (d) a non-numeric version (`'abc'`) → Err with `kind: 'version-mismatch'`; (e) a negative version (`'-1'`) → Err with `kind: 'version-mismatch'`; (f) a newer-than-current version (submitted `'3'` when current is `2`) → Err with `kind: 'version-mismatch'`; (g) a matching version but a stale epoch (captured epoch `0` when current is `1`) → Err with `kind: 'epoch-mismatch'`; (h) the function is pure — it does not touch the DB, does not mutate its arguments, and does not throw for any of the hostile inputs above. The function signature under test is `checkOperationPrecondition(current: EtudeParams, submittedWorkflowVersion: string, capturedEpoch: number): Result<{ workflowVersion: number }, OperationPreconditionFailure>` where `OperationPreconditionFailure` is a discriminated union `{ kind: 'version-mismatch' } | { kind: 'epoch-mismatch' }`. Import `EtudeParams` from `src/lib/etude-params-repository`. These tests must fail because the module does not exist yet.

---

### 6. Implement `checkOperationPrecondition`

**Type**: GREEN
**Output**: `src/lib/operation-precondition.ts` exports `checkOperationPrecondition` and the `OperationPreconditionFailure` type. The function is pure: it parses the submitted version via `parseWorkflowVersionField`, compares it to `current.workflowVersion`, and compares `capturedEpoch` to `current.aggregateEpoch`, returning Ok only when both match. The task-5 tests pass.
**Depends on**: 5

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, one export per file where practical). Read `Notes/skills/code-writing/typescript-rules` for the TypeScript conventions.

Create `src/lib/operation-precondition.ts` exporting `OperationPreconditionFailure` (a discriminated union `{ kind: 'version-mismatch' } | { kind: 'epoch-mismatch' }`) and `checkOperationPrecondition` as a pure arrow function. First parse the submitted version string with `parseWorkflowVersionField(submittedWorkflowVersion, 'workflowVersion')` from task 4; on parse failure return `{ kind: 'version-mismatch' }` (a missing/tampered version is treated the same as a stale one, per cross-cutting contract section 3 rule 1). Then compare the parsed number to `current.workflowVersion`; on inequality return `{ kind: 'version-mismatch' }`. Then compare `capturedEpoch` to `current.aggregateEpoch`; on inequality return `{ kind: 'epoch-mismatch' }`. Otherwise return Ok with `{ workflowVersion: parsedVersion }`. The function must not mutate its arguments, touch the DB, or throw. This function is the precondition gate every operation POST (generate, render retry, pdf, start-over) will call before any lock acquisition, external call, or state change. Run the task-5 tests to confirm they pass.

---

### 7. Write failing Playwright two-tab test for setup parameter-form stale-version rejection

**Type**: RED
**Output**: A failing `e2e-tests/etude/12-etude-setup-stale-version.spec.ts` reproducing the two-tab scenario for the setup parameter form: two browser contexts load `/etude/setup` (both see version 1); the first submits a change (measures 16, meter 3/4, hands both) and succeeds (version becomes 2); the second submits a different change (measures 12) carrying the stale version 1 and is rejected with a 303 to `/etude/setup`; on reload the second tab sees the newly current saved state (measures 16, meter 3/4, hands both — the first tab's values) with an explanatory error, NOT the second tab's submitted values (measures 12). The workflow version field on the redisplayed page shows `2`.
**Depends on**: 2, 4

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (Playwright tests, `testWithDatabase` helper, `signInUser` and `navigateToHome` from `e2e-tests/support/`, `data-testid` naming with kebab-case, look at `e2e-tests/etude/05-etude-setup-submit.spec.ts` for the `postSetupViaBrowser` pattern and `SERVER_BASE_URL` usage, and `e2e-tests/support/test-helpers.ts` for `testWithDatabase`). Look at `e2e-tests/support/test-data.ts` for `TEST_USERS` and `SERVER_BASE_URL`.

Create `e2e-tests/etude/12-etude-setup-stale-version.spec.ts` importing from `@playwright/test` and the support helpers. Use two authenticated browser contexts (or two pages sharing a storage state) signed in as the same `KNOWN_USER`. Both navigate to `/etude` to create the default aggregate and land on `/etude/setup`, then both capture the initial `workflow-version-field` value (should be `1`). The first page submits a valid change (measures 16, meter 3/4, hands both, octaves 4, workflowVersion 1) via `postSetupViaBrowser` or by filling and clicking `setup-save-action`; assert it succeeds and the version is now `2`. The second page submits a different change (measures 12, meter 4/4, hands right, octaves 4, workflowVersion 1 — the stale value) via `postSetupViaBrowser` with `maxRedirects: 0`; assert the response is 303 to `/etude/setup`. The second page then navigates to `/etude/setup` and asserts: the measures field shows `16` (the first tab's value, not `12`), the meter field shows `3/4`, the hands field shows `both`, the `workflow-version-field` shows `2`, and an explanatory error message is visible (e.g. via the error alert/cookie). Crucially, the redisplayed values are the newly current saved state, not the second tab's submitted values. These tests must fail because the setup POST does not yet check the submitted version.

---

### 8. Wire version CAS into the setup POST route; stale-version redisplay of current saved state

**Type**: GREEN
**Output**: The setup POST handler in `src/routes/build-etude.tsx` parses the `workflowVersion` field from the submitted form via `parseWorkflowVersionField`, passes the parsed version to `updateEtudeSetup` as `expectedWorkflowVersion`, and on a typed `version-mismatch` or `epoch-mismatch` conflict redirects to `/etude/setup` with `redirectWithError` (NOT `redirectWithValidationState`) so the following GET redisplays the committed aggregate values — the newly current saved state — rather than the rejected submitted values. The task-7 e2e test passes, and the existing setup e2e tests in `05-etude-setup-submit.spec.ts` and `10-etude-setup-invalid-redisplay.spec.ts` still pass.
**Depends on**: 7

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, `data-testid` naming with kebab-case, `value` attribute for form inputs not `defaultValue`, use `redirectWithError`/`redirectWithMessage` from `src/lib/redirects.tsx` never `c.redirect`). Read `Notes/skills/code-writing/production-code-control-comments` for the PRODUCTION comment convention. Look at the existing setup POST handler in `src/routes/build-etude.tsx` (the `app.post(PATHS.ETUDE_SETUP, ...)` block) for the current flow: parse → validate → load aggregate for epoch → `updateEtudeSetup` → redirect.

Modify the setup POST handler in `src/routes/build-etude.tsx`. After `parseParameterForm` succeeds and before or alongside `validateSetup`, extract the `workflowVersion` raw string from the parsed `raw` values (add `workflowVersion` to the `SETUP_FIELD_SPEC` as a `string` field so the parser collects it, or read it directly from the `FormData` before parsing — follow whichever is consistent with the existing hostile-shape tolerance; a missing or repeated `workflowVersion` must be a safe reject, not a 500). Pass the raw string to `parseWorkflowVersionField`; on parse failure, redirect to `/etude/setup` with `redirectWithError` and a safe explanatory message (e.g. "Your setup could not be saved because the form was stale. Please review the current values and try again."). On parse success, pass the parsed number as `expectedWorkflowVersion` to `updateEtudeSetup` alongside the existing `expectedEpoch` from the loaded aggregate. When `updateResult.isErr`, inspect `updateResult.error.kind`: for `version-mismatch` and `epoch-mismatch`, redirect to `/etude/setup` with `redirectWithError` and the same stale-form explanatory message — do NOT use `redirectWithValidationState` because the submitted values are no longer trustworthy and the GET must show the committed aggregate; for `db-error`, log via `logError`/`sanitizeError` and return `handleUnexpectedError`. On success, the existing `redirectWithMessage(c, PATHS.ETUDE_SETUP, 'Setup saved.')` is unchanged. The GET handler already renders the committed aggregate values when no validation-state record is consumed, so the stale-version redirect automatically shows the newly current saved state. Run the task-7 e2e tests and the existing setup e2e tests to confirm they pass.

---

### 9. Write failing Playwright two-tab test for operation-POST precondition refusal

**Type**: RED
**Output**: A failing `e2e-tests/etude/13-etude-operation-precondition-stale.spec.ts` reproducing the two-tab scenario for an operation POST: two browser contexts load `/etude/setup` (both see version 1); the first submits a setup change (version becomes 2); the second POSTs to a test-only operation route (`POST /test/etude/operation-precondition`) carrying the stale version 1 and the captured epoch 1; the route refuses with a 303 to the canonical route for the current state (`/etude/setup`) with an explanatory error, having acquired no lock, made no external call, and changed no state. The test verifies the aggregate is unchanged (still the first tab's values, version still 2).
**Depends on**: 6

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (Playwright tests, `testWithDatabase` helper, `signInUser` and `navigateToHome` from `e2e-tests/support/`, `data-testid` naming with kebab-case, look at `e2e-tests/etude/05-etude-setup-submit.spec.ts` for the `postSetupViaBrowser` and `SERVER_BASE_URL` patterns). Look at `src/lib/test-routes.ts` for the `isTestRouteEnabled` gating pattern and at `src/index.ts` for how test routes are mounted under `/test/`.

Create `e2e-tests/etude/13-etude-operation-precondition-stale.spec.ts` importing from `@playwright/test` and the support helpers. Use two authenticated browser contexts signed in as the same `KNOWN_USER`. Both navigate to `/etude` to create the default aggregate and land on `/etude/setup` (version 1, epoch 1). The first page submits a valid setup change (measures 16, meter 3/4, hands both, octaves 4, workflowVersion 1); assert it succeeds and the version is now `2`. The second page POSTs to `${SERVER_BASE_URL}/test/etude/operation-precondition` with `multipart` fields `workflowVersion: '1'` and `aggregateEpoch: '1'` (the stale captured values), `maxRedirects: 0`, `failOnStatusCode: false`. Assert the response is 303 and the `location` header contains `/etude/setup` (the canonical route for the current state). Then navigate the second page to `/etude/setup` and assert the aggregate is unchanged: measures `16`, meter `3/4`, hands `both`, `workflow-version-field` is `2`, and an explanatory error is visible. These tests must fail because the test-only operation route does not exist yet.

---

### 10. Create test-only operation-POST precondition route

**Type**: GREEN
**Output**: A `POST /test/etude/operation-precondition` route (gated by `isTestRouteEnabled`) that loads the owner's aggregate, calls `checkOperationPrecondition` with the submitted `workflowVersion` and `aggregateEpoch`, and on any failure redirects 303 to the canonical route for the current state with `redirectWithError` — acquiring no lock, making no external call, and changing no state. On success it returns a simple 200 or 303 confirming the precondition passed (no actual generation work). The task-9 e2e test passes.
**Depends on**: 9

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, use `redirectWithError`/`redirectWithMessage` from `src/lib/redirects.tsx` never `c.redirect`). Read `Notes/skills/code-writing/production-code-control-comments` for the PRODUCTION comment convention. Look at `src/lib/test-routes.ts` for `isTestRouteEnabled`, at `src/index.ts` for how test routes are mounted (the `if (isTestRouteEnabledFlag)` block), and at the existing test route files in `src/routes/test/` for the mounting pattern.

Add a new test-only route `POST /test/etude/operation-precondition` gated by `isTestRouteEnabled`. It must require the `signedInAccess` middleware and the existing correlation middleware so it mirrors a real operation POST's universal route requirements (cross-cutting contract section 1). It reads the owner's aggregate via `loadEtudeParams`; if none exists, redirect to `/etude` with an error. It reads `workflowVersion` and `aggregateEpoch` from the submitted form (the test sends them as multipart fields), then calls `checkOperationPrecondition(current, submittedWorkflowVersion, capturedEpoch)` from task 6. On any failure (`version-mismatch` or `epoch-mismatch`), redirect 303 to the canonical route for the current state (use `resolveCanonicalRoute(current)`) with `redirectWithError` and a safe explanatory message — no lock acquisition, no external call, no state change. On success, return a 303 to the canonical route with `redirectWithMessage` and a confirmation message (this route does no real work; it only exercises the precondition gate). Mount it in `src/index.ts` inside the existing `if (isTestRouteEnabledFlag)` block, following the pattern of the other test routes. Run the task-9 e2e tests to confirm they pass.

---

### 11. Refactor version/concurrency-token wiring

**Type**: REFACTOR
**Output**: No duplicated version-parsing, conflict-handling, or precondition-check logic between `src/lib/`, `src/routes/`, and `tests/`; the typed conflict and precondition types are defined once and imported where needed; `tsc --noEmit` reports zero errors in any file created or modified for this issue; the full Bun unit suite and the Playwright e2e suite pass.
**Depends on**: 8, 10

Read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md`. Search `src/routes/`, `src/lib/`, `src/components/`, and `tests/` for any duplicated version-field parsing, duplicated conflict-kind strings, or inline precondition checks that should live in `src/lib/workflow-version-field.ts`, `src/lib/operation-precondition.ts`, or `src/lib/etude-params-repository.ts`. Move any such logic behind the shared modules. Ensure the `EtudeUpdateError` and `OperationPreconditionFailure` types are defined once and imported where needed, not duplicated between the route and the tests. Run `tsc --noEmit`, the full `bun test` suite, and `npx playwright test` and confirm they are green. Do not modify the parent issue, the parent PRD, or prior task/issue/walkthrough files in `Notes/`.

---

### 12. Update wiki and notes documentation

**Type**: DOCUMENT
**Output**: Wiki and Notes updates describing the `EtudeUpdateError` typed conflict and the `workflowVersion` CAS in `updateEtudeSetup`, the `parseWorkflowVersionField` pure parser, the `checkOperationPrecondition` pure precondition checker and the `OperationPreconditionFailure` type, the setup-route stale-version redisplay of the current saved state (using `redirectWithError` rather than validation-state redisplay), the test-only `/test/etude/operation-precondition` route, and the new test files. Follow `Notes/wiki/wiki-rules.md` and `Notes/wiki/AGENTS.md` for the wiki ingest operation.
**Depends on**: 11

Before writing documentation, read `Notes/wiki/AGENTS.md` and `Notes/wiki/wiki-rules.md` for the wiki conventions (ingest operation, kebab-case filenames, update `index.md` and append to `log.md` with the `## [YYYY-MM-DD] <operation> | <subject>` format).

Update the relevant wiki pages: `Notes/wiki/source-code.md` (add `src/lib/workflow-version-field.ts`, `src/lib/operation-precondition.ts`, the changed `src/lib/etude-params-repository.ts` with the `EtudeUpdateError` type and `expectedWorkflowVersion` CAS, the changed `src/routes/build-etude.tsx` setup POST, and the new test-only route), `Notes/wiki/e2e-tests.md` (catalog `e2e-tests/etude/12-etude-setup-stale-version.spec.ts` and `e2e-tests/etude/13-etude-operation-precondition-stale.spec.ts`), `Notes/wiki/unit-tests.md` (catalog the new `tests/workflow-version-field.spec.ts` and `tests/operation-precondition.spec.ts` and the new repository test cases), `Notes/wiki/project-overview.md` (describe the optimistic-concurrency model: the `workflowVersion` CAS token that increments on parameter-form commits, the operation-POST precondition that checks but never increments, the `aggregateEpoch` check that protects against Start Over / deletion races, the typed conflict results, and how this issue establishes the concurrency-token contract inherited by Issues 6, 7, 13, 14, 16, 20, 30, 31, 32, 33, 34, 35, 37, and 38), and `Notes/wiki/index.md` if new sections are added. Append a `## [YYYY-MM-DD] ingest | issue-010 workflow version stale submission` entry to `Notes/wiki/log.md`. Do not modify the parent issue or the parent PRD.

---

### 13. Code walkthrough

**Type**: CODE WALKTHROUGH
**Output**: `Notes/walkthroughs/issue-010-workflow-version-stale-submission/code-walkthrough/` containing the files generated by `uvx showboat` for this implementation.
**Depends on**: 12

Run `uvx showboat --help` for current usage, then generate a walkthrough of the issue-010 implementation into a new directory `Notes/walkthroughs/issue-010-workflow-version-stale-submission/code-walkthrough/`. The walkthrough should cover: (1) the `EtudeUpdateError` typed conflict and the `expectedWorkflowVersion` CAS in `updateEtudeSetup` (the `where` clause matching both `userId`, `aggregateEpoch`, and `workflowVersion`, the post-update mismatch disambiguation, the identical-resubmit no-op path), (2) the `parseWorkflowVersionField` pure parser, (3) the `checkOperationPrecondition` pure precondition checker and the `OperationPreconditionFailure` type, (4) the setup-route stale-version redisplay path (parsing the field, passing the version, the `redirectWithError` path that shows the committed aggregate rather than the submitted values), (5) the test-only operation-POST route, and (6) the two-tab Playwright scenarios. Place all generated files there.

---

### 14. Human review against the PRD and cross-cutting contract

**Type**: REVIEW
**Output**: A human verifies the implementation against the issue's "How to verify" and "Acceptance criteria" sections, the PRD's optimistic-concurrency decisions, cross-cutting contract §2 (parameter-form contract: row 1 — `workflowVersion` CAS, missing/non-numeric/tampered/older rejected, increment on success; row 2 — stale-version redisplay of the newly current saved state), §3 (operation-POST contract: rule 1 — version precondition checked but never incremented, missing/tampered treated as stale; rule 2 — aggregate epoch verified), §4 (concurrency tokens table rows for parameter forms and operation POSTs, the aggregate-epoch definition), and §6 (applicability matrix row for Issue 10: Version token = B, Epoch = I), confirming every acceptance criterion in the parent issue is met.
**Depends on**: 13

This is a human-in-the-loop step. The human must verify: (a) a form carrying the current version succeeds and the version increments; (b) a form carrying an older version is rejected, nothing is persisted, and the student sees the currently saved state with an explanatory error; (c) two submissions with the same expected version result in at most one succeeding; (d) a missing, non-numeric, negative, tampered, or newer-than-current version is rejected rather than treated as current; (e) a stale-version rejection redisplays the newly current saved state rather than the rejected submitted values; (f) an operation POST whose version precondition fails acquires no lock, makes no external call, consumes no cooldown, and changes no state; (g) a commit whose captured aggregate epoch is no longer current is rejected by the repository regardless of the workflow version. Record the result in the review notes. Do not modify the parent issue or the parent PRD.

---
