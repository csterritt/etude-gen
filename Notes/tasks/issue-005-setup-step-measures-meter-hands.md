# Tasks for #5: Setup step for measures, time signature, and hands

Parent issue: #5
Parent PRD: `Notes/PRD-etude-generator.md`

## Tasks

### 1. Write failing Bun tests for the setup domain validator

**Type**: RED
**Output**: A failing `tests/setup-validator.spec.ts` that asserts the setup domain validator accepts measure counts 4 and 32 (boundaries), rejects 3, 33, decimals, and non-numeric measure counts; accepts meters `2/4`, `3/4`, and `4/4` and rejects `6/8` and any other meter; accepts hands `left`, `right`, and `both` and rejects any other hand value including unknown strings. The validator returns a typed `Result<ValidSetup, SetupValidationFailure[]>` where each failure is field-addressable (names the offending field). Rejections never throw and never coerce an invalid value into a plausible default.
**Depends on**: none

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test` with `describe`/`it`/`expect`, `true-myth/result` for Result handling, arrow functions, explicit types, no `any`, kebab-case filenames, look at `tests/validators.spec.ts` and `tests/db-access-retry.spec.ts` for the `unwrap`/`unwrapErr` helper pattern and import style).

Create `tests/setup-validator.spec.ts` importing from `bun:test` and `true-myth/result`, and from the not-yet-existing `src/lib/setup-validator.ts`. The tests must cover: (a) measure count 4 and 32 accepted; (b) measure count 3, 33, a decimal (e.g. `8.5`), and a non-numeric string (e.g. `'abc'`) each rejected with a field-addressable failure naming the measures field; (c) each of `2/4`, `3/4`, `4/4` accepted; (d) `6/8` and at least one other unsupported meter rejected with a field-addressable failure naming the meter field; (e) `left`, `right`, `both` accepted; (f) an unknown hand string (e.g. `'both-hands'`) rejected with a field-addressable failure naming the hands field. Assert on the typed result's `isOk`/`isErr` and on the field names in the failure list — do not assert on string messages. These tests must fail because the validator module does not exist yet.

---

### 2. Implement the setup domain validator

**Type**: GREEN
**Output**: `src/lib/setup-validator.ts` exports a `ValidSetup` interface (typed `measureCount: number`, `timeSignature: string`, `hand: string`), a `SetupValidationFailure` interface (field-addressable: `field: 'measures' | 'meter' | 'hands'`, plus a safe description of the supported range), and a `validateSetup(values: { measureCount: unknown; timeSignature: unknown; hand: unknown }): Result<ValidSetup, SetupValidationFailure[]>` pure arrow function. The task-1 tests pass.
**Depends on**: 1

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, `Result`-returning style, one export per file where practical, define constants for magic numbers like the measure range and supported meter/hand sets).

Create `src/lib/setup-validator.ts` importing `Result` from `true-myth/result`. Define constants for the supported domain: `MEASURE_MIN = 4`, `MEASURE_MAX = 32`, `SUPPORTED_METERS = ['2/4', '3/4', '4/4'] as const`, `SUPPORTED_HANDS = ['left', 'right', 'both'] as const`. Implement `validateSetup` as a pure arrow function that checks each field independently and collects all failures into a single array (so a submission with multiple invalid fields reports all of them). The measure count must be a finite integer in the inclusive range 4–32; a non-numeric, non-integer, or out-of-range value is rejected. The meter must be one of the supported meters exactly. The hand must be one of the supported hand values exactly. Never coerce an invalid value — an empty string, `null`, `undefined`, or a wrong type is a rejection, not a default. Return `Result.ok` with the validated typed values only when all three fields pass. Run the task-1 tests to confirm they pass.

---

### 3. Write failing Bun tests for the parameter-form parser (hostile shapes)

**Type**: RED
**Output**: A failing `tests/etude-form-parser.spec.ts` that submits each hostile shape through the parameter-form parser and asserts a deterministic accept or field-addressable reject with no thrown error and no coercion. The hostile shapes are: an empty value for a field, an absent field, a repeated field submitted with multiple values, an unexpected extra field, and the expected fields arriving in an arbitrary order. None of them produces a thrown error, and none is silently coerced into a plausible value.
**Depends on**: 2

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, arrow functions, explicit types, no `any`, kebab-case filenames). Construct `FormData` objects directly in the tests (the browser is not required for unit tests of the parser).

Create `tests/etude-form-parser.spec.ts` importing from `bun:test` and `true-myth/result`, and from the not-yet-existing `src/lib/etude-form-parser.ts`. The parser's contract is: given a `FormData` and a field specification (the expected field names and their target types), it extracts a typed raw-values object and a list of parse failures (absent field, empty value, repeated field). An unexpected extra field is ignored without affecting the outcome for the expected fields. Field order in the `FormData` does not affect the outcome. For the setup form specifically, assert: (a) a normal valid body parses to the expected raw values with no failures; (b) an empty string for `measures` is a field-addressable parse failure and is not coerced to a default; (c) an absent `meter` field is a field-addressable parse failure; (d) a repeated `hands` field (two values) is either a stated normalization or a field-addressable reject — state and test the chosen rule (recommend: reject, since the PRD says a repeated field is not resolved by taking the first or last value unless that rule is stated and tested); (e) an unexpected extra field (e.g. `foo=bar`) is ignored and the expected fields still parse identically; (f) the expected fields in an arbitrary order (e.g. `hands` before `measures` before `meter`) parse identically to the canonical order. These tests must fail because the parser module does not exist yet.

---

### 4. Implement the parameter-form parser

**Type**: GREEN
**Output**: `src/lib/etude-form-parser.ts` exports a reusable `parseParameterForm(formData: FormData, spec: FieldSpec): Result<RawValues, ParseFailure[]>` arrow function that extracts typed raw values from a `FormData` handling hostile shapes deterministically. An absent field and an empty string are field-addressable failures (never coerced). A repeated field (multi-value) is rejected unless a stated normalization rule is provided in the spec. An unexpected extra field is ignored. Field order does not affect the outcome. The task-3 tests pass.
**Depends on**: 3

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, one export per file where practical). Design the parser to be reusable by Issues 6, 7, 13, 14, and 16, not specific to the setup form.

Create `src/lib/etude-form-parser.ts` defining a `FieldSpec` interface (mapping expected field names to a target type and an optional repeated-field policy), a `ParseFailure` interface (field-addressable: `field: string`, plus a safe reason), and a `RawValues` type (a `Record<string, string>` of the extracted single values). Implement `parseParameterForm` as a pure arrow function: iterate the spec's expected fields, read each from the `FormData` via `formData.getAll(name)`, and apply the rules — zero values for an expected field is an "absent field" failure; one empty-string value is an "empty value" failure; one non-empty value is accepted; two or more values is a "repeated field" failure unless the spec declares a normalization (the setup form does not, so it rejects). Fields in the `FormData` that are not in the spec are ignored. Return `Result.ok` with the raw values only when there are no failures. Run the task-3 tests to confirm they pass.

---

### 5. Write failing Bun tests for the `updateEtudeSetup` repository function

**Type**: RED
**Output**: The existing `tests/etude-params-repository.spec.ts` is extended with failing tests asserting `updateEtudeSetup(db, userId, epoch, values)` persists the measure count, time signature, and hand values; increments `workflowVersion` by exactly 1; sets `setupConfirmed` to `true`; leaves `notesConfirmed` and `splitConfirmed` unchanged; verifies the aggregate epoch at commit (rejecting when the stored epoch no longer matches the supplied one, without persisting anything); and is owner-scoped (never updates another user's aggregate).
**Depends on**: 2

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, `true-myth/result`, arrow functions, explicit types, no `any`, kebab-case filenames). Use the existing `tests/helpers/test-db.ts` helper from Issue 4 to obtain a real SQLite database.

Extend `tests/etude-params-repository.spec.ts` with new `describe`/`it` blocks importing the not-yet-existing `updateEtudeSetup` from `src/lib/etude-params-repository.ts`. Use the test-DB helper to create a fresh database, insert a `user` row, and call `loadOrCreateEtudeParams` to seed a default aggregate. Then assert: (a) calling `updateEtudeSetup` with valid values (e.g. 16 measures, `3/4`, `both`) and the current epoch returns `Result.ok` with the updated aggregate whose `measureCount` is 16, `timeSignature` is `3/4`, `hand` is `both`, `workflowVersion` is one greater than before, and `setupConfirmed` is `true`; (b) `notesConfirmed` and `splitConfirmed` remain `false`; (c) calling `updateEtudeSetup` with a stale epoch (one less than the stored value) returns `Result.err` and the stored aggregate is unchanged (no partial update); (d) calling `updateEtudeSetup` for a user who owns no aggregate returns `Result.err` (no row created); (e) a second user's aggregate is never affected by an update for the first user. These tests must fail because `updateEtudeSetup` does not exist yet.

---

### 6. Implement the `updateEtudeSetup` repository function

**Type**: GREEN
**Output**: `src/lib/etude-params-repository.ts` exports `updateEtudeSetup(db: DrizzleClient, userId: string, expectedEpoch: number, values: ValidSetup): Promise<Result<EtudeParams, Error>>` performing a conditional update that verifies the aggregate epoch at commit, increments `workflowVersion` by 1, sets `setupConfirmed` to `true`, and updates the measure/meter/hand columns in the same committed transition. The task-5 tests pass.
**Depends on**: 5

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, `Result`-returning data-access style matching the existing `loadOrCreateEtudeParams` in `src/lib/etude-params-repository.ts`, `withRetry`/`...Actual` pattern from `src/lib/db-access.ts`). Read the `Notes/skills/code-writing/database-access` skill before writing data-access code.

Add `updateEtudeSetup` to `src/lib/etude-params-repository.ts` following the existing `withRetry`/`...Actual` pattern. Import `ValidSetup` from `src/lib/setup-validator.ts`. The function performs a single Drizzle `update` statement with a `where` clause that matches both `userId` and `aggregateEpoch === expectedEpoch`, sets `measureCount`, `timeSignature`, `hand`, `setupConfirmed: true`, `workflowVersion: sql\`workflowVersion + 1\``, and `updatedAt: new Date()`, and uses `.returning()` to read back the updated row. If `returning()` yields zero rows, the epoch did not match (or no aggregate exists) — return `Result.err` with a typed error so the route can respond appropriately. If it yields one row, map it to the domain `EtudeParams` and return `Result.ok`. Never read-then-unconditionally-write. Run the task-5 tests to confirm they pass.

