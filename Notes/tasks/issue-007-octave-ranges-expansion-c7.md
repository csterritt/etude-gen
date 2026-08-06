# Tasks for #7: Octave scale-range selection, contiguous expansion, and the C7 rule

Parent issue: #7
Parent PRD: `Notes/PRD-etude-generator.md`

## Tasks

### 1. Write failing Bun tests for the music domain (octave validation, range expansion, C7 rule, available pitches)

**Type**: RED
**Output**: A failing `tests/music-domain.spec.ts` that asserts `validateOctaves` accepts octaves 2 through 6, rejects an empty selection and any octave outside 2–6 with a typed failure, and normalizes duplicate values and arbitrary order to one ascending `number[]`; that `expandOctaveRange` returns the contiguous min/max from the lowest and highest selected octaves; that `deriveScaleRangePitches` produces the tonic-to-tonic pitch set for a single octave using the key's diatonic spelling; that `deriveAvailablePitches` returns the full available pitch set after contiguous expansion and the C7 cap, with the lowest and highest available pitch; and that all four exact-boundary C7 cases hold (C in key with C7 exactly at the top of the expanded range makes C7 available; C in key with C7 one step outside the expanded range leaves C7 absent; C not in key with the range reaching octave 7 leaves C7 absent; every other octave-7 pitch is excluded even when it falls inside the expanded range).
**Depends on**: none

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test` with `describe`/`it`/`expect`, `true-myth/result` for Result handling, arrow functions, explicit types, no `any`, kebab-case filenames, look at `tests/key-domain.spec.ts` and `tests/setup-validator.spec.ts` for the `unwrap`/`unwrapErr` helper pattern and import style).

Create `tests/music-domain.spec.ts` importing from `bun:test` and `true-myth/result`, and from the not-yet-existing `src/lib/music-domain.ts` and the existing `src/lib/key-domain.ts`. The tests must cover: (a) `OCTAVE_MIN === 2` and `OCTAVE_MAX === 6`; (b) `validateOctaves` accepts `['2', '4', '6']` and returns `Result.ok` with `[2, 4, 6]`; (c) `validateOctaves` accepts a single octave `['3']` returning `[3]`; (d) `validateOctaves` normalizes arbitrary order — `['5', '2', '3']` returns `[2, 3, 5]`; (e) `validateOctaves` normalizes duplicates — `['4', '4', '2', '2']` returns `[2, 4]`; (f) `validateOctaves` rejects an empty array `[]` with a typed failure whose `field` is `'octaves'`; (g) `validateOctaves` rejects `null`, `undefined`, a non-array, and a string (not array) each with a typed failure; (h) `validateOctaves` rejects an out-of-range octave `['1']` and `['7']` each with a typed failure naming the `octaves` field; (i) `validateOctaves` rejects a non-numeric string `['x']` with a typed failure; (j) `expandOctaveRange([2, 5])` returns `{ min: 2, max: 5 }` and `expandOctaveRange([3])` returns `{ min: 3, max: 3 }`; (k) `deriveScaleRangePitches('C major', 4)` returns eight pitches from C4 to C5 inclusive (`['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']`); (l) `deriveScaleRangePitches('D major', 4)` returns `['D4', 'E4', 'F-sharp4', 'G4', 'A4', 'B4', 'C-sharp5', 'D5']` (tonic-to-tonic, key-signature spelling); (m) `deriveScaleRangePitches('E-flat major', 4)` returns `['E-flat4', 'F4', 'G4', 'A-flat4', 'B-flat4', 'C5', 'D5', 'E-flat5']`; (n) `deriveAvailablePitches('C major', [2, 5])` returns a pitch set continuous from C2 through C6 (the octave-2 tonic through the octave-5 range top), with lowest `'C2'` and highest `'C6'`, and no octave-7 pitches; (o) `deriveAvailablePitches('C major', [2, 3, 4, 5, 6])` — selecting octaves 2 through 6 — includes C7 as the highest available pitch (C natural is in C major and C7 is exactly at the top of the expanded range), and the lowest is `'C2'`; (p) `deriveAvailablePitches('G major', [2, 3, 4, 5, 6])` includes C7 (C natural is in G major and C7 falls inside the expanded range) but excludes D7, E7, F-sharp7, and G7 even though they fall inside the expanded range; (q) `deriveAvailablePitches('B-flat major', [2, 3, 4, 5])` — C natural is in B-flat major but C7 is one step outside the expanded range (the top is B-flat6) — does not include C7, and the highest available pitch is `'B-flat6'`; (r) `deriveAvailablePitches('D major', [2, 3, 4, 5, 6])` — C natural is not in D major (D major has C-sharp) and the range reaches octave 7 — does not include C7, excludes every octave-7 pitch (C-sharp7, D7), and the highest available pitch is `'B6'`; (s) `deriveAvailablePitches('F-sharp minor', [2, 3, 4, 5, 6])` — C natural is not in F-sharp minor (it has C-sharp) — does not include C7. Assert on `isOk`/`isErr`, on the `field` names in failures, and on the exact pitch arrays — do not assert on string failure messages. These tests must fail because the music-domain module does not exist yet.

---

### 2. Implement the music domain module

**Type**: GREEN
**Output**: `src/lib/music-domain.ts` exports `OCTAVE_MIN` (2), `OCTAVE_MAX` (6), an `OctaveValidationFailure` interface, `validateOctaves(values: unknown): Result<number[], OctaveValidationFailure>`, `expandOctaveRange(octaves: number[]): { min: number; max: number }`, `deriveScaleRangePitches(key: string, octave: number): string[]`, and `deriveAvailablePitches(key: string, octaves: number[]): { pitches: string[]; lowest: string; highest: string }`. The task-1 tests pass.
**Depends on**: 1

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, `Result`-returning style, one export per file where practical, define constants for octave boundaries). Read `Notes/skills/code-writing/comment-writing` for the comment conventions.

Create `src/lib/music-domain.ts` importing `Result` from `true-myth/result` and `deriveKeyPitches` from `src/lib/key-domain.ts`. Export `OCTAVE_MIN = 2` and `OCTAVE_MAX = 6`. Implement `validateOctaves` as a pure arrow function that accepts an array of unknown values, rejects a non-array, `null`, `undefined`, an empty array, a non-numeric element, and any element outside 2–6, each returning a typed failure with `field: 'octaves'`; for a valid array, parse each element to an integer, deduplicate, sort ascending, and return `Result.ok` with the sorted unique `number[]`. Implement `expandOctaveRange` as a pure arrow function returning `{ min, max }` from the lowest and highest values of the input array. Implement `deriveScaleRangePitches` as a pure arrow function that, given a supported key and an octave number, calls `deriveKeyPitches(key)` to get the seven diatonic pitch names, appends the octave number to each to form scientific-pitch notation (e.g. `'C'` + `4` → `'C4'`, `'F-sharp'` + `4` → `'F-sharp4'`), and appends the tonic pitched at `octave + 1` as the eighth note (tonic-to-tonic). Implement `deriveAvailablePitches` as a pure arrow function that: (1) calls `expandOctaveRange` to get the contiguous min/max; (2) for each octave from min to max, calls `deriveScaleRangePitches` and collects the pitches, deduplicating boundary tonics (the upper tonic of one octave equals the lower tonic of the next); (3) applies the C7 cap — remove every pitch whose octave number is 7 except C7, and keep C7 only when `'C'` is in `deriveKeyPitches(key)` (meaning C natural belongs to the key); (4) returns the sorted pitch set with its lowest and highest elements. Use `deriveKeyPitches` to determine whether C natural is in the key — for sharp keys like D major the diatonic pitches include `'C-sharp'` not `'C'`, so C7 is excluded. Run the task-1 tests to confirm they pass.

---

### 3. Write failing Bun tests for multi-value form parser extension

**Type**: RED
**Output**: The existing `tests/etude-form-parser.spec.ts` is extended with failing tests asserting a new `'string-multi'` field type collects all submitted values into a `string[]`, treats an absent field (zero values) as a field-addressable failure, tolerates duplicate values and arbitrary order without rejecting, and that the returned `RawValues` entry for a multi-value field is an array while single-value fields remain strings.
**Depends on**: none

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, `true-myth/result`, arrow functions, explicit types, no `any`, kebab-case filenames). Follow the existing test structure in `tests/etude-form-parser.spec.ts`.

Extend `tests/etude-form-parser.spec.ts` with new `describe`/`it` blocks for the `'string-multi'` field type. Assert: (a) a `FieldSpec` with `octaves: { type: 'string-multi' }` and a `FormData` submitting `octaves=2&octaves=4&octaves=6` returns `Result.ok` whose `value.octaves` is `['2', '4', '6']` (an array, preserving all submitted values in submission order); (b) a `FormData` submitting `octaves=5&octaves=2&octaves=3` (arbitrary order) returns `Result.ok` whose `value.octaves` is `['5', '2', '3']` (the parser does not sort — normalization is the validator's job); (c) a `FormData` submitting `octaves=4&octaves=4&octaves=2` (duplicates) returns `Result.ok` whose `value.octaves` is `['4', '4', '2']` (the parser does not dedupe — normalization is the validator's job); (d) a `FormData` with no `octaves` field returns `Result.err` with a failure whose `field` is `'octaves'`; (e) a `FormData` submitting a single `octaves=3` returns `Result.ok` whose `value.octaves` is `['3']` (a one-element array, not a bare string); (f) a spec mixing a single-value field and a multi-value field returns the single-value field as a string and the multi-value field as an array in the same `Result.ok`; (g) an unexpected extra field is still ignored and does not affect the multi-value field. Assert on `isOk`/`isErr` and on the `field` names — do not assert on string messages. These tests must fail because the parser does not yet support `'string-multi'`.

---

### 4. Extend the form parser to support multi-value fields

**Type**: GREEN
**Output**: `src/lib/etude-form-parser.ts` `FieldSpecEntry.type` union includes `'string-multi'`; `readField` collects all values into a `string[]` for `'string-multi'` fields (absent/zero values is a failure, duplicates and arbitrary order are preserved); `RawValues` type is `Record<string, string | string[]>`. The task-3 tests pass and the existing parser tests still pass.
**Depends on**: 3

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies). Read `Notes/skills/code-writing/comment-writing` for the comment conventions.

Extend `src/lib/etude-form-parser.ts`: add `'string-multi'` to the `FieldSpecEntry.type` union. Update `RawValues` to `Record<string, string | string[]>`. Extend `readField` so that when `entry.type === 'string-multi'` and `count === 0`, it returns the absent failure; when `count >= 1`, it returns all values as a `string[]` (coercing non-string `FormDataEntryValue`s to strings), with no repeated-field-policy enforcement (duplicates and arbitrary order are preserved for the validator to normalize). The existing `'string'` type behavior and its repeated-field policies are unchanged. Update `parseParameterForm` so the `values` record stores the array for multi-value fields. Run the task-3 tests and the existing `tests/etude-form-parser.spec.ts` tests to confirm they all pass.

---

### 5. Add `selectedOctaves` column to the etude_params schema

**Type**: MIGRATE
**Output**: `src/db/schema.ts` `etudeParams` table includes `selectedOctaves: text('selectedOctaves').notNull().default('4')`; a new drizzle migration is generated; `schema.sql` is regenerated via `npx drizzle-kit generate` and `./build-schema-update.sh`; the `EtudeParams` interface in `src/lib/etude-params-repository.ts` includes `selectedOctaves: string`.
**Depends on**: none

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`). Read `Notes/skills/code-writing/database-access` before writing schema or data-access code.

