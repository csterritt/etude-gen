# Tasks for #11: Upstream changes clear dependent downstream choices

Parent issue: #11
Parent PRD: `Notes/PRD-etude-generator.md`

## Tasks

### 1. Add downstream data columns to `etude_params`

**Type**: MIGRATE
**Output**: `src/db/schema.ts` `etudeParams` table has three new nullable text columns `selectedPitches`, `selectedDurations`, `splitBoundary` (default null); the `EtudeParams` interface and `mapToDomain` in `src/lib/etude-params-repository.ts` include the new fields as `string | null`; a new drizzle migration exists under `drizzle/` (e.g. `0003_*.sql`) adding the columns; `schema.sql` at the project root is regenerated to include the new columns; `tsc --noEmit` passes; the existing `bun test` suite passes (existing repository tests still compile and pass, treating the new fields as null).
**Depends on**: none

Read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies). Read `Notes/skills/code-writing/database-access` for the DB access conventions and `Notes/skills/code-writing/typescript-rules` for the TypeScript conventions. Look at the existing `etudeParams` table definition in `src/db/schema.ts` (around lines 112-134) and the existing migrations under `drizzle/` plus `build-schema-update.sh` for the migration workflow.

Add three nullable text columns to the `etudeParams` table in `src/db/schema.ts`: `selectedPitches: text('selectedPitches')`, `selectedDurations: text('selectedDurations')`, `splitBoundary: text('splitBoundary')`. They must be nullable with no `notNull()` and no default (default null), because the notes and split steps that populate them arrive in later slices (Issues 13, 14, 16) — at this stage they are always null until a test or a later step writes them. Add a short comment explaining these hold the downstream pitch-selection, duration-selection, and split-boundary data that Issue 11's invalidation clears. Update the `EtudeParams` interface in `src/lib/etude-params-repository.ts` (around lines 32-48) to add `selectedPitches: string | null`, `selectedDurations: string | null`, `splitBoundary: string | null`, and update `mapToDomain` (around lines 54-70) to map them from the row. Generate the migration by running `npx drizzle-kit generate` (which creates a new `drizzle/0003_*.sql` `ALTER TABLE ... ADD COLUMN` file), then regenerate `schema.sql` by running the concatenation step from `build-schema-update.sh` (or the whole script if a dev D1 apply is desired — do NOT apply to production). Confirm `tsc --noEmit` and `bun test tests/etude-params-repository.spec.ts` pass. Do not introduce a stored review flag — review completion stays derived (cross-cutting contract section 5).

---

### 2. Write failing Bun tests for `computeDownstreamInvalidation` pure function