---

### 7. Write failing e2e test for the `GET /etude/setup` form

**Type**: RED
**Output**: A failing `e2e-tests/etude/04-etude-setup-form.spec.ts` asserting that a signed-in student visiting `/etude/setup` sees a form pre-populated with the saved aggregate's values (8 measures, 4/4, right hand by default), every control has an accessible label, native HTML constraints are present (min/max/step on the measures input, required on all controls, the meter and hand controls only allow supported values), and a hidden `workflowVersion` field is present.
**Depends on**: 6

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, Playwright for e2e, kebab-case filenames, `data-testid` attributes named `name-action` for actionable elements and `name-field` for form fields, look in `e2e-tests/support` for helpers and `e2e-tests/etude/03-etude-resume.spec.ts` for the existing etude test pattern before writing).

Create `e2e-tests/etude/04-etude-setup-form.spec.ts` using `testWithDatabase`, `signInUser` from `e2e-tests/support/auth-helpers.ts`, and `TEST_USERS` from `e2e-tests/support/test-data.ts`. After signing in and navigating to `/etude` (which redirects to `/etude/setup`), assert: (a) a form with `data-testid='etude-setup-form'` is visible; (b) the measures input (`data-testid='measures-field'`) has the default value `8`, `min='4'`, `max='32'`, `step='1'`, and `required`; (c) the meter control (`data-testid='meter-field'`) has the default value `4/4` and only offers `2/4`, `3/4`, `4/4`; (d) the hand control (`data-testid='hands-field'`) default to `right` and only offer `left`, `right`, `both`; (e) every control has an associated `<label>` (assert via `page.getByLabel(...)`); (f) a hidden input named `workflowVersion` is present with the current version value. These tests must fail because the current `/etude/setup` route renders only the placeholder banner. Do not modify shared helpers in this task.