Add `selectedOctaves: text('selectedOctaves').notNull().default('4')` to the `etudeParams` table definition in `src/db/schema.ts`, after the existing `keySignature` column. The column stores the normalized ascending octave selection as a comma-separated string (e.g. `'2,3,4,5,6'`), with the default `'4'` matching the previous single-octave default. Run `npx drizzle-kit generate` to produce the new migration SQL, then run `./build-schema-update.sh` to regenerate `schema.sql` (the script concatenates all migration files with `IF NOT EXISTS` transforms). Update the `EtudeParams` interface in `src/lib/etude-params-repository.ts` to include `selectedOctaves: string`. The existing `octaveRange` integer column remains in the schema but is now unused; do not remove it in this task. Confirm the existing repository tests still pass against the regenerated schema (the in-memory test DB applies `schema.sql` fresh each time).

---

### 6. Write failing Bun tests for the octave field in the setup validator

**Type**: RED
**Output**: The existing `tests/setup-validator.spec.ts` is extended with failing tests asserting `validateSetup` accepts valid octave sets as a fifth field, rejects an empty octave selection and an out-of-range octave with a field-addressable failure naming the `octaves` field, normalizes duplicates and arbitrary order in the validated `ValidSetup` result, and that a submission with both an invalid key and an invalid octave set reports both failures together.
**Depends on**: 2

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, `true-myth/result`, arrow functions, explicit types, no `any`, kebab-case filenames). Follow the existing test structure in `tests/setup-validator.spec.ts`.