**Type**: RED
**Output**: A failing `tests/etude-invalidation.spec.ts` that asserts `computeDownstreamInvalidation(stored: EtudeParams, submitted: ValidSetup): InvalidationPlan` is a pure function encoding the Issue 11 dependency map. `InvalidationPlan` is `{ clearPitches: boolean; clearDurations: boolean; clearSplit: boolean; unconfirmNotes: boolean; unconfirmSplit: boolean }`. The tests cover every row of the dependency map plus unions and no-ops.
**Depends on**: 1

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test` with `describe`/`it`/`expect`, arrow functions, explicit types, no `any`, kebab-case filenames). Look at `tests/etude-params-repository.spec.ts` for the `EtudeParams` shape and the `validSetup` constant, and at `src/lib/setup-validator.ts` for the `ValidSetup` shape (`{ measureCount, timeSignature, hand, keySignature, octaves: number[] }`).

Create `tests/etude-invalidation.spec.ts` importing from `bun:test` and from the not-yet-existing `src/lib/etude-invalidation.ts`. Build a `stored` `EtudeParams` (with `selectedPitches: 'C4,D4'`, `selectedDurations: 'quarter,eighth'`, `splitBoundary: 'D4'`, `notesConfirmed: true`, `splitConfirmed: true`) and a `validSetup`-shaped `submitted` value, then vary one field at a time and assert the plan: (a) key changed → `clearPitches: true`, `clearSplit: true`, `clearDurations: false`, `unconfirmNotes: true`, `unconfirmSplit: true`; (b) octaves changed → same as key; (c) meter changed → `clearDurations: true`, `clearPitches: false`, `clearSplit: false`, `unconfirmNotes: true`, `unconfirmSplit: false`; (d) only measureCount changed → all plan booleans `false` (nothing downstream invalidated, though the version still increments in the repository); (e) hand changed to `'both'` with `stored.selectedPitches` having fewer than two pitches (e.g. `'C4'`) → `clearSplit: true`, `unconfirmNotes: true` (revalidation failed), `clearPitches: false` (pitch selection retained), `clearDurations: false`; (f) hand changed to `'both'` with two or more pitches (e.g. `'C4,D4'`) → `clearSplit: true`, `unconfirmNotes: false`, `clearPitches: false`; (g) hand changed to one hand (`'left'` or `'right'`) → `clearSplit: true`, `unconfirmNotes: false`, `clearPitches: false`; (h) hand changed to `'both'` with `selectedPitches` null/empty → `unconfirmNotes: true`; (i) key and meter both changed → union: `clearPitches: true`, `clearDurations: true`, `clearSplit: true`, `unconfirmNotes: true`, `unconfirmSplit: true`; (j) key and hand both changed (to `'both'`, <2 pitches) → union: `clearPitches: true`, `clearSplit: true`, `clearDurations: false`, `unconfirmNotes: true`, `unconfirmSplit: true`; (k) nothing changed (submitted equals stored on all five setup fields) → all plan booleans `false`; (l) the function is pure — it does not mutate its arguments, touch the DB, or throw for any of the above inputs. These tests must fail because the module does not exist yet.

---

### 3. Implement `computeDownstreamInvalidation`

**Type**: GREEN
**Output**: `src/lib/etude-invalidation.ts` exports the `InvalidationPlan` interface and `computeDownstreamInvalidation` as a pure arrow function. The task-2 tests pass.
**Depends on**: 2

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, one export per file where practical). Read `Notes/skills/code-writing/typescript-rules` for the TypeScript conventions. Look at `src/lib/operation-precondition.ts` for the pure-function style and at `src/lib/etude-params-repository.ts` for the `EtudeParams` type.

Create `src/lib/etude-invalidation.ts` exporting `InvalidationPlan` (`{ clearPitches: boolean; clearDurations: boolean; clearSplit: boolean; unconfirmNotes: boolean; unconfirmSplit: boolean }`) and `computeDownstreamInvalidation(stored: EtudeParams, submitted: ValidSetup): InvalidationPlan`. Compare each upstream field: `keyChanged = stored.keySignature !== submitted.keySignature`; `octavesChanged = stored.selectedOctaves !== submitted.octaves.join(',')`; `meterChanged = stored.timeSignature !== submitted.timeSignature`; `handChanged = stored.hand !== submitted.hand`. Set `clearPitches = keyChanged || octavesChanged`, `clearDurations = meterChanged`, `clearSplit = keyChanged || octavesChanged || handChanged`. For the hands revalidation: when `handChanged` and `submitted.hand === 'both'`, parse `stored.selectedPitches` (comma-separated, null/empty → zero pitches) and set `handsRevalidationFailed = pitchCount < 2`; otherwise `handsRevalidationFailed = false`. Derive `unconfirmNotes = clearPitches || clearDurations || handsRevalidationFailed` and `unconfirmSplit = clearSplit`. The function must not mutate its arguments, touch the DB, or throw. Run the task-2 tests to confirm they pass.

---

### 4. Write failing Bun tests for `updateEtudeSetup` full invalidation

**Type**: RED
**Output**: New and updated cases in `tests/etude-params-repository.spec.ts` that fail because `updateEtudeSetupActual` does not yet clear/retain the new downstream data fields per the full dependency map, does not handle the meter, hands, or measure-count rows, and does not assert the union, identical-resubmit-retain, stale-version-first, and injected-failure behaviors.
**Depends on**: 1, 3

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, arrow functions, explicit types, no `any`, kebab-case filenames, look at `tests/etude-params-repository.spec.ts` for the existing repository test pattern — `createTestDb`, `insertUser`, `unwrap`, `loadOrCreateEtudeParams`, `loadEtudeParams`, the `validSetup` constant, the `confirmNotesAndSplit` helper). Read `Notes/skills/code-writing/typescript-rules` and `Notes/skills/code-writing/database-access`.

Add a `seedDownstreamState` helper to `tests/etude-params-repository.spec.ts` (alongside `confirmNotesAndSplit`) that sets `notesConfirmed: true`, `splitConfirmed: true`, `selectedPitches: 'C4,D4'`, `selectedDurations: 'quarter,eighth'`, `splitBoundary: 'D4'` on the owner's row, so tests can simulate "the student walked forward and made downstream selections" before an upstream change. Add `describe` blocks covering every dependency-map row: (a) key change → after update, `selectedPitches` is null, `splitBoundary` is null, `selectedDurations` is still `'quarter,eighth'` (retained), `notesConfirmed` false, `splitConfirmed` false, `workflowVersion` incremented by 1; (b) octave change → same as key; (c) meter change → `selectedDurations` null, `selectedPitches` retained (`'C4,D4'`), `splitBoundary` retained (`'D4'`), `notesConfirmed` false, `splitConfirmed` still true (retained), version incremented; (d) only measureCount change → `selectedPitches`, `selectedDurations`, `splitBoundary` all retained, `notesConfirmed` and `splitConfirmed` still true, version incremented; (e) hand change to `'both'` with `selectedPitches: 'C4'` (fewer than two) seeded → `splitBoundary` null, `selectedPitches` retained (`'C4'`), `notesConfirmed` false, `splitConfirmed` false, version incremented; (f) hand change to `'both'` with `selectedPitches: 'C4,D4'` (two) seeded → `splitBoundary` null, `selectedPitches` retained, `notesConfirmed` still true, `splitConfirmed` false, version incremented; (g) hand change to `'left'` → `splitBoundary` null, `selectedPitches` retained, `notesConfirmed` still true, `splitConfirmed` false; (h) one submission changing key and meter together → `selectedPitches` null, `selectedDurations` null, `splitBoundary` null, `notesConfirmed` false, `splitConfirmed` false, and `workflowVersion` incremented exactly once (union of dependents in a single committed transition); (i) identical resubmit (all five setup fields equal to stored) with downstream state seeded → downstream state fully retained, `workflowVersion` unchanged; (j) a submission carrying a stale `expectedWorkflowVersion` (stored - 1) together with upstream changes (e.g. a different key) → `Result.err` with `kind: 'version-mismatch'`, and a reload confirms the prior upstream values, the prior downstream selections, and the unchanged version are all still in place (the compare-and-set rejection happens first, so nothing is invalidated); (k) an injected failure during the invalidating write — pass a `DrizzleClient` wrapper whose `update` throws, call `updateEtudeSetup`, assert `result.isErr` and `result.error.kind === 'db-error'`, and confirm via a separate real `createTestDb` client that nothing was persisted (the prior upstream and downstream state and version are unchanged). Also update the existing key/octave invalidation tests (the ones that currently assert only `notesConfirmed`/`splitConfirmed` flip) to additionally assert `selectedPitches` and `splitBoundary` are null and `selectedDurations` is retained. These tests must fail because the repository does not yet clear/retain the new data fields or handle the meter/hands/measure-count rows.

---

### 5. Apply full invalidation in `updateEtudeSetupActual`

**Type**: GREEN
**Output**: `updateEtudeSetupActual` in `src/lib/etude-params-repository.ts` calls `computeDownstreamInvalidation(stored, values)` and applies the resulting `InvalidationPlan` inside the existing conditional `.set(...)` (the same compare-and-set write that increments the version), clearing `selectedPitches`/`selectedDurations`/`splitBoundary` to null and `notesConfirmed`/`splitConfirmed` to false exactly as the plan dictates. The old inline `keyChanged || octavesChanged` logic is removed. The task-4 tests pass, and the full repository suite passes.
**Depends on**: 4

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, `Result` from `true-myth/result`). Read `Notes/skills/code-writing/database-access` and `Notes/skills/code-writing/typescript-rules`. Look at the existing `updateEtudeSetupActual` (around lines 254-344) for the current CAS pattern: load → identical-resubmit short-circuit → conditional `update(...).set(...).where(eq userId, eq aggregateEpoch, eq workflowVersion).returning()` → zero-row disambiguation.

Replace the inline `keyChanged || octavesChanged ? { notesConfirmed: false, splitConfirmed: false } : {}` spread with a call to `computeDownstreamInvalidation(stored, values)` (imported from `src/lib/etude-invalidation.ts`). Build the `.set(...)` spread from the plan: include `selectedPitches: null` when `plan.clearPitches`, `selectedDurations: null` when `plan.clearDurations`, `splitBoundary: null` when `plan.clearSplit`, `notesConfirmed: false` when `plan.unconfirmNotes`, and `splitConfirmed: false` when `plan.unconfirmSplit`. Keep `setupConfirmed: true` and `workflowVersion: sql\`${etudeParams.workflowVersion} + 1\`` unchanged. The invalidating write is the same committed transition as the version increment (cross-cutting contract section 4) — do not issue a second update. The identical-resubmit short-circuit (which compares the five setup fields and returns Ok with no write when all match and the version matches) is unchanged, so identical resubmits retain all downstream state. The CAS `where` clause is unchanged, so a stale version rejects before any invalidation. Run the task-4 tests and the full repository suite to confirm they pass.