---

### 8. Implement the `GET /etude/setup` form

**Type**: GREEN
**Output**: `src/routes/build-etude.tsx` (or a new `src/routes/build-etude-setup.tsx` if one-export-per-file is preferred) replaces the placeholder stub with a real form seeded from `loadEtudeParams`. The form has native HTML constraints on every control, accessible labels, and a hidden `workflowVersion` field. The task-7 e2e tests pass.
**Depends on**: 7

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, Hono route style matching existing routes, `data-testid` naming, DaisyUI components, one export per file where practical, `redirectWithMessage`/`redirectWithError` from `src/lib/redirects.tsx` never `c.redirect`). Read `Notes/skills/code-writing/web-behavior` and `Notes/skills/code-writing/styling-html-and-tsx` before writing route/JSX code. Read `Notes/skills/code-writing/production-code-control-comments` for the PRODUCTION comment convention.

Replace the `renderEtudeSetup` stub in `src/routes/build-etude.tsx` (or extract to a new `src/routes/build-etude-setup.tsx`) with a real form renderer. The `GET /etude/setup` handler loads the owner's aggregate via `loadEtudeParams(db, user.id)`; on `Result.err` delegates to `handleUnexpectedError`; on `Result.ok(null)` (no aggregate yet) redirects to `/etude` so the aggregate is created first; on `Result.ok(params)` renders the form pre-populated with `params.measureCount`, `params.timeSignature`, `params.hand`, and a hidden `workflowVersion` field carrying `params.workflowVersion`. Use the `value` attribute (not `defaultValue`) for form inputs since this is an edit form. Use native HTML constraints: measures input is `type='number'` with `min='4'`, `max='32'`, `step='1'`, `required`; meter is a `<select>` with only `2/4`, `3/4`, `4/4` options; hands is a `<select>` or radio group with only `left`, `right`, `both` options. Every control has an associated `<label>`. The form's `action` is `/etude/setup` and `method` is `post`. Register the route with `secureHeaders(STANDARD_SECURE_HEADERS)` and `signedInAccess`. Do not implement the POST handler in this task — that is task 10. Run the task-7 e2e tests to confirm they pass.