Extend `tests/setup-validator.spec.ts` with new `describe`/`it` blocks. The `validateSetup` input type now carries a fifth field `octaves: unknown`. Assert: (a) a valid submission with `octaves: ['2', '4', '6']` and valid measures/meter/hands/key returns `Result.ok` whose `octaves` equals `[2, 4, 6]`; (b) a valid submission with `octaves: ['5', '2', '3']` (arbitrary order) returns `Result.ok` whose `octaves` equals `[2, 3, 5]` (normalized); (c) a valid submission with `octaves: ['4', '4', '2', '2']` (duplicates) returns `Result.ok` whose `octaves` equals `[2, 4]` (normalized); (d) a valid submission with `octaves: ['3']` (single value) returns `Result.ok` whose `octaves` equals `[3]`; (e) an empty octave array `[]` returns `Result.err` with a failure whose `field` is `'octaves'`; (f) `null` or `undefined` for octaves returns `Result.err` naming the `octaves` field; (g) an out-of-range octave `['1']` or `['7']` returns `Result.err` naming the `octaves` field; (h) a non-numeric string in the octave array `['x']` returns `Result.err` naming the `octaves` field; (i) a submission with both an invalid key and an empty octave array reports both failures together. Assert on `isOk`/`isErr` and on the `field` names in the failure list — do not assert on string messages. These tests must fail because `validateSetup` does not yet accept or validate an octave field.