---

### 6. Write failing Bun tests for `isReviewReachable` derived predicate

**Type**: RED
**Output**: A failing section of `tests/etude-invalidation.spec.ts` that asserts `isReviewReachable(params: EtudeParams): boolean` is a pure predicate deriving review reachability from the confirmation flags — true exactly when `setupConfirmed && notesConfirmed && (hand !== 'both' || splitConfirmed)` — and that no stored review flag exists.
**Depends on**: 1

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, arrow functions, explicit types, no `any`). Look at `tests/canonical-route.spec.ts` for the `baseParams` helper that builds an `EtudeParams` with overrides.

Add tests to `tests/etude-invalidation.spec.ts` for `isReviewReachable` (imported from the not-yet-exported `src/lib/etude-invalidation.ts`): (a) `setupConfirmed: true`, `notesConfirmed: true`, `hand: 'right'` → true; (b) `setupConfirmed: true`, `notesConfirmed: true`, `hand: 'both'`, `splitConfirmed: true` → true; (c) `notesConfirmed: false` → false; (d) `hand: 'both'`, `splitConfirmed: false` → false; (e) `setupConfirmed: false` → false; (f) after a simulated invalidation that clears `notesConfirmed` (the predicate recomputes from flags, not a stored review flag) → false. Also add a test asserting the `EtudeParams` type has no `reviewConfirmed` field (e.g. assert that constructing a `baseParams({...})` and accessing `(params as any).reviewConfirmed` is `undefined`, or assert via the schema that no `reviewConfirmed` column exists in `src/db/schema.ts`) — review completion is derived, never persisted (cross-cutting contract section 5). These tests must fail because `isReviewReachable` is not exported yet.

