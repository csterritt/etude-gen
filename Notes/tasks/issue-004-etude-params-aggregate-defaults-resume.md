# Tasks for #4: Etude parameter aggregate with practical defaults and resume

Parent issue: #4
Parent PRD: `Notes/PRD-etude-generator.md`

## Tasks

### 1. Add the `etude_params` table and generate the migration

**Type**: MIGRATE
**Output**: `src/db/schema.ts` defines an `etude_params` table with a text primary key, a `userId` column referencing `user.id` with `onDelete: 'cascade'` and a database-level `UNIQUE` constraint on that owner reference, default-value columns (8 measures, 4/4, C major, octave range 4, right hand), a `workflowVersion` integer, an `aggregateEpoch` integer, three step-confirmation boolean flags (`setupConfirmed`, `notesConfirmed`, `splitConfirmed`) all defaulting to `false`, and `createdAt`/`updatedAt` timestamps. `npx drizzle-kit generate` produces a new SQL file under `drizzle/` and `build-schema-update.sh` applies it to the local D1 database. The `schema` export and inferred `EtudeParam`/`NewEtudeParam` types are added to `src/db/schema.ts`.
**Depends on**: none

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, Drizzle schema patterns matching the existing tables in `src/db/schema.ts`).

Add an `etude_params` table to `src/db/schema.ts` modeled on the existing `user`/`session`/`account` table style (text primary key, `references(() => user.id, { onDelete: 'cascade' })`, integer timestamps in `timestamp` mode). The owner column must carry a Drizzle `unique()` constraint so the database enforces one aggregate per owner independently of any application-level check — follow the same pattern `user.email` uses for `.unique()`. Define the default aggregate columns with the PRD's practical defaults: `measureCount` integer default `8`, `timeSignature` text default `'4/4'`, `keySignature` text default `'C major'`, `octaveRange` integer default `4`, `hand` text default `'right'`. Add `workflowVersion` integer notNull default `1` and `aggregateEpoch` integer notNull default `1` (both monotonic; section 4 of `Notes/issues/etude-cross-cutting-contract.md` defines their semantics — Start Over bumps the epoch, account deletion moves it to a terminal value, parameter-form POSTs increment the version). Add `setupConfirmed`, `notesConfirmed`, and `splitConfirmed` as `integer({ mode: 'boolean' }).default(false).notNull()` columns so a freshly created aggregate has no confirmed steps (section 5: defaults pre-populate controls, they do not pre-confirm steps). Add `createdAt` and `updatedAt` as `integer('...', { mode: 'timestamp' }).notNull()`. Export the table in the `schema` object and add the `EtudeParam`/`NewEtudeParam` inferred types alongside the existing `User`/`NewUser` exports. Then run `npx drizzle-kit generate` and `./build-schema-update.sh` to generate and apply the migration. Do not write any repository or route code in this task — schema and migration only.

---

### 2. Set up Bun test-database infrastructure for repository tests

**Type**: CONFIG
**Output**: A `tests/helpers/test-db.ts` helper that creates a real SQLite database (using `bun:sqlite` with `drizzle-orm/bun-sqlite`, or `better-sqlite3` with `drizzle-orm/better-sqlite3` — whichever is already available or least-friction to add as a dev dependency), applies the generated `schema.sql` (or the Drizzle schema directly) to it, and returns a Drizzle client whose query-builder API is compatible with the repository functions. A smoke test in `tests/helpers/test-db.spec.ts` proves a table can be created, a row inserted, and the row read back.
**Depends on**: 1

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, `bun:test` for unit tests, kebab-case filenames). Check `package.json` for an already-available SQLite driver before adding a new dev dependency; prefer a version published at least 7 days ago.