---

### 7. Extend the setup validator to validate the octave field

**Type**: GREEN
**Output**: `src/lib/setup-validator.ts` exports an extended `ValidSetup` interface that includes `octaves: number[]`, a `SetupValidationFailure` whose `field` union includes `'octaves'`, `SetupInput` adds `octaves: unknown`, and `validateSetup` now validates five fields (measures, meter, hands, key, octaves) using `validateOctaves` from `src/lib/music-domain.ts`. The task-6 tests pass and the existing setup-validator tests still pass.
**Depends on**: 6

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, `Result`-returning style, one export per file where practical).

Extend `src/lib/setup-validator.ts`: add `octaves: number[]` to the `ValidSetup` interface, add `'octaves'` to the `SetupValidationFailure.field` union, add `octaves: unknown` to the `SetupInput` interface, and import `validateOctaves` from `src/lib/music-domain.ts`. Extend `validateSetup` to validate the octave field alongside the existing four fields, collecting its failure into the same failures array so multiple invalid fields are reported together. When all five fields pass, include the validated `octaves: number[]` in the `Result.ok` value. Do not coerce an invalid or empty octave selection into a default. Run the task-6 tests and the existing setup-validator tests to confirm they all pass.

---

### 8. Write failing Bun tests for octave persistence and octave-change invalidation in the repository

**Type**: RED
**Output**: The existing `tests/etude-params-repository.spec.ts` is extended with failing tests asserting `updateEtudeSetup` persists the `selectedOctaves` value as a normalized comma-separated string; that when the submitted octaves differ from the stored octaves, `notesConfirmed` and `splitConfirmed` are cleared to `false` in the same committed transition; that when the submitted octaves are identical to the stored octaves (even if another field changes), `notesConfirmed` and `splitConfirmed` are left unchanged unless the key also changed; and that when all submitted values are identical to the stored ones, the workflow version is not incremented and no flags change.
**Depends on**: 5, 7

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, `true-myth/result`, arrow functions, explicit types, no `any`, kebab-case filenames). Use the existing `tests/helpers/test-db.ts` helper to obtain a real in-memory SQLite database.

