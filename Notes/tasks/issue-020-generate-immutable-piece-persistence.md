# Tasks for #20: Generate an immutable Piece, persist it, and redirect to a stable score

Parent issue: #20
Parent PRD: `Notes/PRD-etude-generator.md`

## Tasks

### 1. Add the two companion D1 tables (current-Piece record + operation record) to the schema and generate the migration

**Type**: MIGRATE
**Output**: `src/db/schema.ts` defines two new user-owned, one-to-one, cascade-delete tables encapsulated behind the Etude Repository — a current-Piece record for immutable Piece JSON and render metadata, and an operation record for locks, cooldowns, and PDF grants; a new drizzle migration file exists under `drizzle/`; `schema.sql` is regenerated via `build-schema-update.sh`; existing `bun test` repository tests still pass.
**Depends on**: none

Add two new tables to `src/db/schema.ts`, each with a UNIQUE `userId` column referencing `user.id` with `onDelete: 'cascade'` (matching the existing `etude_params` pattern). The current-Piece record holds the immutable Piece JSON and render metadata fields (the render metadata columns may be nullable/unused in this slice — Issue 30 populates them; only the Piece JSON and identity fields are written here). The operation record holds the lock, cooldown, and PDF-grant columns described in the PRD's "Data and concurrency" section; none of its columns are written in this slice, but the table is created now to avoid a second migration. Physical column names stay encapsulated behind the repository interface — export only the Drizzle table definitions and `$inferSelect`/`$inferInsert` types, not a stable application contract. Run `npx drizzle-kit generate` to produce the migration, then `./build-schema-update.sh` to regenerate `schema.sql`. Add the new tables to the `schema` export object. Do not add any repository behavior in this task — that is task 8.

---

### 2. Add `ETUDE_GENERATION_RELEASED` var to wrangler and bindings

**Type**: CONFIG
**Output**: `wrangler.jsonc` `vars` block includes `ETUDE_GENERATION_RELEASED`; `src/local-types.ts` `Bindings` interface includes `ETUDE_GENERATION_RELEASED?: string`; `npm run cf-typegen` succeeds.
**Depends on**: none

This is a configuration-only change. Add `ETUDE_GENERATION_RELEASED` to the `vars` block in `wrangler.jsonc` with an empty default (the resolved on/off value is computed by the config validator in task 4, not pinned in wrangler). Extend the `Bindings` interface in `src/local-types.ts` with `ETUDE_GENERATION_RELEASED?: string`. Run `npm run cf-typegen` to confirm the generated `worker-configuration.d.ts` agrees with the manual types. Do not add any runtime behavior in this task. The flag is a deployability gate only — it is never client-controllable and is removed once Issue 40 lands.

---

### 3. Config-validator tests for the generation-released flag

**Type**: RED
**Output**: `tests/config-validator.spec.ts` extended with failing assertions: an absent `ETUDE_GENERATION_RELEASED` resolves to "not released"; a value other than `"true"` (e.g. `"false"`, empty, garbage) resolves to "not released"; the value `"true"` resolves to released; the resolved flag is exposed on the `ConfigValidationResult` payload; no defect or payload entry leaks a secret value.
**Depends on**: 2

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, arrow functions, types, braces around all `if`/`while` bodies, kebab-case test filenames, `bun:test`).

Extend `tests/config-validator.spec.ts` with new `bun:test` cases for the generation-released flag. The validator already exists, so these tests fail until task 4 adds the flag resolution. Use the same fake-bindings style the existing cases use. Assert the public result shape carries a resolved `generationReleased: boolean` (or equivalently named) field. Assert that only the literal `"true"` resolves to released; every other value (absent, empty, `"false"`, `"yes"`, garbage) resolves to not-released without producing a defect (the flag is a deployability gate, not a required-config value — its absence is a valid "not released" state, not a health defect). Assert no secret value appears in any payload text.

---

### 4. Config-validator implementation for the generation-released flag