---

### 9. Write failing e2e tests for `POST /etude/setup`

**Type**: RED
**Output**: A failing `e2e-tests/etude/05-etude-setup-submit.spec.ts` asserting: (a) a valid submission (16 measures, 3/4, both) results in a 303 redirect to `/etude/setup`, the form re-displays with the new values after reload, the workflow version has increased, and the setup step is confirmed; (b) an out-of-range measure count (e.g. 33), an unsupported meter (e.g. 6/8), and an unknown hand value, each submitted bypassing native constraints, result in a 303 redirect with a field error, no persistence, and no 500; (c) hostile-shape bodies (empty value, absent field, repeated field, extra field, reordered fields) submitted bypassing native constraints each resolve to a deterministic 303 redirect with a field-addressable error or a successful accept, never a 500, and never a silent coercion.
**Depends on**: 8

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, Playwright for e2e, kebab-case filenames, `data-testid` naming, look in `e2e-tests/support` for helpers and the existing `e2e-tests/etude/` specs for patterns). Use Playwright's `request.post` to submit hostile bodies directly to the route, bypassing native browser constraints, where the test needs to assert server-side enforcement.

Create `e2e-tests/etude/05-etude-setup-submit.spec.ts` using `testWithDatabase`, `signInUser`, and `TEST_USERS`. For the valid-submission test: sign in, navigate to `/etude/setup`, fill the form with 16 measures, 3/4, both, submit, assert the redirect lands on `/etude/setup`, reload the page, and assert the form now shows 16, 3/4, both. For the version-increment and confirmed assertions, the test may need a helper to read the aggregate state via the test-DB helper or assert on the hidden `workflowVersion` field's new value after reload. For the rejection tests: use `page.request.post('/etude/setup', { form: { ... } })` to submit out-of-range, unsupported, and hostile-shape bodies directly (bypassing native constraints), and assert the response is a 303 redirect (not a 500), the form re-displays with the previously saved values (no persistence), and a field-addressable error is visible. These tests must fail because the POST handler does not exist yet (the form posts to a route that returns 404 or 405).