Extend `tests/etude-params-repository.spec.ts` with new `describe`/`it` blocks. Use the test-DB helper to create a fresh database, insert a `user` row, and call `loadOrCreateEtudeParams` to seed a default aggregate (whose `selectedOctaves` is `'4'`, `notesConfirmed` is `false`, `splitConfirmed` is `false`). Then assert: (a) calling `updateEtudeSetup` with octaves `[2, 4, 6]` and the current epoch returns `Result.ok` with `selectedOctaves` equal to `'2,4,6'`, `workflowVersion` one greater than before, and `setupConfirmed` true; (b) after first confirming the notes and split steps (by setting `notesConfirmed` and `splitConfirmed` to `true` directly in the test DB), a subsequent `updateEtudeSetup` that changes only the octaves (e.g. from `[4]` to `[2, 3, 4, 5, 6]`) clears `notesConfirmed` and `splitConfirmed` back to `false` in the same committed transition; (c) after confirming notes and split, a subsequent `updateEtudeSetup` that resubmits the identical octaves but changes a non-key non-octave field (e.g. measures) leaves `notesConfirmed` and `splitConfirmed` unchanged (still `true`); (d) a submission whose measures, meter, hands, key, and octaves are all identical to the stored values does not increment the `workflowVersion` and leaves all confirmation flags unchanged; (e) a submission that changes both the key and the octaves clears `notesConfirmed` and `splitConfirmed`; (f) the epoch-mismatch rejection still works and no invalidation takes place. These tests must fail because `updateEtudeSetup` does not yet persist `selectedOctaves` or perform octave-change invalidation.

---

### 9. Extend `updateEtudeSetup` to persist octaves and clear dependent flags on octave change

**Type**: GREEN
**Output**: `src/lib/etude-params-repository.ts` `updateEtudeSetup` now persists `selectedOctaves` (as a normalized comma-separated string), compares the submitted octaves to the stored octaves, and clears `notesConfirmed` and `splitConfirmed` when either the key or the octaves actually changed. When all submitted values are identical to the stored ones, the workflow version is not incremented and no flags change. The task-8 tests pass and the existing repository tests still pass.
**Depends on**: 8

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, `Result`-returning data-access style matching the existing `loadOrCreateEtudeParams` in `src/lib/etude-params-repository.ts`, `withRetry`/`...Actual` pattern from `src/lib/db-access.ts`). Read the `Notes/skills/code-writing/database-access` skill before writing data-access code.

Extend `updateEtudeSetupActual` in `src/lib/etude-params-repository.ts`. The function must first load the current aggregate row to compare the submitted values against the stored ones. If all submitted values (measures, meter, hands, key, octaves) are identical to the stored values, return `Result.ok` with the existing aggregate unchanged — do not increment the version, do not write, do not clear any flags. Otherwise, perform a single conditional Drizzle `update` with a `where` clause matching both `userId` and `aggregateEpoch === expectedEpoch`, setting `measureCount`, `timeSignature`, `hand`, `keySignature`, `selectedOctaves` (the validated `number[]` joined with `','`), `setupConfirmed: true`, `workflowVersion: sql\`workflowVersion + 1\``, and `updatedAt: new Date()`. When the submitted key differs from the stored key OR the submitted octaves differ from the stored octaves, also set `notesConfirmed: false` and `splitConfirmed: false` in the same update (the Issue 11 dependency map rows for Key and Octave Range both clear pitch selection and split boundary). When neither key nor octaves changed but another field changed, leave `notesConfirmed` and `splitConfirmed` unchanged. If `returning()` yields zero rows, the epoch did not match — return `Result.err` as before. Never read-then-unconditionally-write. Run the task-8 tests and the existing repository tests to confirm they all pass.

---

### 10. Write failing e2e test for the octave field and derived range on the setup form

**Type**: RED
**Output**: A failing `e2e-tests/etude/08-etude-setup-octave-form.spec.ts` asserting that a signed-in student visiting `/etude/setup` sees checkboxes for octaves 2 through 6, the stored octave selection is pre-checked, and the lowest and highest available pitch are displayed derived from the selected key and octaves.
**Depends on**: 9

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, Playwright for e2e, kebab-case filenames, `data-testid` attributes named `name-field` for form fields, look in `e2e-tests/support` for helpers and `e2e-tests/etude/06-etude-setup-key-form.spec.ts` for the existing setup-form test pattern before writing).