**Type**: GREEN
**Output**: `src/lib/config-validator.ts` resolves `ETUDE_GENERATION_RELEASED` and exposes the resolved boolean on `ConfigValidationResult`; task-3 tests pass.
**Depends on**: 3

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, early returns, `readonly` for immutable result fields).

Extend `validateEtudeConfig` and `ConfigValidationResult` to resolve `ETUDE_GENERATION_RELEASED`: the flag is released exactly when the value is the literal string `"true"`; every other value (absent, empty, `"false"`, garbage) resolves to not-released. The flag is not a required-config value, so its absence never produces a defect — it is a valid "not released" state. Expose the resolved boolean on the result payload. Do not add health-route or route-registration behavior here — that is task 18. Follow the existing `src/lib/config-validator.ts` style.

---

### 5. Piece contract types + Piece Generator unit tests

**Type**: RED
**Output**: `tests/piece-generator.spec.ts` containing failing assertions that: the generated Piece has the requested measure count; every measure's durations sum exactly to the meter's measure length (use eighth-note-unit arithmetic like the rhythm catalog, never floating-point tolerance); every pitch is from the hand's selected set; correct hand ranges (right-hand pitches from the right set, left-hand from the left set); the unused hand's note array is empty in every measure for a one-hand configuration; the complete Piece JSON round-trips through `JSON.parse(JSON.stringify(piece))` losslessly; the generator does not mutate its input settings; the Piece carries a server-generated `pieceId` UUID; the Piece's `sourceParameterVersion` equals the supplied workflow version; the generator performs no DB/HTTP/SVG/UI work (it accepts an injectable random source and returns a Piece or a typed invariant failure).
**Depends on**: 1

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, arrow functions, types, braces around all `if`/`while` bodies, kebab-case test filenames, `bun:test`).

Write `tests/piece-generator.spec.ts` using `bun:test`. The generator does not exist yet, so these tests must fail. Define the Piece contract types inline in the test (or import from a not-yet-created module) so the test pins the shape: key, time signature, hand/staff assignment, `sourceParameterVersion`, `pieceId`, and an ordered array of measures whose right- and left-hand arrays hold duration-plus-pitch-or-rest events. In this minimal slice every event is a pitched event (rests arrive in Issue 23), but the event shape must accommodate a rest marker so later issues do not re-litigate the contract. Use a deterministic fake random source (a seeded sequence or a stub that returns fixed indices) so the tests are reproducible. Reference `tests/rhythm-catalog.spec.ts` for the eighth-unit arithmetic style and `tests/music-domain.spec.ts` for the available-pitch derivation the generator consumes. Assert the generator accepts validated settings only (validated pitches, durations, meter, measure count, hand assignment) and an injectable random source — never raw form input.

---

### 6. Piece Generator implementation (minimal)

**Type**: GREEN
**Output**: `src/lib/piece-generator.ts` accepts validated immutable generation settings and an injectable random-number source; returns a complete Piece or a typed invariant failure; performs no DB, HTTP, SVG, or UI work; task-5 tests pass.
**Depends on**: 5

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, early returns, `readonly` for immutable fields, `Result` from `true-myth` for typed failures).

Implement the minimal Piece Generator described in the issue: measure count from settings; meter-correct rhythms drawn from eligible catalog patterns (use `computeEligibleRhythms` from `src/lib/rhythm-catalog.ts` with the selected duration tokens); uniformly chosen pitches from the hand's selected set (one pitch per rhythm position, no interval weighting, no rests, no repeats, no two-hand coordination — those arrive in Issues 22–25). For a one-hand configuration the unused hand's array is empty in every measure. The Piece is immutable, JSON-serializable, and self-contained: key, time signature, hand/staff assignment, `sourceParameterVersion`, a server-generated `pieceId` UUID (`crypto.randomUUID()`), and an ordered array of measures. The generator accepts an injectable random source so tests are deterministic; production uses a non-seeded random source. No random seed is persisted or returned. Return a typed invariant failure (e.g. no eligible rhythms for the selected durations) rather than throwing. Follow the existing `src/lib/` module style (see `src/lib/music-domain.ts`, `src/lib/rhythm-catalog.ts`).

