# Tasks for #12: Rhythm catalog packaging, health validation, and eligible-rhythm calculation

Parent issue: #12
Parent PRD: `Notes/PRD-etude-generator.md`

## Tasks

### 1. Rhythm catalog parser/validator tests

**Type**: RED
**Output**: `tests/rhythm-catalog.spec.ts` that fails because `src/lib/rhythm-catalog.ts` does not exist yet. The tests assert the exact token durations in quarter-note beats (`W` = 4, `H` = 2, `D` = 3, `Q` = 1, `R` = 1.5, `E` = 0.5) and the exact measure lengths per supported heading (2/4 = 2, 3/4 = 3, 4/4 = 4 quarter-note beats); that length validation uses exact integer or rational arithmetic (a pattern built only from eighths and dotted quarters is accepted at the measure length and rejected one eighth short or long, with no floating-point tolerance); that an unknown token, a missing heading, an unsupported heading, and a malformed heading each fail validation with a message naming the offending meter and line; that every supported meter has at least one pattern; that two identical patterns under the same heading pass validation and the parsed catalog contains that pattern exactly once; and that the real `Notes/all-rhythms.txt` (read from disk in the test via `node:fs`) validates with all three supported meters present and every pattern's token durations sum exactly to its heading's measure length.
**Depends on**: none

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test` with `describe`/`it`/`expect`, arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, kebab-case test filenames). Read `Notes/skills/code-writing/typescript-rules` for the TypeScript conventions. Look at `tests/music-domain.spec.ts` and `tests/key-domain.spec.ts` for the existing `bun:test` style in this repo (the `unwrap`/`unwrapErr` helpers, the `Result` import from `true-myth/result`, the header comment block).

Create `tests/rhythm-catalog.spec.ts` importing from `bun:test` and from the not-yet-existing `src/lib/rhythm-catalog.ts`. Cover: (a) the exported token-duration table maps each of `W`,`H`,`D`,`Q`,`R`,`E` to the exact quarter-note-beat values above; (b) the exported measure-length table maps `2/4`,`3/4`,`4/4` to 2, 3, and 4 quarter-note beats; (c) a valid catalog with one pattern per supported meter parses to an Ok catalog whose patterns' durations sum exactly to each heading's measure length; (d) a pattern built only from eighths (`E`) and dotted quarters (`R`) — e.g. `ER` under 2/4 — validates exactly at the measure length, and the same pattern with one eighth added or removed is rejected, with the assertion using exact comparison (no `toBeCloseTo` or other float tolerance); (e) an unknown token (e.g. `X`) under a supported heading fails with a defect naming the meter and line; (f) a missing heading (a supported meter with no patterns) fails naming the meter; (g) an unsupported heading (e.g. `5/4`) fails with a defect naming the heading; (h) a malformed heading (e.g. a line that is not a valid meter token and not a pattern) fails naming the line; (i) two identical patterns under the same heading pass validation and the parsed catalog contains that distinct pattern exactly once; (j) reading the real `Notes/all-rhythms.txt` from disk via `node:fs` and parsing it succeeds, every supported meter is present with at least one pattern, and every pattern's token durations sum exactly to its heading's measure length. Use exact arithmetic in the assertions — count in eighth-note units or compare rational numerator/denominator pairs, never accumulated floating-point sums with a tolerance. These tests must fail because the module does not exist yet.

---

### 2. Rhythm catalog parser/validator implementation

**Type**: GREEN
**Output**: `src/lib/rhythm-catalog.ts` exports the token-duration table, the measure-length table, the supported token and supported heading sets, the `RhythmCatalog` and `CatalogDefect` types, and a pure `parseRhythmCatalog(text: string): Result<RhythmCatalog, readonly CatalogDefect[]>` (or equivalent `Result` shape matching the tests) that validates syntax, supported tokens only, supported headings only, exact measure length for every pattern under its heading, at least one pattern per supported meter, and de-duplicates identical patterns under the same heading so each distinct pattern appears exactly once. The task-1 tests pass.
**Depends on**: 1

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, one export per file where practical, `readonly` for immutable result fields). Read `Notes/skills/code-writing/typescript-rules` for the TypeScript conventions. Look at `src/lib/music-domain.ts` and `src/lib/key-domain.ts` for the existing pure-domain-module style in this repo (the Mozilla header comment, the `@module` doc, the `Result` from `true-myth/result`, the typed failure interfaces).

Create `src/lib/rhythm-catalog.ts`. Define the token-duration table as a `readonly Record<string, number>` mapping `W`→4, `H`→2, `D`→3, `Q`→1, `R`→1.5, `E`→0.5 quarter-note beats, and the measure-length table mapping `2/4`→2, `3/4`→3, `4/4`→4. Implement length validation with exact arithmetic — count in eighth-note units (multiply each quarter-note-beat duration by 2 so `W`=8, `H`=4, `D`=6, `Q`=2, `R`=3, `E`=1 eighths, and measures become 4, 6, 8 eighths respectively) and compare integers, never accumulated floating-point sums with a tolerance. Parse the catalog text line by line: a heading line is a supported meter token (`2/4`, `3/4`, `4/4`); each subsequent non-empty line under a heading is a pattern token sequence over the supported tokens. Collect every defect in one pass and report them together; each defect names the offending meter and the 1-based line number. De-duplicate identical patterns under the same heading so each distinct pattern appears exactly once in the parsed catalog (duplicates are deliberately allowed in the curated file and must not break the build or skew Issue 24's recency-weighted selection). The function must be pure — it does not touch the file system, the database, or global state. Run the task-1 tests to confirm they pass.

---

### 3. Eligible-rhythms tests

**Type**: RED
**Output**: `tests/rhythm-catalog-eligible.spec.ts` that fails because `computeEligibleRhythms` does not exist yet. The tests assert that, given a parsed catalog, a meter, and a set of selected duration tokens, only patterns whose every token is in the selected set are returned; that a selection with no qualifying pattern returns an empty array rather than throwing or returning an error; and that the eligible set contains no duplicate patterns (because the parsed catalog is already de-duplicated).
**Depends on**: 2

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, kebab-case test filenames). Look at `tests/music-domain.spec.ts` for the existing `bun:test` style.

Create `tests/rhythm-catalog-eligible.spec.ts` importing from `bun:test` and from `src/lib/rhythm-catalog.ts`. Build a small parsed catalog (via `parseRhythmCatalog` on a synthetic string, or by constructing the expected shape directly if the type is exported) covering at least the 2/4 patterns `QQ`, `EEEE`, `ER`, and `H`. Then assert: (a) given a selection of `{Q}` for meter 2/4, `computeEligibleRhythms` returns only `QQ`; (b) given `{E, R}` it returns `EEEE` and `ER`; (c) given `{H}` it returns `H`; (d) given a selection with no qualifying pattern (e.g. `{D}` for 2/4, where no 2/4 pattern uses only `D`) it returns an empty array and does not throw; (e) the returned array contains no duplicate entries. These tests must fail because `computeEligibleRhythms` does not exist yet.

---

### 4. Eligible-rhythms implementation

**Type**: GREEN
**Output**: `computeEligibleRhythms(catalog, meter, selectedTokens)` is exported from `src/lib/rhythm-catalog.ts` as a pure arrow function returning the patterns for the given meter whose every token is in the selected set, or an empty array when none qualify. The task-3 tests pass.
**Depends on**: 3

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, pure functions). Read `Notes/skills/code-writing/typescript-rules` for the TypeScript conventions.

Add `computeEligibleRhythms` to `src/lib/rhythm-catalog.ts`. It takes the parsed catalog, a meter string, and a set (or array) of selected duration tokens, and returns the patterns for that meter whose every token is in the selected set. A selection with no qualifying pattern returns an empty array — never an error and never a thrown exception. The function must be pure and must not mutate its arguments. Run the task-3 tests to confirm they pass.

---

### 5. Package the real catalog into the worker at build time

**Type**: CONFIG
**Output**: A build-time step reads `Notes/all-rhythms.txt` and emits a generated `src/lib/rhythm-catalog-data.ts` exporting the catalog text as a string constant; `npm run build` (`wrangler build`) succeeds with the generated module bundled; runtime code can import the packaged catalog text without a file-system read; the generated module is treated as a build artifact (and added to `.gitignore` if the project's pattern calls for it, otherwise committed per the existing generated-file convention). `tsc --noEmit` passes.
**Depends on**: 2

This is a configuration/tooling change. Read `Notes/skills/AGENTS.md` and the project `AGENTS.md`. Look at `package.json` for the existing `scripts` block and at `wrangler.jsonc` for the build configuration; look at how `worker-configuration.d.ts` and `build-schema-update.sh` handle generated artifacts in this repo before deciding whether to git-ignore or commit the generated module.

Add a small build script (e.g. `scripts/package-rhythm-catalog.ts` or an inline `node`/`bun` script invoked from an npm `prebuild` step) that reads `Notes/all-rhythms.txt` and writes `src/lib/rhythm-catalog-data.ts` exporting the text as a string constant (e.g. `export const RHYTHM_CATALOG_TEXT = "..."`). Wire it into `npm run build` so `wrangler build` always bundles the current catalog (a `prebuild` script is the natural hook). The runtime parser imports `RHYTHM_CATALOG_TEXT` from this generated module — no runtime file-system read. Confirm `npm run build` succeeds and `tsc --noEmit` passes. Do not implement health-route wiring here — that is task 7. Do not modify `Notes/all-rhythms.txt`; it remains the hand-curated source of truth.

---

### 6. Health-route catalog wiring tests

**Type**: RED
**Output**: `tests/health-route-catalog.spec.ts` (or an extension of `tests/health-route.spec.ts`) that fails because `src/routes/build-health.tsx` does not yet build a `CatalogHealthContribution` from the packaged catalog. The tests assert that a healthy packaged catalog contributes a healthy catalog contribution to `runHealthCheck`; that a corrupted catalog (simulated by feeding the parser a malformed string, or by injecting a defective `CatalogHealthContribution`) makes the aggregate health result unhealthy with defects naming the offending meter and line; that catalog defects and configuration defects aggregate together in the detailed report; and that the anonymous liveness payload still carries only the healthy flag and leaks no defect detail, meter name, or line number.
**Depends on**: 2, 5

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, kebab-case test filenames). Look at the existing `tests/health-route.spec.ts` for the `runHealthCheck`, `CatalogHealthContribution`, `buildAnonymousLiveness`, and `buildDetailedReport` shapes and the `completeInput` fixture.

Add tests covering the catalog-to-health wiring: (a) the catalog contribution built from the real packaged catalog text is healthy; (b) when the catalog contribution is unhealthy, `runHealthCheck`'s aggregate result is unhealthy and the defects include the catalog defects naming the meter and line; (c) catalog defects and configuration defects both appear together in the detailed report; (d) `buildAnonymousLiveness` of an unhealthy aggregate carries only `{ healthy: false }` with no defect text, meter name, or line number. Prefer a `bun:test` unit test invoking the wiring function directly with the packaged catalog text (and a synthetic malformed string for the unhealthy case). These tests must fail because the health route does not yet build the catalog contribution.

---

### 7. Health-route catalog wiring implementation

**Type**: GREEN
**Output**: `src/routes/build-health.tsx` builds a `CatalogHealthContribution` from the packaged catalog via the task-2 parser and passes it to `runHealthCheck` inside the health route handler. The task-6 tests pass and the existing `tests/health-route.spec.ts` tests still pass.
**Depends on**: 6

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, Hono route style matching the existing `buildHealth` registration). Read `Notes/skills/code-writing/typescript-rules`.

Modify `src/routes/build-health.tsx` so the health route handler builds a `CatalogHealthContribution` from the packaged catalog text (imported from the generated `src/lib/rhythm-catalog-data.ts`) by running it through `parseRhythmCatalog` from `src/lib/rhythm-catalog.ts`, mapping parse defects to `ConfigDefect` entries whose `valueName` is `'rhythm-catalog'` and whose `message` includes the meter and line from the parser defect, and passes that contribution to `runHealthCheck`. A healthy catalog yields a healthy contribution with no defects. Keep the anonymous-vs-privileged split unchanged: the anonymous liveness payload still carries only the healthy flag, and the detailed report still names every defect without secret values. Run the task-6 tests and the existing `tests/health-route.spec.ts` to confirm they pass.

---

### 8. Document the rhythm catalog in the wiki

**Type**: DOCUMENT
**Output**: Wiki pages under `Notes/wiki/` are updated (per `Notes/wiki/wiki-rules.md`) describing the rhythm catalog file format, the token-duration and measure-length tables, the exact-arithmetic validation rules, the de-duplication-on-packaging behavior, the eligible-rhythm calculation, and the catalog's contribution to the health check.
**Depends on**: 7

Read `Notes/wiki/wiki-rules.md` and `Notes/wiki/AGENTS.md` for the wiki conventions before editing. Update the relevant existing pages (e.g. `Notes/wiki/source-code.md`, `Notes/wiki/project-overview.md`, `Notes/wiki/unit-tests.md`) and add any new entity page the wiki pattern calls for (e.g. a `rhythm-catalog.md` page) so the catalog format, validation rules, and health contribution are interlinked with the rest of the wiki. Do not duplicate the issue or this task file verbatim — synthesize the wiki entry from the implemented behavior.

---

### 9. Code walkthrough

**Type**: CODE WALKTHROUGH
**Output**: A new directory `Notes/walkthroughs/issue-012-rhythm-catalog-packaging-validation/code-walkthrough` populated by `uvx showboat` containing a walkthrough of the rhythm-catalog parser, eligible-rhythm calculation, build-time packaging, and health-route wiring.
**Depends on**: 7

Run `uvx showboat --help` for usage. Build an executable walkthrough document under `Notes/walkthroughs/issue-012-rhythm-catalog-packaging-validation/code-walkthrough` that shows and proves the implementation: the parser validating the real catalog, the exact-arithmetic length checks, the de-duplication, the eligible-rhythm calculation, the build-time packaging step, and the health-route catalog contribution. Place all files showboat generates in that directory.

---

### 10. Review

**Type**: REVIEW
**Output**: A human confirms the catalog validates against the real `Notes/all-rhythms.txt`, the health check reports pattern counts per meter, and temporarily corrupting a pattern's length makes the health check fail naming the offending meter and line.
**Depends on**: 8, 9

A human reviews the implemented slice against the issue's acceptance criteria and the manual verification steps: run the health check with the real catalog and confirm it passes and reports pattern counts per meter; temporarily corrupt a pattern's length and confirm the health check fails naming the meter and line; confirm a duplicate identical pattern passes validation and appears once in the packaged set; confirm an unqualifying duration selection yields an empty eligible-rhythm result rather than an error. Do not proceed to close the issue until this review is complete.

---