Create `e2e-tests/etude/08-etude-setup-octave-form.spec.ts` using `testWithDatabase`, `signInUser` from `e2e-tests/support/auth-helpers.ts`, and `TEST_USERS` from `e2e-tests/support/test-data.ts`. After signing in and navigating to `/etude` (which redirects to `/etude/setup`), assert: (a) a group of checkboxes with `data-testid='octaves-field'` is visible, one per octave from 2 through 6 (five checkboxes total); (b) each checkbox has a `value` attribute matching its octave number and an accessible label; (c) the default stored octave (4) is pre-checked and the others are unchecked; (d) an element with `data-testid='available-range'` displays the lowest and highest available pitch for the current key and octave selection; (e) with the default key `C major` and default octave 4, the displayed lowest pitch is `C4` and the highest is `C5`; (f) after checking octaves 2 and 5 (and unchecking 4), the displayed range covers the continuous expansion from octave 2 through octave 5 (lowest `C2`, highest `C5`); (g) after checking octave 6 in `C major`, the highest available pitch becomes `C7`. These tests must fail because the current setup form has no octave control and no available-range display. Do not modify shared helpers in this task.

---

### 11. Implement the octave field and derived range display on the GET setup form

**Type**: GREEN
**Output**: `src/routes/build-etude.tsx` `renderEtudeSetupForm` renders five checkboxes for octaves 2 through 6 (pre-checked to the stored `selectedOctaves`), each with `name='octaves'` and `data-testid='octaves-field'`, and renders the lowest and highest available pitch from `deriveAvailablePitches` in an element with `data-testid='available-range'`. The task-10 e2e tests pass.
**Depends on**: 10

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, Hono route style matching existing routes, `data-testid` naming, DaisyUI components, `redirectWithMessage`/`redirectWithError` from `src/lib/redirects.tsx` never `c.redirect`). Read `Notes/skills/code-writing/web-behavior` and `Notes/skills/code-writing/styling-html-and-tsx` before writing route/JSX code. Read `Notes/skills/code-writing/production-code-control-comments` for the PRODUCTION comment convention.

Extend `renderEtudeSetupForm` in `src/routes/build-etude.tsx`. Add a checkbox group for octaves 2 through 6: each checkbox has `type='checkbox'`, `name='octaves'`, `value` set to the octave number, `id='octaves-field-{n}'`, `data-testid='octaves-field'`, an accessible `<label>` with `htmlFor` matching the id, and `checked` when the octave is in the stored `selectedOctaves` (parse the stored comma-separated string into a `number[]`). Use the `value` attribute for the checkbox value. Below the octave control, call `deriveAvailablePitches(params.keySignature, parsedOctaves)` and render the lowest and highest available pitch inside an element with `data-testid='available-range'` so the expansion and the C7 cap are observable without generating music. The form's existing fields (measures, meter, hands, key) and the hidden `workflowVersion` field remain unchanged. Run the task-10 e2e tests to confirm they pass.

---

### 12. Write failing e2e tests for POST /etude/setup octave submission

**Type**: RED
**Output**: A failing `e2e-tests/etude/09-etude-setup-octave-submit.spec.ts` asserting: (a) a valid octave submission (e.g. octaves 2 and 5) results in a 303 redirect to `/etude/setup`, the form re-displays with the new octaves checked after reload, and the available-range display updates to the continuous expansion; (b) an empty octave selection (no `octaves` field) submitted bypassing native constraints results in a 303 redirect with a field-addressable error, no persistence, and no 500; (c) an out-of-range octave (e.g. `octaves=7`) submitted bypassing native constraints results in a 303 redirect with a field-addressable error and no persistence; (d) octaves submitted in arbitrary order (e.g. `octaves=5&octaves=2&octaves=3`) are normalized to one ascending set and the derived pitches are identical to the canonical submission; (e) octaves submitted with duplicate values (e.g. `octaves=4&octaves=4&octaves=2`) are normalized and accepted; (f) resubmitting the identical values (same measures, meter, hands, key, octaves as stored) does not increment the workflow version; (g) changing only the octaves increments the workflow version and clears dependent downstream state (observable as the canonical route moving back to `/etude/setup` or the notes step resetting, asserted via the workflow version increment and no error).
**Depends on**: 11

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, Playwright for e2e, kebab-case filenames, `data-testid` naming, look at `e2e-tests/etude/07-etude-setup-key-submit.spec.ts` for the existing POST-submission pattern including the multipart helper that bypasses native constraints).