The existing `tests/*.spec.ts` files test pure functions or mock operations and never construct a `DrizzleClient` — but the repository tests for this issue require real database behavior (uniqueness constraint rejection, cascade deletion, the losing-caller insert-then-load path). Create `tests/helpers/test-db.ts` exporting an arrow function that builds a fresh SQLite database for each test (in-memory where possible, file-based if WAL/multi-connection behavior is needed), applies the same schema the production migration produces, and returns a Drizzle client. The repository functions will be typed against the production `DrizzleClient` (the D1 client type from `src/local-types.ts`); the test helper may return a `drizzle-orm/bun-sqlite` (or `better-sqlite3`) client cast through `unknown` to `DrizzleClient` for test use only, since both drivers implement the same query-builder surface the repository uses. Add a `tests/helpers/test-db.spec.ts` smoke test that creates the test DB, inserts a `user` row, reads it back, and asserts the values match. Do not write the repository or its tests in this task — only the helper and its smoke test.

---

### 3. Write failing Bun tests for the Etude Params repository

**Type**: RED
**Output**: A failing `tests/etude-params-repository.spec.ts` that, using the task-2 test-DB helper, asserts: (a) `loadOrCreateEtudeParams` for a new user creates exactly one record with the default values (8 measures, 4/4, C major, octave range 4, right hand, `workflowVersion` = 1, `aggregateEpoch` = 1, `setupConfirmed`/`notesConfirmed`/`splitConfirmed` all `false`); (b) a second `loadOrCreateEtudeParams` for the same user creates no second record and returns the same aggregate (idempotent); (c) `loadEtudeParams` is owner-scoped — it never returns another user's aggregate; (d) a direct second insert for the same user is rejected by the database `UNIQUE` constraint on the owner reference, independently of any application check; (e) when an insert races and hits the uniqueness violation, `loadOrCreateEtudeParams` treats the violation as a load of the winner's aggregate rather than an error (simulate the losing-caller path by pre-inserting a row for the user, then calling `loadOrCreateEtudeParams` and asserting it returns the existing row without throwing); (f) a `Promise.all` of two `loadOrCreateEtudeParams` calls for the same new user results in exactly one aggregate and both callers observe the same one; (g) a freshly created aggregate reports no confirmed steps; (h) deleting the `user` row cascades to remove the `etude_params` row.
**Depends on**: 2

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test` with `describe`/`it`/`expect`, `true-myth/result` for Result handling, arrow functions, explicit types, no `any`, kebab-case filenames, look at `tests/db-access-retry.spec.ts` for the `unwrap`/`unwrapErr` helper pattern and import style).

Create `tests/etude-params-repository.spec.ts` importing from `bun:test` and `true-myth/result`, and from the not-yet-existing `src/lib/etude-params-repository.ts`. Use the task-2 `tests/helpers/test-db.ts` helper to obtain a real SQLite database for each test, and insert a `user` row (or two, for the owner-scoping test) before exercising the repository. The tests must reference the repository's exported domain type (`EtudeParams`) and its operations (`loadOrCreateEtudeParams`, `loadEtudeParams`) by name only — do not assert on raw Drizzle column names; assert on the domain object's fields. For the uniqueness-violation-as-load test (e), pre-insert an `etude_params` row for the user directly via the test DB, then call `loadOrCreateEtudeParams` and assert it returns `Result.ok` with the pre-existing aggregate. For the concurrency test (f), use `Promise.all([loadOrCreateEtudeParams(db, userId), loadOrCreateEtudeParams(db, userId)])` and assert both results are `Ok`, both resolve to the same aggregate id, and a subsequent count query finds exactly one row. For the cascade test (h), delete the `user` row directly and assert the `etude_params` row is gone. These tests must fail because the repository module does not exist yet.

---

### 4. Implement the Etude Params repository

**Type**: GREEN
**Output**: `src/lib/etude-params-repository.ts` exports an `EtudeParams` domain interface (encapsulating the physical columns behind typed fields), a `loadOrCreateEtudeParams(db: DrizzleClient, userId: string): Promise<Result<EtudeParams, Error>>` operation that atomically inserts a default aggregate or loads the existing one (catching the `UNIQUE`-constraint violation on the owner reference and converting it to a load of the winner's row, never an error), and a `loadEtudeParams(db: DrizzleClient, userId: string): Promise<Result<EtudeParams | null, Error>>` owner-scoped read. The task-3 tests pass.
**Depends on**: 3

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, `Result`-returning data-access style matching `src/lib/db-access.ts`). Read the `Notes/skills/code-writing/database-access` skill before writing data-access code.

Create `src/lib/etude-params-repository.ts` following the `withRetry`/`toResult` pattern from `src/lib/db-access.ts`: a public arrow function wrapped in `withRetry` delegating to a private `...Actual` arrow function. Define an `EtudeParams` interface that exposes typed domain fields (`id`, `userId`, `measureCount`, `timeSignature`, `keySignature`, `octaveRange`, `hand`, `workflowVersion`, `aggregateEpoch`, `setupConfirmed`, `notesConfirmed`, `splitConfirmed`, `createdAt`, `updatedAt`) — this is the only type routes and tests may depend on; do not export the raw Drizzle row type. `loadOrCreateEtudeParams` must first attempt an insert of a new default row (generate the id with `crypto.randomUUID()`, set the defaults from the PRD, `workflowVersion: 1`, `aggregateEpoch: 1`, all confirmation flags `false`); if the insert throws a uniqueness violation on the owner column, catch it and load the existing row for that user; otherwise return the inserted row mapped to the domain type. `loadEtudeParams` selects the row where `userId` matches and returns `null` when none exists. Both map the Drizzle row to `EtudeParams` through a private mapping function so physical column names never leak. Run the task-3 tests to confirm they pass.

---

### 5. Write failing Bun tests for the canonical route resolver

**Type**: RED
**Output**: A failing `tests/canonical-route.spec.ts` asserting that the canonical-route resolver, given no aggregate (or a sentinel for "absent"), returns `/etude/setup`; given an aggregate whose `setupConfirmed` is `false`, returns `/etude/setup`. Pure-function tests with no database dependency.
**Depends on**: 4

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, arrow functions, explicit types, no `any`, kebab-case filenames).

Create `tests/canonical-route.spec.ts` importing from `bun:test` and from the not-yet-existing `src/lib/canonical-route.ts`. The resolver takes an `EtudeParams | null` (null meaning no aggregate exists) and returns a route path string. Assert: `resolveCanonicalRoute(null)` returns `/etude/setup`; `resolveCanonicalRoute({ ...defaults, setupConfirmed: false })` returns `/etude/setup`. These cover the two rows of the section-5 state table in scope for this issue ("No aggregate" and "Setup not confirmed"). Later issues will extend the resolver for notes/split/review/score states; do not test those here. These tests must fail because the resolver module does not exist yet.

---

### 6. Implement the canonical route resolver

**Type**: GREEN
**Output**: `src/lib/canonical-route.ts` exports a `resolveCanonicalRoute(params: EtudeParams | null): string` pure arrow function mapping aggregate state to a canonical route path, handling the states in scope for issue 4 (no aggregate → `/etude/setup`; `setupConfirmed` false → `/etude/setup`). The task-5 tests pass.
**Depends on**: 5

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, one export per file where practical).

Create `src/lib/canonical-route.ts` importing the `EtudeParams` type from `src/lib/etude-params-repository.ts` and `PATHS` from `src/constants.ts`. Add `ETUDE_SETUP: '/etude/setup' as const` to the `PATHS` object in `src/constants.ts` (do not remove `ETUDE`). Implement `resolveCanonicalRoute` as a pure arrow function: when `params` is `null` (no aggregate) return `PATHS.ETUDE_SETUP`; when `params.setupConfirmed` is `false` return `PATHS.ETUDE_SETUP`. Structure the function so later issues can extend it with the remaining rows of the section-5 state table (notes/split/review/score) without rewriting the early cases — use early returns in dependency order. Run the task-5 tests to confirm they pass.

---

### 7. Write failing e2e test for `GET /etude` resume behavior

**Type**: RED
**Output**: A failing `e2e-tests/etude/resume.spec.ts` asserting that a signed-in student with no aggregate who visits `/etude` is redirected (303) to `/etude/setup` and sees the setup-step banner; and that a returning student (second visit) is redirected to the same canonical route with no second aggregate created (no error, no duplicate). Uses the existing `signInUser` helper and `testWithDatabase` wrapper from `e2e-tests/support`.
**Depends on**: 6

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, Playwright for e2e, kebab-case filenames, `data-testid` attributes named `name-action` for actionable elements, look in `e2e-tests/support` for helpers and `e2e-tests/sign-in` for examples before writing).

Create `e2e-tests/etude/resume.spec.ts` using `testWithDatabase`, `signInUser` from `e2e-tests/support/auth-helpers.ts`, and `BASE_URLS` from `e2e-tests/support/test-data.ts`. Assert: (a) after signing in, `page.goto('/etude')` lands on `/etude/setup` (assert `page.url()` ends with `/etude/setup`) and a setup-step banner with `data-testid='etude-setup-banner'` is visible; (b) navigating to `/etude` a second time lands on `/etude/setup` again with the same banner and no error alert is shown (no duplicate-aggregate failure). These tests must fail because `GET /etude` currently renders the placeholder entry banner instead of redirecting, and `/etude/setup` does not exist yet. Do not modify shared helpers in this task.

---

### 8. Implement `GET /etude` load-or-create-and-redirect and the `/etude/setup` stub

**Type**: GREEN
**Output**: `src/routes/build-etude.tsx` is changed so `GET /etude` loads (or creates) the owner's aggregate via `loadOrCreateEtudeParams`, resolves the canonical route via `resolveCanonicalRoute`, and redirects (303) to it using `redirectWithMessage`/`redirectWithError` from `src/lib/redirects.tsx` (never `c.redirect`). A minimal stub `GET /etude/setup` route renders a placeholder setup-step banner (`data-testid='etude-setup-banner'`) so the redirect lands on a real page; issue 5 will replace this stub with the real setup form. Both routes inherit cross-cutting contract §1 (auth + no-cache via `signedInAccess`, correlation via the existing `correlationIdMiddleware`, owner-scoped via `c.get('user').id`). The task-7 e2e tests pass.
**Depends on**: 7

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, Hono route style matching existing routes, `data-testid` naming, DaisyUI components, one export per file where practical, `redirectWithMessage`/`redirectWithError` from `src/lib/redirects.tsx` never `c.redirect`). Read `Notes/skills/code-writing/web-behavior` and `Notes/skills/code-writing/styling-html-and-tsx` before writing route/JSX code.

Modify `src/routes/build-etude.tsx`: change the `GET /etude` handler so it reads the authenticated user via `c.get('user')` and the database via `c.get('db')`, calls `loadOrCreateEtudeParams(db, user.id)`, handles a `Result.err` by delegating to `handleUnexpectedError` (from `src/routes/build-safe-error.tsx`, Issue 2) so an unexpected DB failure shows the safe error page with a correlation id rather than a 500, and on `Result.ok` calls `resolveCanonicalRoute(params)` and returns a 303 redirect to that route via `redirectWithMessage` (or `redirectWithError`). Add a new `GET /etude/setup` stub route in the same file (or a new `src/routes/build-etude-setup.tsx` if one-export-per-file is preferred) that renders a placeholder card with `data-testid='etude-setup-banner'` and text indicating the setup step will appear here, wrapped in `useLayout`. Register both routes with `secureHeaders(STANDARD_SECURE_HEADERS)` and `signedInAccess`. The `signedInAccess` middleware already supplies no-cache headers and the auth redirect; the `correlationIdMiddleware` (already wired first in `src/index.ts`) supplies the `X-Correlation-ID` header. Do not implement the real setup form, validation, or any POST handler — that is issue 5. Run the task-7 e2e tests to confirm they pass.

---

### 9. Encapsulation sweep and full-suite verification

**Type**: REFACTOR
**Output**: No route or test file imports the raw Drizzle `etude_params` row type or references physical column names directly; all access flows through the `EtudeParams` domain interface and the repository. `tsc --noEmit` reports zero errors in any file created or modified for this issue. The full Bun unit suite and the Playwright e2e suite pass.
**Depends on**: 8

Read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md`. Search `src/routes/`, `src/lib/`, and `tests/` for any direct dependency on the `etude_params` physical schema (raw column names, the `etudeParam` Drizzle row type, or `db.select`/`db.insert` against `etudeParams` outside `src/lib/etude-params-repository.ts`). Move any such access behind the repository interface. Run `tsc --noEmit`, the full `bun test` suite, and `npx playwright test` and confirm they are green. Do not modify the parent issue, the parent PRD, or prior task/issue/walkthrough files in `Notes/`.