---

### 7. Implement `isReviewReachable`

**Type**: GREEN
**Output**: `src/lib/etude-invalidation.ts` exports `isReviewReachable` as a pure arrow function. The task-6 tests pass.
**Depends on**: 6

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies). Read `Notes/skills/code-writing/typescript-rules`.

Add `isReviewReachable(params: EtudeParams): boolean` to `src/lib/etude-invalidation.ts`. Return `true` exactly when `params.setupConfirmed && params.notesConfirmed && (params.hand !== 'both' || params.splitConfirmed)`. The function reads only the existing confirmation flags and `hand` — it does not consult any stored review flag (none exists) and does not touch the DB or mutate its argument. Run the task-6 tests to confirm they pass.

---

### 8. Write failing Playwright test for end-to-end invalidation

**Type**: RED
**Output**: A failing `e2e-tests/etude/14-etude-downstream-invalidation.spec.ts` that signs in, completes setup via the real setup form, seeds downstream state via a test-only route, changes an upstream value via the real setup form, and asserts via a test-only inspection route that the dependent downstream state is cleared, unrelated downstream state is retained, the version incremented, and review is no longer reachable. A second case resubmits identical setup values and asserts downstream state is retained.
**Depends on**: 5, 7

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (Playwright tests, `testWithDatabase` helper, `signInUser` and `navigateToHome` from `e2e-tests/support/`, `data-testid` naming with kebab-case, look at `e2e-tests/etude/05-etude-setup-submit.spec.ts` for the `postSetupViaBrowser` pattern and `SERVER_BASE_URL` usage, and `e2e-tests/etude/12-etude-setup-stale-version.spec.ts` for the two-tab / fetch-with-`maxRedirects: 0` pattern). Look at `e2e-tests/support/test-data.ts` for `TEST_USERS` and `SERVER_BASE_URL`.