---

### 10. Implement the `POST /etude/setup` handler

**Type**: GREEN
**Output**: `POST /etude/setup` parses the submitted form via the task-4 `parseParameterForm`, validates the parsed values via the task-2 `validateSetup`, persists via `updateEtudeSetup` on success (incrementing the version, marking `setupConfirmed`), and answers 303 via `redirectWithMessage`/`redirectWithError` (never `c.redirect`). On validation failure, redirects 303 to `/etude/setup` with the field errors carried through the one-time validation state (a cookie or flash mechanism matching the existing `redirectWithError` pattern). The task-9 e2e tests pass.
**Depends on**: 9

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, Hono route style, `redirectWithMessage`/`redirectWithError` from `src/lib/redirects.tsx` never `c.redirect`, `data-testid` naming, DaisyUI components). Read `Notes/skills/code-writing/web-behavior` before writing route code. Note: the full compare-and-set stale-version rejection with redisplay of the newly-current saved state is Issue 10's responsibility; this task emits the hidden `workflowVersion` field and increments on success, but does not need to implement the stale-version redisplay pattern yet — a missing or non-numeric version can be treated as a generic rejection for now.

Add a `POST /etude/setup` route to `src/routes/build-etude.tsx` (or the new `src/routes/build-etude-setup.tsx`) registered with `secureHeaders(STANDARD_SECURE_HEADERS)` and `signedInAccess`. The handler: reads the authenticated user and database; awaits `c.req.parseBody()` to obtain a `FormData`; calls `parseParameterForm(formData, setupFieldSpec)` to extract raw values; on parse failure, redirects 303 to `/etude/setup` with the field errors via `redirectWithError`; on parse success, calls `validateSetup(rawValues)`; on validation failure, redirects 303 with the field errors; on validation success, loads the current aggregate via `loadEtudeParams` to obtain the current epoch and version, calls `updateEtudeSetup(db, user.id, params.aggregateEpoch, validSetup)`; on `Result.err` (epoch mismatch or DB failure), redirects 303 with a safe generic error message (no internal detail); on `Result.ok`, redirects 303 to `/etude/setup` via `redirectWithMessage` with an empty or success message. The route never trusts submitted values for ownership, version, or epoch — the version and epoch are read from the stored aggregate, not from the form. The hidden `workflowVersion` field is emitted by the GET form (task 8) and will be used for compare-and-set in Issue 10. Run the task-9 e2e tests to confirm they pass.

---

### 11. Encapsulation sweep and full-suite verification

**Type**: REFACTOR
**Output**: No route or test file bypasses the domain validator, form parser, or repository interface. `tsc --noEmit` reports zero errors in any file created or modified for this issue. The full Bun unit suite and the Playwright e2e suite pass.
**Depends on**: 10

Read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md`. Search `src/routes/`, `src/lib/`, and `tests/` for any direct dependency on the raw `etude_params` physical schema, any inline validation logic that should live in `src/lib/setup-validator.ts`, or any inline form parsing that should live in `src/lib/etude-form-parser.ts`. Move any such logic behind the appropriate module. Run `tsc --noEmit`, the full `bun test` suite, and `npx playwright test` and confirm they are green. Do not modify the parent issue, the parent PRD, or prior task/issue/walkthrough files in `Notes/`.

---

### 12. Document the setup validator, form parser, repository update, and setup routes

**Type**: DOCUMENT
**Output**: Wiki and Notes updates describing `src/lib/setup-validator.ts` (the typed domain validator and the supported measure/meter/hand domain), `src/lib/etude-form-parser.ts` (the reusable hostile-shape-tolerant parameter-form parser), the `updateEtudeSetup` repository function (conditional update with epoch verification and version increment), the real `GET /etude/setup` form (native constraints, accessible labels, hidden version field), and the `POST /etude/setup` handler (PRG 303, validation, persistence, confirmation). Follow `Notes/wiki/wiki-rules.md` and `Notes/wiki/AGENTS.md` for wiki ingestion.
**Depends on**: 11

Update the relevant wiki pages: `Notes/wiki/source-code.md` (add `src/lib/setup-validator.ts`, `src/lib/etude-form-parser.ts`, the `updateEtudeSetup` addition to `src/lib/etude-params-repository.ts`, and the changed `src/routes/build-etude.tsx` or new `src/routes/build-etude-setup.tsx`), `Notes/wiki/e2e-tests.md` (catalog `e2e-tests/etude/04-etude-setup-form.spec.ts` and `e2e-tests/etude/05-etude-setup-submit.spec.ts`), `Notes/wiki/unit-tests.md` (catalog `tests/setup-validator.spec.ts` and `tests/etude-form-parser.spec.ts` and the extended `tests/etude-params-repository.spec.ts`), `Notes/wiki/project-overview.md` (describe the setup step, the supported musical domain for measures/meter/hands, and the parameter-form pattern this issue establishes for Issues 6, 7, 13, 14, and 16), and `Notes/wiki/index.md` if new sections are added. Append a `## [YYYY-MM-DD] ingest | issue-005 setup step` entry to `Notes/wiki/log.md`. Do not modify the parent issue or the parent PRD.