---

### 10. Document the aggregate, repository, canonical routing, and resume behavior

**Type**: DOCUMENT
**Output**: Wiki and Notes updates describing the `etude_params` table (columns, owner `UNIQUE` + cascade, default aggregate), the `src/lib/etude-params-repository.ts` repository (`loadOrCreateEtudeParams` atomic insert-or-load with uniqueness-violation-as-load, `loadEtudeParams` owner-scoped read, `EtudeParams` domain encapsulation), the `src/lib/canonical-route.ts` resolver, the `GET /etude` load-or-create-and-redirect behavior, and the `/etude/setup` stub. Follow `Notes/wiki/wiki-rules.md` and `Notes/wiki/AGENTS.md` for wiki ingestion.
**Depends on**: 9

Update the relevant wiki pages: `Notes/wiki/source-code.md` (add `src/lib/etude-params-repository.ts`, `src/lib/canonical-route.ts`, the `etude_params` schema entry, and the changed `src/routes/build-etude.tsx`; note the `PATHS.ETUDE_SETUP` constant), `Notes/wiki/e2e-tests.md` (catalog `e2e-tests/etude/resume.spec.ts`), `Notes/wiki/project-overview.md` (describe the one-aggregate-per-student model, the default settings, and the resume-on-return behavior), and `Notes/wiki/index.md` if new sections are added. Append a `## [YYYY-MM-DD] ingest | issue-004 etude params aggregate` entry to `Notes/wiki/log.md`. Do not modify the parent issue or the parent PRD.