Create `e2e-tests/etude/14-etude-downstream-invalidation.spec.ts` importing from `@playwright/test` and the support helpers, wrapped in `testWithDatabase`. Case 1 (key change clears pitches + split, retains durations): sign in as `KNOWN_USER`, navigate to `/etude` to create the aggregate and land on `/etude/setup`, submit a valid setup (e.g. measures 16, meter 3/4, hands both, key C major, octaves 4) via `postSetupViaBrowser` so `setupConfirmed` becomes true and the version increments. Then POST to `${SERVER_BASE_URL}/test/etude/seed-downstream-state` to set `notesConfirmed`, `splitConfirmed`, `selectedPitches: 'C4,D4'`, `selectedDurations: 'quarter,eighth'`, `splitBoundary: 'D4'`. Navigate back to `/etude/setup`, change the key (e.g. to G major) keeping the current `workflowVersion`, and submit via the real form. Then GET `${SERVER_BASE_URL}/test/etude/aggregate-state` and assert the JSON response shows `notesConfirmed: false`, `selectedPitches: null`, `splitConfirmed: false`, `splitBoundary: null`, `selectedDurations: 'quarter,eighth'` (retained), `workflowVersion` incremented by 1 from the seeded value, and `isReviewReachable: false`. Case 2 (identical resubmit retains downstream): after seeding downstream state, resubmit the exact same setup values via the real form and assert the inspection route shows `notesConfirmed: true`, `splitConfirmed: true`, `selectedPitches: 'C4,D4'`, `selectedDurations: 'quarter,eighth'`, `splitBoundary: 'D4'`, and `workflowVersion` unchanged. These tests must fail because the test-only seed and inspection routes do not exist yet.

---

### 9. Add test-only seed and inspection routes

**Type**: GREEN
**Output**: `POST /test/etude/seed-downstream-state` and `GET /test/etude/aggregate-state` routes (gated by `isTestRouteEnabled`) mounted in `src/index.ts` inside the existing `if (isTestRouteEnabledFlag)` block. The seed route sets the downstream fields on the owner's aggregate; the inspection route returns the aggregate's confirmation flags, downstream data, `workflowVersion`, and `isReviewReachable` as JSON. The task-8 e2e test passes.
**Depends on**: 8

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies). Read `Notes/skills/code-writing/production-code-control-comments` for the PRODUCTION comment convention. Look at `src/routes/test/etude-operation-precondition.ts` for the test-route pattern (signed-in access, owner-scoped, `isTestRouteEnabled` gating), at `src/lib/test-routes.ts` for `isTestRouteEnabled`, and at `src/index.ts` for how test routes are mounted (the `if (isTestRouteEnabledFlag)` block around line 222 and the `/test/` middleware around line 133).