---

### 13. Code walkthrough

**Type**: CODE WALKTHROUGH
**Output**: `Notes/walkthroughs/issue-005-setup-step-measures-meter-hands/code-walkthrough/` containing the files generated by `uvx showboat` for this implementation.
**Depends on**: 12

Run `uvx showboat --help` for current usage, then generate a walkthrough of the issue-005 implementation into a new directory `Notes/walkthroughs/issue-005-setup-step-measures-meter-hands/code-walkthrough/`. Place all generated files there.

---

### 14. Human review against the PRD and cross-cutting contract

**Type**: REVIEW
**Output**: A human verifies the implementation against the PRD's "Supported musical domain" and "Validation, errors, logging, and accessibility" sections, cross-cutting contract §1 (universal route requirements), §2 (parameter-form contract: PRG 303, native constraints with independent server enforcement, hostile-shape tolerance), §4 (workflow version increments on a successful commit and the aggregate epoch is verified), and §6 (applicability matrix row for Issue 5), confirming every acceptance criterion in the parent issue is met.
**Depends on**: 13

This is a human-in-the-loop step. The human must verify: a student submitting 4 or 32 measures has the value accepted and persisted; a submission of 3, 33, a decimal, or a non-numeric measure count is rejected and the stored value is unchanged; a submission of 2/4, 3/4, or 4/4 is accepted and 6/8 or any other meter is rejected; a submission of left, right, or both is accepted and any other hand value is rejected; every handled setup POST answers with a 303 redirect to a canonical GET; a successful setup POST marks the setup step confirmed and increments the workflow version; an empty value or absent field for measures, meter, or hands is rejected with a field-addressable error and is not coerced into a default; a repeated field submission is deterministic (stated normalization or field-addressable reject) and never a 500; an unexpected extra field or reordered fields are validated identically and never produce a 500. Record the result in the review notes. Do not modify the parent issue or the parent PRD.

---

## Implementation Status

Tasks 1-11 completed by Devin (GLM-5.2-high). All 184 unit tests and 18 etude e2e tests pass. Task 12 (wiki/notes documentation) completed. Task 13 (code walkthrough) and Task 14 (human review) remain.

### Files created
- `src/lib/setup-validator.ts` — domain validator (Task 2)
- `src/lib/etude-form-parser.ts` — reusable form parser (Task 4)
- `tests/setup-validator.spec.ts` — 20 unit tests (Task 1)
- `tests/etude-form-parser.spec.ts` — 9 unit tests (Task 3)
- `e2e-tests/etude/04-etude-setup-form.spec.ts` — 1 e2e test (Task 7)
- `e2e-tests/etude/05-etude-setup-submit.spec.ts` — 9 e2e tests (Task 9)

### Files modified
- `src/lib/etude-params-repository.ts` — added `updateEtudeSetup` (Task 6)
- `src/routes/build-etude.tsx` — real GET form + POST handler (Tasks 8, 10)
- `tests/etude-params-repository.spec.ts` — 6 new tests for `updateEtudeSetup` (Task 5)

---