Create `e2e-tests/etude/09-etude-setup-octave-submit.spec.ts` following the pattern in `e2e-tests/etude/07-etude-setup-key-submit.spec.ts`. Use `page.request.post` with `multipart` and `maxRedirects: 0` to bypass native HTML constraints. Assert: (a) submitting `octaves=2&octaves=5` with valid measures/meter/hands/key returns a 303 redirect to `/etude/setup`, and after following the redirect the octave 2 and 5 checkboxes are checked, octave 3 and 4 are unchecked, and the available-range display shows the continuous expansion from octave 2 through 5; (b) submitting with no `octaves` field returns a 303 redirect with an error and the stored octaves are unchanged after reload (no persistence, no 500); (c) submitting `octaves=7` (out of range) returns a 303 redirect with a field-addressable error and the stored octaves are unchanged (no 500); (d) submitting `octaves=5&octaves=2&octaves=3` (arbitrary order) returns a 303 redirect and after reload the octaves are normalized to 2, 3, 5 checked and the available-range display matches the canonical `octaves=2&octaves=3&octaves=5` submission; (e) submitting `octaves=4&octaves=4&octaves=2` (duplicates) returns a 303 redirect and after reload octaves 2 and 4 are checked (normalized); (f) resubmitting the identical values (same measures, meter, hands, key, octaves as stored) does not increment the workflow version (assert the hidden `workflowVersion` field value is unchanged after the redirect); (g) changing only the octaves (e.g. from `[4]` to `[2, 3, 4, 5, 6]`) increments the workflow version and the form re-displays with the new octaves and the updated available-range display. These tests must fail because the POST handler does not yet accept or validate an octave field.

---

### 13. Implement the POST handler octave validation and persistence

**Type**: GREEN
**Output**: `src/routes/build-etude.tsx` POST handler adds `octaves: { type: 'string-multi' }` to `SETUP_FIELD_SPEC`, wires octave validation through the extended `validateSetup`, and persists the octaves via the extended `updateEtudeSetup`. Empty and out-of-range octave submissions are rejected with a field-addressable error and a 303 redirect, never a 500. Duplicate and arbitrary-order submissions are normalized. Identical resubmissions do not increment the version. The task-12 e2e tests pass and the existing `05-etude-setup-submit.spec.ts` and `07-etude-setup-key-submit.spec.ts` tests still pass.
**Depends on**: 12

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, Hono route style, `redirectWithMessage`/`redirectWithError` never `c.redirect`, `data-testid` naming). Read `Notes/skills/code-writing/production-code-control-comments` for the PRODUCTION comment convention.

Extend the POST handler in `src/routes/build-etude.tsx`: add `octaves: { type: 'string-multi' }` to `SETUP_FIELD_SPEC` (the multi-value type collects all submitted `octaves` values into a `string[]`). Pass the parsed `raw.octaves` (now a `string[]`) as the `octaves` field to `validateSetup`. On validation failure, redirect with the first field-addressable error as before. On validation success, pass the validated `octaves: number[]` through to `updateEtudeSetup` (which now handles persistence, octave-change invalidation, and the identical-resubmit no-increment behavior). The existing measures/meter/hands/key flow is unchanged. Run the task-12 e2e tests and the existing `05-etude-setup-submit.spec.ts` and `07-etude-setup-key-submit.spec.ts` tests to confirm they all pass.

---

### 14. Refactor the extended parser, validator, repository, and form

**Type**: REFACTOR
**Output**: The extended form parser, music domain module, setup validator, repository, and form are reviewed for duplication and cleanliness. The octave field reuses the parameter-form pattern with the new multi-value type without special-casing in the route. No behavior changes — all tests still pass.
**Depends on**: 13

Before refactoring, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (refactor only after tests pass, no behavior changes, arrow functions, explicit types, no `any`).

Review the changes from tasks 2, 4, 5, 7, 9, 11, and 13. Ensure the octave field is wired through the same parameter-form pattern as measures/meter/hands/key with the multi-value extension cleanly integrated into the parser. Ensure the music-domain module's C7 cap logic is readable and the tonic-to-tonic derivation is clearly commented. Ensure the repository's identical-resubmit detection covers all five fields and the key-or-octave-change invalidation is clearly commented. Remove any dead code or duplicated logic introduced during the GREEN tasks. Run the full unit and e2e test suites to confirm no regressions.

---

### 15. Update wiki and notes documentation