Create `src/routes/test/etude-downstream-state.ts` exporting a `POST /test/etude/seed-downstream-state` handler and a `GET /test/etude/aggregate-state` handler, both requiring `signedInAccess` and the existing correlation middleware so they mirror a real route's universal requirements (cross-cutting contract section 1). The seed route loads the owner's aggregate via `loadEtudeParams`; if none exists, redirect to `/etude` with `redirectWithError`. It reads optional `selectedPitches`, `selectedDurations`, `splitBoundary` multipart fields from the request and unconditionally sets `notesConfirmed: true` and `splitConfirmed: true` plus the provided data fields on the owner's row (a direct owner-scoped update — this is test infrastructure, not production logic). The inspection route loads the owner's aggregate via `loadEtudeParams` and returns a JSON response (`c.json(...)`) with `setupConfirmed`, `notesConfirmed`, `splitConfirmed`, `selectedPitches`, `selectedDurations`, `splitBoundary`, `workflowVersion`, `hand`, and `isReviewReachable` (computed via `isReviewReachable` from `src/lib/etude-invalidation.ts`); if no aggregate exists, return a 404 JSON. Mount both in `src/index.ts` inside the existing `if (isTestRouteEnabledFlag)` block, following the `etude-operation-precondition` mounting pattern, with the `PRODUCTION:REMOVE` import comment convention. Run the task-8 e2e tests to confirm they pass.

---

### 10. Refactor invalidation wiring

**Type**: REFACTOR
**Output**: No duplicated invalidation logic between `src/lib/`, `src/routes/`, and `tests/`; the `InvalidationPlan` and `isReviewReachable` types/functions are defined once in `src/lib/etude-invalidation.ts` and imported where needed; the dependency-map decisions live only in `computeDownstreamInvalidation` (not duplicated inline in the repository); `tsc --noEmit` reports zero errors in any file created or modified for this issue; the full `bun test` suite and the `npx playwright test` suite pass.
**Depends on**: 9

Read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md`. Search `src/routes/`, `src/lib/`, `src/components/`, and `tests/` for any duplicated dependency-map logic, inline field-change comparisons that duplicate `computeDownstreamInvalidation`, or duplicated review-reachability checks that should call `isReviewReachable`. Move any such logic behind `src/lib/etude-invalidation.ts`. Ensure the invalidation plan is computed once and applied in the single CAS write. Run `tsc --noEmit`, the full `bun test` suite, and `npx playwright test` and confirm they are green. Do not modify the parent issue, the parent PRD, or prior task/issue/walkthrough files in `Notes/`.

---

### 11. Update wiki and notes documentation

**Type**: DOCUMENT
**Output**: Wiki and Notes updates describing the new `selectedPitches`/`selectedDurations`/`splitBoundary` columns and the `EtudeParams` change, the `computeDownstreamInvalidation` pure function and `InvalidationPlan` type, the `isReviewReachable` derived predicate (and the explicit absence of a stored review flag), the full dependency map now enforced inside `updateEtudeSetupActual`'s CAS write, the test-only seed/inspection routes, and the new test files. Follow `Notes/wiki/wiki-rules.md` and `Notes/wiki/AGENTS.md` for the wiki ingest operation.
**Depends on**: 10

Before writing documentation, read `Notes/wiki/AGENTS.md` and `Notes/wiki/wiki-rules.md` for the wiki conventions (ingest operation, kebab-case filenames, update `index.md` and append to `log.md` with the `## [YYYY-MM-DD] <operation> | <subject>` format).