---

### 7. Etude Repository Piece-record + operation-record tests

**Type**: RED
**Output**: `tests/etude-piece-repository.spec.ts` (and/or an extension of `tests/etude-params-repository.spec.ts`) containing failing assertions that: one current-Piece record per user is enforced; persisting a new Piece replaces the prior one (replacement semantics — only one current Piece per owner after replacement); owner-scoped reads never return another user's Piece; cascade deletion removes the Piece record when the user row is deleted; an epoch-conditional commit rejects a stale epoch, leaving the prior committed aggregate and any prior Piece unchanged; the operation record is created one-per-user with cascade deletion.
**Depends on**: 1

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, arrow functions, types, braces around all `if`/`while` bodies, kebab-case test filenames, `bun:test`).

Write repository tests using `createTestDb` from `tests/helpers/test-db.ts` so uniqueness constraints, cascade deletion, and the epoch-conditional commit exercise a real in-memory SQLite database with the production schema. The repository functions do not exist yet, so these tests fail. Assert the public repository interface only — never read physical column names directly in assertions (the contract test in task 9 covers the no-regenerable-field invariant at the schema level). Reference `tests/etude-params-repository.spec.ts` for the insert-user, unwrap-result, and count-rows helpers and the overall style. Cover replacement semantics by persisting two Pieces in sequence for the same owner and asserting only one current Piece remains and it is the second. Cover owner scoping by persisting a Piece for one user and asserting a load for another user returns null. Cover the epoch-conditional commit by capturing an epoch, bumping it (simulating Start Over), and asserting the commit updates zero rows and the prior Piece is unchanged.

---

### 8. Etude Repository Piece-record + operation-record implementation

**Type**: GREEN
**Output**: The Etude Repository (in `src/lib/etude-params-repository.ts` or a new companion repository module under `src/lib/`) implements persist/replace/load of the current-Piece record and creates the operation record row, all encapsulated behind the repository interface with epoch-conditional commits; task-7 tests pass.
**Depends on**: 7

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, early returns, `Result` from `true-myth`, `withRetry` for transient DB errors, no `withRetry` for deterministic CAS conflicts).

Implement the repository operations for the current-Piece record: an owner-scoped load returning the stored Piece (or null), and an epoch-conditional persist/replace that verifies `userId` and `aggregateEpoch === expectedEpoch` at commit (cross-cutting contract section 4). Replacement semantics: persisting a new Piece replaces the prior current Piece for that owner — implement via upsert on the UNIQUE `userId` or delete-then-insert within the conditional write. Use the same `EtudeUpdateError` conflict taxonomy (`version-mismatch`, `epoch-mismatch`, `db-error`) as the existing `updateEtudeSetup` so the workflow service can disambiguate. Create the operation record row one-per-user (with cascade deletion) but do not write any lock/cooldown/grant columns in this slice — later issues populate them. Map raw Drizzle rows to a domain `PieceRecord` interface so physical column names never leak. Follow the existing `src/lib/etude-params-repository.ts` style (CAS `where` clause, re-load to disambiguate conflict kind, `mapToDomain`).

---

### 9. Schema-level contract test: persisted Piece record exposes no seed/RNG/regenerable field

**Type**: RED
**Output**: `tests/etude-piece-contract.spec.ts` containing a failing assertion that the persisted Piece record — read through the repository's stable interface and the migration's declared shape (`schema.sql`) — exposes no seed, no RNG state, and no field from which the music could be regenerated. The assertion is expressed against the repository's stable interface and the migration's declared shape, never against physical column names, so route tests never couple to columns.
**Depends on**: 8

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, kebab-case test filenames).