**Type**: DOCUMENT
**Output**: `Notes/wiki/source-code.md` is updated with the new `src/lib/music-domain.ts` module, the extended `src/lib/etude-form-parser.ts`, the extended `src/lib/setup-validator.ts`, the extended `src/lib/etude-params-repository.ts`, the schema change in `src/db/schema.ts`, and the extended `src/routes/build-etude.tsx`. `Notes/wiki/unit-tests.md` is updated with `tests/music-domain.spec.ts` and the extended parser, setup-validator, and repository tests. `Notes/wiki/e2e-tests.md` is updated with the two new e2e spec files. `Notes/wiki/project-overview.md` is updated to mention octave selection, contiguous expansion, and the C7 rule. `Notes/wiki/log.md` gets a new entry. `Notes/wiki/index.md` is updated if needed.
**Depends on**: 13

Before writing documentation, read `Notes/wiki/AGENTS.md` and `Notes/wiki/wiki-rules.md` for the wiki conventions (ingest operation, kebab-case filenames, update `index.md` and append to `log.md` with the `## [YYYY-MM-DD] <operation> | <subject>` format).

Ingest the new and modified source files and tests into the wiki following the ingest operation: read each file, identify key takeaways, update the relevant category pages (`source-code.md`, `unit-tests.md`, `e2e-tests.md`, `project-overview.md`), and append an entry to `log.md`. Do not index anything under `node_modules`.

---

### 16. Generate a code walkthrough with showboat

**Type**: CODE WALKTHROUGH
**Output**: A walkthrough generated via `uvx showboat` placed under `Notes/walkthroughs/issue-007-octave-ranges-expansion-c7/code-walkthrough/`. The walkthrough covers the music domain module (octave validation, range expansion, C7 cap, available-pitch derivation), the multi-value form parser extension, the extended setup validator, the repository octave persistence and invalidation, the setup form octave checkboxes and available-range display, and the POST handler, with executable test runs as proof.
**Depends on**: 13

Run `uvx showboat --help` for usage details. Generate a walkthrough of the Issue 7 implementation covering: (1) the music domain module with octave validation, contiguous range expansion, tonic-to-tonic derivation, and the C7 cap with all four boundary cases, (2) the multi-value form parser extension, (3) the extended setup validator with the octave field, (4) the repository octave persistence and octave-change invalidation with identical-resubmit detection, (5) the GET setup form octave checkboxes and available-range display, (6) the POST handler octave validation and hostile-shape tolerance. Place the generated files in `Notes/walkthroughs/issue-007-octave-ranges-expansion-c7/code-walkthrough/`.

---

### 17. Human review of the music domain, C7 rule, and cross-cutting contract

**Type**: REVIEW
**Output**: A human verifies the music domain's C7 boundary cases against the issue's exact-boundary requirements, confirms the tonic-to-tonic derivation and contiguous expansion are correct for non-C keys, confirms octave validation and normalization behave as specified, and cross-checks the cross-cutting contract section 6 applicability matrix row for Issue 7 (auth + no-cache, PRG 303, version token, safe redisplay, a11y errors, invalidation, epoch all inherited and tested).
**Depends on**: 16

The human should review: (a) the `validateOctaves` function in `src/lib/music-domain.ts` correctly accepts octaves 2–6, rejects empty and out-of-range, and normalizes duplicates and arbitrary order to one ascending set; (b) `expandOctaveRange` correctly returns the contiguous min/max from the lowest and highest selected octaves; (c) `deriveScaleRangePitches` produces correct tonic-to-tonic pitch sets using the key's diatonic spelling for non-C keys (e.g. D major, E-flat major, F-sharp minor); (d) `deriveAvailablePitches` applies the C7 cap correctly at all four exact boundaries — C in key with C7 exactly at the top of the expanded range (C major, octaves 2–6) makes C7 available; C in key with C7 one step outside (B-flat major, octaves 2–5) leaves C7 absent; C not in key with the range reaching octave 7 (D major, octaves 2–6) leaves C7 absent; and every other octave-7 pitch (D7, E7, F-sharp7, G7 in G major) is excluded even when it falls inside the expanded range; (e) the cross-cutting contract section 6 row for Issue 7 is satisfied — all inherited behaviours (auth + no-cache, PRG 303, version token, safe redisplay, a11y errors, invalidation, epoch) are present and tested; (f) the hostile-shape tolerance for the octave field matches the parameter-form contract section 2 rule 5 (absent field, empty string, repeated field, unexpected extra field, arbitrary order all resolve deterministically); (g) the committed octave-range change clears dependent downstream state through the Issue 11 invalidation in the same committed transition.

---