Update the relevant wiki pages: `Notes/wiki/source-code.md` (add `src/lib/etude-invalidation.ts`, the changed `src/db/schema.ts` columns, the changed `src/lib/etude-params-repository.ts` `EtudeParams`/`mapToDomain`/`updateEtudeSetupActual` invalidation, and the new test-only routes in `src/routes/test/etude-downstream-state.ts`), `Notes/wiki/e2e-tests.md` (catalog `e2e-tests/etude/14-etude-downstream-invalidation.spec.ts`), `Notes/wiki/unit-tests.md` (catalog the new `tests/etude-invalidation.spec.ts` and the new repository test cases), `Notes/wiki/project-overview.md` (describe the dependent-downstream invalidation model: the dependency map, the single committed CAS transition that clears dependent data and flags while retaining unrelated downstream state, the identical-resubmit no-op, the stale-version-first rejection, the two-hand revalidation, and the derived review-reachability predicate — and note that the actual canonical-route redirect to the earliest incomplete step is wired by Issue 18 once the notes/split routes exist), and `Notes/wiki/index.md` if new sections are added. Append a `## [YYYY-MM-DD] ingest | issue-011 dependent downstream invalidation` entry to `Notes/wiki/log.md`. Do not modify the parent issue or the parent PRD.

---

### 12. Code walkthrough

**Type**: CODE WALKTHROUGH
**Output**: `Notes/walkthroughs/issue-011-dependent-downstream-invalidation/code-walkthrough/` containing the files generated by `uvx showboat` for this implementation.
**Depends on**: 11

Run `uvx showboat --help` for current usage, then generate a walkthrough of the issue-011 implementation into a new directory `Notes/walkthroughs/issue-011-dependent-downstream-invalidation/code-walkthrough/`. The walkthrough should cover: (1) the new `selectedPitches`/`selectedDurations`/`splitBoundary` columns and the migration, (2) the `computeDownstreamInvalidation` pure function and `InvalidationPlan` type (each dependency-map row, the two-hand revalidation, the union of dependents), (3) the `isReviewReachable` derived predicate and the absence of a stored review flag, (4) the `updateEtudeSetupActual` change applying the plan inside the single CAS write (the identical-resubmit short-circuit and the stale-version-first rejection), and (5) the test-only seed/inspection routes and the Playwright end-to-end scenario. Place all generated files there.

---

### 13. Human review against the PRD and cross-cutting contract

**Type**: REVIEW
**Output**: A human verifies the implementation against the issue's "How to verify" and "Acceptance criteria" sections, the PRD's invalidation decision (user story 26), cross-cutting contract §2 clause 6 (clear dependent downstream state in the same committed transition as the change), §4 (the invalidating write is the same compare-and-set write as the parameter change — no second transition), §5 (review completion is derived, never persisted; the canonical route after invalidation is the earliest now-unconfirmed step — noting the redirect wiring itself is Issue 18), and §6 (applicability matrix row for Issue 11: Invalidation = B), confirming every acceptance criterion in the parent issue is met.
**Depends on**: 12

This is a human-in-the-loop step. The human must verify: (a) given saved downstream selections, when key, octave range, meter, or hand selection changes, exactly the dependent state listed in the dependency map is cleared and unrelated downstream state is retained; (b) an identical setup submission preserves all downstream state; (c) one submission changing several upstream fields clears the union of their dependents in a single committed transition (version increments exactly once); (d) after clearing, the earliest incomplete step moves back accordingly and review is no longer reachable, with no stored review flag consulted; (e) an injected failure during the invalidating write leaves externally visible state unchanged — prior upstream values, prior downstream selections, and the version all unchanged, with a generic retry message and correlation identifier; (f) a submission carrying a stale workflow version alongside upstream changes is rejected by the compare-and-set first, so no invalidation takes place; (g) switching from one hand to both makes the notes step unconfirmed when fewer than two pitches are stored, while retaining the pitch selection. Record the result in the review notes. Do not modify the parent issue or the parent PRD.

---