---

### 11. Code walkthrough

**Type**: CODE WALKTHROUGH
**Output**: `Notes/walkthroughs/issue-004-etude-params-aggregate-defaults-resume/code-walkthrough/` containing the files generated by `uvx showboat` for this implementation.
**Depends on**: 10

Run `uvx showboat --help` for current usage, then generate a walkthrough of the issue-004 implementation into a new directory `Notes/walkthroughs/issue-004-etude-params-aggregate-defaults-resume/code-walkthrough/`. Place all generated files there.

---

### 12. Human review against the PRD and cross-cutting contract

**Type**: REVIEW
**Output**: A human verifies the implementation against the PRD's "Data and concurrency" decisions and cross-cutting contract §4 (workflow version + aggregate epoch), §5 (canonical state-to-route mapping), and §7 (correlation/logging propagation), confirming every acceptance criterion in the parent issue is met.
**Depends on**: 11

This is a human-in-the-loop step. The human must verify: a signed-in student with no aggregate visiting `/etude` gets one aggregate with the default settings (8 measures, 4/4, C major, octave range 4, right hand) and is redirected to `/etude/setup`; a returning student gets no second aggregate and resumes the saved state; two students cannot read or affect each other's aggregates; deleting a user row cascades to remove the `etude_params` row; a direct second insert for a user who already has one is rejected by the database `UNIQUE` constraint independently of any application check; two concurrent load-or-create calls for the same new user result in exactly one aggregate with both callers observing it, the losing caller handling the violation as a load; a freshly created aggregate carries a `workflowVersion` and `aggregateEpoch`, has no confirmed steps, and the canonical route is `/etude/setup` with defaults pre-populated but not pre-confirmed; and physical columns are encapsulated behind the repository interface. Record the result in the review notes. Do not modify the parent issue or the parent PRD.

---