Write a contract test that persists a Piece through the repository, loads it back, and asserts the loaded record's stable interface exposes only immutable Piece JSON and render-metadata fields — no seed, no RNG state, no random-source identifier, and no field from which the music could be regenerated. Separately, parse `schema.sql` and assert the current-Piece table's declared columns contain no seed/RNG/random column names (e.g. no column whose name matches `seed`, `rng`, `random`, `state`). The test must not reference physical column names of the Piece table directly in its assertions about the repository interface — it asserts against the domain `PieceRecord` type and the migration shape. This test may pass immediately if task 8 already satisfies it; if so, treat task 10 as a no-op verification.

---

### 10. Satisfy the Piece-record contract test

**Type**: GREEN
**Output**: If task 8 already satisfies task 9, record that no further code is needed beyond the test as a guardrail; otherwise adjust the repository interface and/or migration so the persisted Piece record carries only immutable Piece JSON and render-metadata fields and nothing regenerable; task-9 tests pass.
**Depends on**: 9

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md`.

If task 9 already passes, record that no implementation is needed beyond the test as a permanent guardrail. If the contract test finds a regenerable field, remove or rename it so the persisted Piece record carries only immutable Piece JSON and render metadata — the stored Piece is the only authority for its content (PRD "Piece model and generation": no random seed is persisted or used to reconstruct it). Keep the test in place as the permanent guardrail.

---

### 11. Workflow service generate-operation tests

**Type**: RED
**Output**: `tests/workflow-service.spec.ts` extended with failing assertions covering each row of the issue's failure-redirect table: success creates and persists a Piece and returns a score-bound success state; review predicate false (a step unconfirmed) returns the earliest incomplete step; stored values no longer validate returns the earliest step whose values are invalid (treated as unconfirmed); typed generator invariant failure returns a review-bound failure with a generic safe message and correlation identifier, no Piece created; D1 persistence failure returns a review-bound failure with a generic retry message, prior committed aggregate and any prior Piece unchanged; stale aggregate epoch at commit returns a canonical-route result with nothing published.
**Depends on**: 6, 8

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, arrow functions, types, braces around all `if`/`while` bodies, kebab-case test filenames, `bun:test`).

Extend `tests/workflow-service.spec.ts` with cases for the generate operation. The operation does not exist yet, so these tests fail. Use `createTestDb` and the repository functions from task 8, plus the generator from task 6 with a deterministic fake random source. Assert route-neutral success/failure states — the workflow service returns success states or typed actionable failures, not HTTP responses (the route maps those to redirects in task 16). Cover the precondition checks (workflow version as precondition, not incremented; aggregate epoch verified at acquisition and again at commit — cross-cutting contract section 3). Cover the review-predicate precondition (`isReviewReachable` from the existing workflow service) and stored-value validation (`computeCanonicalRoute` already layers this). Inject a failing generator (returning a typed invariant failure) and a failing repository (e.g. by bumping the epoch between acquisition and commit, or by using the test-only DB-failure harness) to exercise the invariant-failure and persistence-failure rows. Assert no Piece is created on any failure row and the prior committed aggregate is unchanged.

---

### 12. Workflow service generate-operation implementation

**Type**: GREEN
**Output**: `src/lib/workflow-service.ts` exposes the generate operation composing the precondition check, review-predicate check, stored-value validation, generator call, and epoch-conditional Piece persistence; returns route-neutral success states or typed actionable failures; task-11 tests pass.
**Depends on**: 11

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, early returns, `Result` from `true-myth`, pure functions where possible).

Implement the generate operation as the only caller that composes repository and generator operations (PRD "Workflow Service": it is the only caller that composes repository, generator, renderer, and artifact-store operations). The operation: loads the owner's aggregate; checks the operation-POST precondition (reuse `checkOperationPrecondition`); checks the derived review predicate (reuse `isReviewReachable`); re-validates stored values (reuse `computeCanonicalRoute` — if it returns a step earlier than review, the stored values are invalid and the result routes there); calls the Piece Generator with validated settings and a non-seeded random source, passing the current `workflowVersion` as `sourceParameterVersion`; persists the Piece through the repository with an epoch-conditional commit; returns a score-bound success or a typed failure carrying the canonical redirect target and a safe message. Do not acquire a lock or enforce a cooldown in this slice — those are Issues 33–34. Do not perform HTTP, SVG, or UI work. Follow the existing `src/lib/workflow-service.ts` style.

---

### 13. Canonical-route extension tests (current Piece → `/etude/score`)

**Type**: RED
**Output**: `tests/canonical-route.spec.ts` extended with failing assertions: a current non-stale Piece resolves to `/etude/score`; no current Piece resolves to `/etude/review` (or the earliest incomplete step when prerequisites are unmet); a stale Piece (whose `sourceParameterVersion` is older than `workflowVersion`) resolves to the earliest incomplete step, else `/etude/review` (score and PDF controls hidden — cross-cutting contract section 5 stale-Piece row).
**Depends on**: 8

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, arrow functions, types, braces around all `if`/`while` bodies, kebab-case test filenames, `bun:test`).

Extend `tests/canonical-route.spec.ts` with cases for the score rows of cross-cutting contract section 5. The resolver does not yet consult a current Piece, so these tests fail. Use a fake aggregate snapshot plus a fake current-Piece indicator (the resolver will be extended to accept the Piece record's presence and staleness). Cover the rows: current Piece, not stale → `/etude/score`; current Piece whose `sourceParameterVersion` is older than `workflowVersion` (stale) → earliest incomplete step, else `/etude/review`; no current Piece with all steps confirmed → `/etude/review`. Do not couple the tests to physical Piece-table columns — assert against the domain `PieceRecord` interface.

---

### 14. Canonical-route extension implementation

**Type**: GREEN
**Output**: `src/lib/canonical-route.ts` and/or `src/lib/workflow-service.ts` extended with the current-Piece score rows of cross-cutting contract section 5; task-13 tests pass.
**Depends on**: 13

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, early returns, pure functions).

Extend `computeCanonicalRoute` (and `resolveCanonicalRoute` if needed) to consult a current Piece: when all applicable steps are confirmed and a current non-stale Piece exists, the canonical route is `/etude/score`; when a current Piece exists but its `sourceParameterVersion` is older than `workflowVersion` (stale), the canonical route is the earliest incomplete step, else `/etude/review` (the score and PDF controls are hidden — Issue 32 owns supersession cleanup, this slice only routes). The resolver remains pure: it reads the aggregate snapshot and the Piece record's presence/staleness, never mutates, never throws, never touches the DB. Add `PATHS.ETUDE_SCORE` to `src/constants.ts`. Follow the existing `src/lib/canonical-route.ts` style.

---

### 15. `POST /etude/generate` route Playwright tests

**Type**: RED
**Output**: `e2e-tests/etude/27-etude-generate.spec.ts` containing failing tests covering each row of the issue's failure-redirect table: success → 303 to `/etude/score`; stale/missing/tampered workflow version → 303 to the canonical route with a safe error, no Piece created; prerequisites not satisfied (review predicate false) → 303 to the earliest incomplete step with a safe message, no Piece created; stored values no longer validate → 303 to the earliest step whose values are invalid; typed generator invariant failure → 303 to `/etude/review` with the generic safe message and correlation identifier, no Piece created; D1 persistence failure → 303 to `/etude/review` with the generic retry message and correlation identifier, prior committed aggregate and any prior Piece unchanged; stale aggregate epoch at commit → the commit is rejected, nothing is published, 303 to the canonical route for the current state.
**Depends on**: 12, 14

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, Playwright for e2e, kebab-case filenames, `data-testid` attributes named `name-action` for actionable elements). Look in `e2e-tests/support` and `e2e-tests/sign-in` for helpers and examples before writing.

Write Playwright tests following the pattern of `e2e-tests/etude/26-etude-generate-stub.spec.ts` (which this slice replaces). Use `testWithDatabase`, `signInUser`, the `postGenerateViaBrowser` helper style, and the test-only aggregate-state inspection route to assert no-state-change invariants. Complete a two-hand workflow to the review step before each generate submission (reuse the `completeTwoHandWorkflow` helper pattern). For the generator-invariant-failure row, use the test-only forced-error harness to make the generator return a typed invariant failure. For the D1-persistence-failure row, use the test-only DB-failure harness. For the stale-epoch row, bump the epoch via the test-only downstream-state route between the precondition check and the commit. Assert every user-facing message is safe (no internal identifiers — reuse the `expectSafeMessage` pattern). Assert the success row redirects to `/etude/score` and that a Piece was created (via the aggregate-state inspection route or the score page content).

---

### 16. `POST /etude/generate` route implementation

**Type**: GREEN
**Output**: `src/routes/build-etude-generate.tsx` replaces the Issue 19 stub: it calls the workflow-service generate operation and redirects per the failure-redirect table using `redirectWithError`/`redirectWithMessage` (never `c.redirect`); task-15 tests pass.
**Depends on**: 15

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, Hono route style matching existing routes, `redirectWithError`/`redirectWithMessage` from `src/lib/redirects.tsx`, `data-testid` naming).

Replace the stub body of `buildEtudeGenerate` with a call to the workflow-service generate operation. Map each typed failure to the corresponding row of the failure-redirect table: stale/missing/tampered version or epoch mismatch → 303 to the canonical route with a safe error; review predicate false → 303 to the earliest incomplete step with a safe message; stored values invalid → 303 to the earliest invalid step; generator invariant failure → 303 to `/etude/review` with the generic safe message and correlation identifier; D1 persistence failure → 303 to `/etude/review` with the generic retry message and correlation identifier; stale epoch at commit → 303 to the canonical route. Success → 303 to `/etude/score`. Use the correlation identifier from `c.get('correlationId')` in the safe messages for the invariant-failure and persistence-failure rows. Log typed refusals via `refusal-logger.ts` with no PII. Do not acquire a lock or enforce a cooldown. Inherit cross-cutting contract section 1 (auth + no-cache via `signedInAccess`, owner-scoped via `c.get('user')`).

---

### 17. `GET /etude/score` route + capability-flag gating Playwright tests

**Type**: RED
**Output**: `e2e-tests/etude/28-etude-score.spec.ts` containing failing tests: after a successful generate, `GET /etude/score` renders a plain listing of the stored Piece's content (key, time signature, hand selection, and a measure-by-measure listing — Issue 21 owns structured presentation); refreshing the score page several times shows the same stored Piece and generates no new music; a request from another user never returns this Piece (owner-scoped); no current Piece → redirect to the earliest incomplete canonical step with a safe message; the generation capability flag off → both `POST /etude/generate` and `GET /etude/score` behave as unknown routes (not reachable by a student).
**Depends on**: 16

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, Playwright for e2e, kebab-case filenames, `data-testid` attributes named `name-action` for actionable elements). Look in `e2e-tests/support` and `e2e-tests/sign-in` for helpers and examples before writing.

Write Playwright tests for the score route. Generate a Piece first (via the now-real generate route), then navigate to `/etude/score` and assert a plain listing of the stored content is rendered with stable `data-testid` attributes. Refresh the page several times and assert the rendered content is identical (no new music). For owner scoping, sign in as a second user and assert their score page does not show the first user's Piece. For the no-current-Piece row, clear the workflow (or use a fresh user) and assert `/etude/score` redirects to the earliest incomplete step with a safe message. For the capability-flag-off row, run the server with `ETUDE_GENERATION_RELEASED` unset (or not `"true"`) and assert both `POST /etude/generate` and `GET /etude/score` behave as unknown routes — use the existing dev-server-mode harness pattern to start the server with the flag off. Assert every user-facing message is safe.

---

### 18. `GET /etude/score` route implementation + capability-flag gating of both routes

**Type**: GREEN
**Output**: `src/routes/build-etude-score.tsx` renders a plain listing of the stored Piece; both the generate and score routes are registered only when the generation capability flag is resolved on, otherwise they behave as unknown routes; task-17 tests pass.
**Depends on**: 17

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, Hono route style matching existing routes, `redirectWithError`/`redirectWithMessage` from `src/lib/redirects.tsx`, `data-testid` naming, `useLayout` for rendering).

Implement `buildEtudeScore` as a GET route for `/etude/score` (add `PATHS.ETUDE_SCORE` to `src/constants.ts` if not already added in task 14). It loads the owner's aggregate and current Piece; if no current Piece exists, redirects to the earliest incomplete canonical step with a safe message; if the Piece is stale, redirects to the canonical route for the current state; otherwise renders a plain listing of the stored Piece's content (key, time signature, hand selection, and a measure-by-measure listing of each hand's events — Issue 21 owns the structured-text and SVG presentation, so this slice renders a simple readable listing only). Gate both `buildEtudeGenerate` and `buildEtudeScore` registration in `src/index.ts` on the resolved generation-released flag from the config validator: when the flag is off, neither route is registered, so they behave as unknown routes (the 404 handler answers). Inherit cross-cutting contract section 1 (auth + no-cache via `signedInAccess`, owner-scoped via `c.get('user')`). Follow the existing `src/routes/build-etude-review.tsx` style for reachability checks and rendering.

---

### 19. Update wiki and docs

**Type**: DOCUMENT
**Output**: `Notes/wiki/source-code.md`, `Notes/wiki/unit-tests.md`, `Notes/wiki/e2e-tests.md`, and `Notes/wiki/index.md` updated with the new modules (`piece-generator.ts`, the repository extensions, `build-etude-score.tsx`) and new tests; `Notes/wiki/log.md` appended with an ingest entry. See `Notes/wiki/wiki-rules.md` and `Notes/wiki/AGENTS.md` for conventions.
**Depends on**: 18

Read and follow `Notes/wiki/AGENTS.md` (the wiki schema) and `Notes/wiki/wiki-rules.md`. Ingest the new source files and tests created by this issue: update `source-code.md` with summaries of the Piece Generator, the repository Piece-record/operation-record extensions, the config-validator flag, the canonical-route extension, the workflow-service generate operation, and the `build-etude-score.tsx` route; update `unit-tests.md` with the new `bun:test` files; update `e2e-tests.md` with the new Playwright files; update `index.md` if new pages or major sections are added; append an entry to `log.md` with format `## [YYYY-MM-DD] ingest | issue-020`. Do not index anything under `node_modules`.

---

### 20. Code walkthrough

**Type**: CODE WALKTHROUGH
**Output**: A new directory under `Notes/walkthroughs/issue-020/code-walkthrough` containing the showboat-generated walkthrough files.
**Depends on**: 19

Run `uvx showboat --help` for usage details. Create a new directory `Notes/walkthroughs/issue-020/code-walkthrough` and generate the walkthrough of the Issue 20 implementation there. The walkthrough should cover the Piece contract, the minimal generator, the repository Piece-record/operation-record persistence, the workflow-service generate operation, the canonical-route score rows, and the two routes (generate + score) including the capability-flag gating.

---

### 21. Human review

**Type**: REVIEW
**Output**: A human reviews the completed slice against the issue's acceptance criteria and the cross-cutting contract before merge.
**Depends on**: 20

A human reviews the completed slice against every acceptance criterion in the issue (approved configuration → new Piece created and persisted; every measure's durations sum exactly to the meter; one-hand unused hand array empty; refresh shows the same stored Piece; persisted Piece record contains no seed/RNG state; another user's score never returns this Piece; `pieceId` UUID and `sourceParameterVersion` equal to the workflow version; each failure-redirect row behaves as stated with no Piece created and prior aggregate unchanged; capability flag off → routes not reachable). Confirm the cross-cutting contract sections 1, 3, and 5 are satisfied and tested. Confirm no lock or cooldown logic was added in this slice (those are Issues 33–34). Confirm the operation record table exists but is unused. Confirm the capability flag is environment-driven, server-side, and never client-controllable.

---
