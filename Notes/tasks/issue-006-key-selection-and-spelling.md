# Tasks for #6: Key selection with key-signature pitch spelling

Parent issue: #6
Parent PRD: `Notes/PRD-etude-generator.md`

## Tasks

### 1. Write failing Bun tests for the key domain catalog and pitch derivation

**Type**: RED
**Output**: A failing `tests/key-domain.spec.ts` that asserts the exact eighteen supported keys (nine major: C, G, D, A, E, F, B-flat, E-flat, A-flat; nine natural minor: A, E, B, F-sharp, C-sharp, D, G, C, F), that no supported key has more than four sharps or flats, that `validateKey` rejects any unsupported or over-four-accidental key with a typed failure, and that `deriveKeyPitches` returns the exact seven diatonic pitch names for every supported key using that key signature's conventional spelling (flat keys spell flats as flats, sharp keys spell sharps as sharps, no enharmonic duplicates), and that every natural-minor key's pitches match the natural minor scale (not harmonic or melodic minor).
**Depends on**: none

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test` with `describe`/`it`/`expect`, `true-myth/result` for Result handling, arrow functions, explicit types, no `any`, kebab-case filenames, look at `tests/setup-validator.spec.ts` for the `unwrap`/`unwrapErr` helper pattern and import style).

Create `tests/key-domain.spec.ts` importing from `bun:test` and `true-myth/result`, and from the not-yet-existing `src/lib/key-domain.ts`. The tests must cover: (a) `SUPPORTED_KEYS` contains exactly the eighteen keys listed in the PRD's "Supported musical domain" section, no more and no less, and no key has more than four accidentals; (b) `validateKey` accepts each of the eighteen supported keys and rejects at least one unsupported major key (e.g. `B major` — five sharps), one unsupported minor key (e.g. `G-sharp minor` — five sharps), an over-four-accidental key, an empty string, `null`, `undefined`, and a non-string value, each returning a typed failure and never coercing to a default; (c) `deriveKeyPitches` returns exactly seven pitch names for every supported key; (d) for E-flat major the derived pitches include B-flat and E-flat (not A-sharp and D-sharp); (e) for A-flat major the derived pitches include A-flat, B-flat, D-flat, and E-flat; (f) for F-sharp minor the derived pitches include F-sharp and C-sharp; (g) for C-sharp minor the derived pitches include C-sharp, D-sharp, and G-sharp; (h) for every natural-minor key the seventh scale degree is a whole step below the tonic (natural minor, not harmonic minor with a raised seventh or melodic minor with raised sixth and seventh). Assert on the typed result's `isOk`/`isErr` and on the exact pitch-name arrays — do not assert on string failure messages. These tests must fail because the key-domain module does not exist yet.

---

### 2. Implement the key domain catalog and pitch derivation

**Type**: GREEN
**Output**: `src/lib/key-domain.ts` exports `SUPPORTED_KEYS` (the eighteen supported keys as a readonly array), a `KeyValidationFailure` interface, a `validateKey(value: unknown): Result<string, KeyValidationFailure>` pure arrow function, and a `deriveKeyPitches(key: string): string[]` pure arrow function returning the seven diatonic pitch names using conventional key-signature spelling. The task-1 tests pass.
**Depends on**: 1

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, `Result`-returning style, one export per file where practical, define constants for the supported key catalog and accidental counts).

Create `src/lib/key-domain.ts` importing `Result` from `true-myth/result`. Define the supported major keys as `C major`, `G major`, `D major`, `A major`, `E major`, `F major`, `B-flat major`, `E-flat major`, `A-flat major` and the supported natural-minor keys as `A minor`, `E minor`, `B minor`, `F-sharp minor`, `C-sharp minor`, `D minor`, `G minor`, `C minor`, `F minor`, per the PRD's "Supported musical domain" section. Export `SUPPORTED_KEYS` as a readonly array of these eighteen strings. Implement `validateKey` as a pure arrow function that accepts exactly one of the supported keys (after trimming) and rejects anything else — an empty string, `null`, `undefined`, a wrong type, an unsupported key, or an over-four-accidental key — returning a typed failure, never coercing. Implement `deriveKeyPitches` as a pure arrow function that, given a supported key, returns the seven diatonic pitch names in scale order using the key signature's conventional spelling: sharp keys use sharp spellings, flat keys use flat spellings, and no enharmonic duplicates appear. Natural-minor keys use the natural minor scale (flat third, flat sixth, flat seventh relative to the relative major), never harmonic or melodic minor. Use a static lookup table keyed by the supported key string — do not compute spellings from accidentals algorithmically in this slice, since a lookup table is the minimal code that makes the tests pass and is easy to verify against the PRD. Run the task-1 tests to confirm they pass.

---

### 3. Write failing Bun tests for the key field in the setup validator

**Type**: RED
**Output**: The existing `tests/setup-validator.spec.ts` is extended with failing tests asserting `validateSetup` accepts all eighteen supported keys as the key field, rejects unsupported and over-four-accidental keys with a field-addressable failure naming the key field, rejects an empty string and a non-string key value without coercing to a default, and that the validated `ValidSetup` result includes the accepted `keySignature` string.
**Depends on**: 2

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, `true-myth/result`, arrow functions, explicit types, no `any`, kebab-case filenames). Follow the existing test structure in `tests/setup-validator.spec.ts`.

Extend `tests/setup-validator.spec.ts` with new `describe`/`it` blocks. The `validateSetup` input type now carries a fourth field `keySignature: unknown`. Assert: (a) each of the eighteen supported keys paired with valid measures/meter/hands returns `Result.ok` whose `keySignature` matches the submitted key; (b) an unsupported key (e.g. `B major`) returns `Result.err` with a failure whose `field` is `key`; (c) an over-four-accidental key (e.g. `G-sharp minor`) returns `Result.err` with a failure whose `field` is `key`; (d) an empty string for the key returns `Result.err` with a failure whose `field` is `key` and is not coerced to the default `C major`; (e) `null` or `undefined` for the key returns `Result.err` naming the key field; (f) a submission with both an invalid key and an invalid measure count reports both failures together. Assert on `isOk`/`isErr` and on the `field` names in the failure list — do not assert on string messages. These tests must fail because `validateSetup` does not yet accept or validate a key field.

---

### 4. Extend the setup validator to validate the key field

**Type**: GREEN
**Output**: `src/lib/setup-validator.ts` exports an extended `ValidSetup` interface that includes `keySignature: string`, a `SetupValidationFailure` whose `field` union includes `'key'`, and `validateSetup` now validates four fields (measures, meter, hands, key) using `validateKey` from `src/lib/key-domain.ts`. The task-3 tests pass and the existing setup-validator tests still pass.
**Depends on**: 3

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, `Result`-returning style, one export per file where practical).

Extend `src/lib/setup-validator.ts`: add `keySignature: string` to the `ValidSetup` interface, add `'key'` to the `SetupValidationFailure.field` union, add `keySignature: unknown` to the `SetupInput` interface, and import `validateKey` from `src/lib/key-domain.ts`. Extend `validateSetup` to validate the key field alongside the existing three fields, collecting its failure into the same failures array so multiple invalid fields are reported together. When all four fields pass, include the validated `keySignature` string in the `Result.ok` value. Do not coerce an invalid or empty key into a default. Run the task-3 tests and the existing setup-validator tests to confirm they all pass.

---

### 5. Write failing Bun tests for key persistence and key-change invalidation in the repository

**Type**: RED
**Output**: The existing `tests/etude-params-repository.spec.ts` is extended with failing tests asserting `updateEtudeSetup` persists the `keySignature` value; that when the submitted key differs from the stored key, `notesConfirmed` and `splitConfirmed` are cleared to `false` in the same committed transition (the downstream confirmation flags that exist now); that when the submitted key is identical to the stored key, `notesConfirmed` and `splitConfirmed` are left unchanged; and that when all submitted values are identical to the stored ones, the workflow version is not incremented and no flags change.
**Depends on**: 4

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, `true-myth/result`, arrow functions, explicit types, no `any`, kebab-case filenames). Use the existing `tests/helpers/test-db.ts` helper to obtain a real SQLite database.

Extend `tests/etude-params-repository.spec.ts` with new `describe`/`it` blocks. Use the test-DB helper to create a fresh database, insert a `user` row, and call `loadOrCreateEtudeParams` to seed a default aggregate (whose `keySignature` is `C major`, `notesConfirmed` is `false`, `splitConfirmed` is `false`). Then assert: (a) calling `updateEtudeSetup` with a different key (e.g. `E-flat major`) and the current epoch returns `Result.ok` with `keySignature` equal to `E-flat major`, `workflowVersion` one greater than before, and `setupConfirmed` true; (b) after first confirming the notes and split steps (by setting `notesConfirmed` and `splitConfirmed` to `true` directly in the test DB), a subsequent `updateEtudeSetup` that changes the key clears `notesConfirmed` and `splitConfirmed` back to `false` in the same committed transition; (c) after confirming notes and split, a subsequent `updateEtudeSetup` that resubmits the identical key leaves `notesConfirmed` and `splitConfirmed` unchanged (still `true`); (d) a submission whose measures, meter, hands, and key are all identical to the stored values does not increment the `workflowVersion` and leaves all confirmation flags unchanged; (e) a submission that changes only a non-key field (e.g. measures) while the key is identical increments the version but does not clear `notesConfirmed` or `splitConfirmed` (only a key change clears those, per the Issue 11 dependency map); (f) the epoch-mismatch rejection still works and no invalidation takes place. These tests must fail because `updateEtudeSetup` does not yet persist the key or perform invalidation.

---

### 6. Extend `updateEtudeSetup` to persist the key and clear dependent flags on key change

**Type**: GREEN
**Output**: `src/lib/etude-params-repository.ts` `updateEtudeSetup` now persists `keySignature`, compares the submitted key to the stored key, and clears `notesConfirmed` and `splitConfirmed` only when the key actually changed. When all submitted values are identical to the stored ones, the workflow version is not incremented and no flags change. The task-5 tests pass and the existing repository tests still pass.
**Depends on**: 5

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, `Result`-returning data-access style matching the existing `loadOrCreateEtudeParams` in `src/lib/etude-params-repository.ts`, `withRetry`/`...Actual` pattern from `src/lib/db-access.ts`). Read the `Notes/skills/code-writing/database-access` skill before writing data-access code.

Extend `updateEtudeSetupActual` in `src/lib/etude-params-repository.ts`. The function must first load the current aggregate row to compare the submitted values against the stored ones. If all submitted values (measures, meter, hands, key) are identical to the stored values, return `Result.ok` with the existing aggregate unchanged — do not increment the version, do not write, do not clear any flags. Otherwise, perform a single conditional Drizzle `update` with a `where` clause matching both `userId` and `aggregateEpoch === expectedEpoch`, setting `measureCount`, `timeSignature`, `hand`, `keySignature`, `setupConfirmed: true`, `workflowVersion: sql\`workflowVersion + 1\``, and `updatedAt: new Date()`. When the submitted key differs from the stored key, also set `notesConfirmed: false` and `splitConfirmed: false` in the same update (the Issue 11 dependency map row for Key clears pitch selection and split boundary; at this stage only the confirmation flags exist, so those are cleared). When the key is identical but another field changed, leave `notesConfirmed` and `splitConfirmed` unchanged. If `returning()` yields zero rows, the epoch did not match — return `Result.err` as before. Never read-then-unconditionally-write. Run the task-5 tests and the existing repository tests to confirm they all pass.

---

### 7. Write failing e2e test for the key field and derived pitches on the setup form

**Type**: RED
**Output**: A failing `e2e-tests/etude/06-etude-setup-key-form.spec.ts` asserting that a signed-in student visiting `/etude/setup` sees a key control offering exactly the eighteen supported keys (and no key with more than four accidentals), the stored key is pre-selected, and the seven derived pitch names are displayed using the selected key signature's conventional spelling.
**Depends on**: 6

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, Playwright for e2e, kebab-case filenames, `data-testid` attributes named `name-field` for form fields, look in `e2e-tests/support` for helpers and `e2e-tests/etude/04-etude-setup-form.spec.ts` for the existing setup-form test pattern before writing).

Create `e2e-tests/etude/06-etude-setup-key-form.spec.ts` using `testWithDatabase`, `signInUser` from `e2e-tests/support/auth-helpers.ts`, and `TEST_USERS` from `e2e-tests/support/test-data.ts`. After signing in and navigating to `/etude` (which redirects to `/etude/setup`), assert: (a) a key control with `data-testid='key-field'` is visible and is a `<select>`; (b) the key control offers exactly the eighteen supported keys and no key with more than four accidentals (assert the option values match the supported set); (c) the default selected key is `C major`; (d) an element with `data-testid='key-pitches'` displays the seven derived pitch names for the currently selected key; (e) after selecting `E-flat major`, the derived pitches read B-flat and E-flat (not A-sharp and D-sharp) — assert the pitch text contains `E-flat` and `B-flat`; (f) after selecting `F-sharp minor`, the derived pitches contain `F-sharp` and `C-sharp`. These tests must fail because the current setup form has no key control and no derived-pitch display. Do not modify shared helpers in this task.

---

### 8. Implement the key field and derived pitches on the GET setup form

**Type**: GREEN
**Output**: `src/routes/build-etude.tsx` `renderEtudeSetupForm` renders a key `<select>` offering exactly the eighteen supported keys (pre-selected to the stored `keySignature`) and renders the seven derived pitch names from `deriveKeyPitches` in an element with `data-testid='key-pitches'`. The task-7 e2e tests pass.
**Depends on**: 7

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, Hono route style matching existing routes, `data-testid` naming, DaisyUI components, `redirectWithMessage`/`redirectWithError` from `src/lib/redirects.tsx` never `c.redirect`). Read `Notes/skills/code-writing/web-behavior` and `Notes/skills/code-writing/styling-html-and-tsx` before writing route/JSX code.

Extend `renderEtudeSetupForm` in `src/routes/build-etude.tsx`. Add a key `<select>` with `id='key-field'`, `name='key'`, `data-testid='key-field'`, `required`, an accessible `<label>`, and options for each of the eighteen supported keys from `SUPPORTED_KEYS` (imported from `src/lib/key-domain.ts`), with the option matching `params.keySignature` selected. Use the `value` attribute (not `defaultValue`) since this is an edit form. Below the key control, render the seven derived pitch names by calling `deriveKeyPitches(params.keySignature)` inside an element with `data-testid='key-pitches'` so the spelling is observable end-to-end. The form's existing fields (measures, meter, hands) and the hidden `workflowVersion` field remain unchanged. Run the task-7 e2e tests to confirm they pass.

---

### 9. Write failing e2e tests for POST /etude/setup key submission

**Type**: RED
**Output**: A failing `e2e-tests/etude/07-etude-setup-key-submit.spec.ts` asserting: (a) a valid key submission (e.g. `E-flat major`) results in a 303 redirect to `/etude/setup`, the form re-displays with the new key selected after reload, and the derived pitches update to the new key's spelling; (b) an unsupported key (e.g. `B major`) submitted bypassing native constraints results in a 303 redirect with a field error, no persistence, and no 500; (c) hostile-shape bodies (an empty key value, a repeated key field with two values, an extra unexpected field alongside a valid key) each resolve to a deterministic 303 redirect with a field-addressable error or a successful accept, never a 500, and never a silent fallback to the stored key; (d) resubmitting the identical key (and identical measures/meter/hands) does not increment the workflow version; (e) changing only the key clears the downstream confirmation state (observable later as the canonical route moving back, but at this stage asserted via the workflow version increment and no error).
**Depends on**: 8

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, Playwright for e2e, kebab-case filenames, `data-testid` naming, look at `e2e-tests/etude/05-etude-setup-submit.spec.ts` for the existing POST-submission pattern including the `postSetupViaBrowser` multipart helper that bypasses native constraints).

Create `e2e-tests/etude/07-etude-setup-key-submit.spec.ts` following the pattern in `e2e-tests/etude/05-etude-setup-submit.spec.ts`. Use `page.request.post` with `multipart` and `maxRedirects: 0` to bypass native HTML constraints. Assert: (a) submitting `key=E-flat major` with valid measures/meter/hands returns a 303 redirect to `/etude/setup`, and after following the redirect the key control shows `E-flat major` and the derived pitches show `E-flat` and `B-flat`; (b) submitting `key=B major` (unsupported, five sharps) returns a 303 redirect with an error and the stored key is unchanged after reload (no persistence, no 500); (c) submitting an empty `key` value returns a 303 redirect with a field-addressable error, the stored key is unchanged, and there is no 500 and no silent fallback to the stored or default key; (d) submitting `key` twice (repeated field) returns a deterministic 303 redirect with a field-addressable error and no 500; (e) submitting an extra unexpected field alongside a valid key does not affect the outcome for the expected fields; (f) resubmitting the identical values (same measures, meter, hands, key as stored) does not increment the workflow version (assert the hidden `workflowVersion` field value is unchanged after the redirect); (g) changing only the key (e.g. from `C major` to `A minor`) increments the workflow version and the form re-displays with the new key and its derived pitches. These tests must fail because the POST handler does not yet accept or validate a key field.

---

### 10. Implement the POST handler key validation and persistence

**Type**: GREEN
**Output**: `src/routes/build-etude.tsx` POST handler adds `key` to `SETUP_FIELD_SPEC`, wires key validation through the extended `validateSetup`, and persists the key via the extended `updateEtudeSetup`. Unsupported and hostile-shape key submissions are rejected with a field-addressable error and a 303 redirect, never a 500. Identical resubmissions do not increment the version. The task-9 e2e tests pass and the existing `05-etude-setup-submit.spec.ts` tests still pass.
**Depends on**: 9

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, Hono route style, `redirectWithMessage`/`redirectWithError` never `c.redirect`, `data-testid` naming). Read `Notes/skills/code-writing/production-code-control-comments` for the PRODUCTION comment convention.

Extend the POST handler in `src/routes/build-etude.tsx`: add `key: { type: 'string' }` to `SETUP_FIELD_SPEC` (no repeated-field normalization, so a repeated key field is a reject, matching the existing setup fields). Pass the parsed `raw.key` as the `keySignature` field to `validateSetup`. On validation failure, redirect with the first field-addressable error as before. On validation success, pass the validated `keySignature` through to `updateEtudeSetup` (which now handles persistence, key-change invalidation, and the identical-resubmit no-increment behavior). The existing measures/meter/hands flow is unchanged. Run the task-9 e2e tests and the existing `05-etude-setup-submit.spec.ts` tests to confirm they all pass.

---

### 11. Refactor the extended setup validator, repository, and form

**Type**: REFACTOR
**Output**: The extended setup validator, repository, and form are reviewed for duplication and cleanliness. The key field reuses the existing parameter-form pattern without special-casing. No behavior changes — all tests still pass.
**Depends on**: 10

Before refactoring, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (refactor only after tests pass, no behavior changes, arrow functions, explicit types, no `any`).

Review the changes from tasks 2, 4, 6, 8, and 10. Ensure the key field is wired through the same parameter-form pattern as measures/meter/hands with no special-casing in the route. Ensure the key-domain module's lookup table is readable and matches the PRD's supported-key list exactly. Ensure the repository's identical-resubmit detection covers all four fields and the key-change invalidation is clearly commented. Remove any dead code or duplicated logic introduced during the GREEN tasks. Run the full unit and e2e test suites to confirm no regressions.

---

### 12. Update wiki and notes documentation

**Type**: DOCUMENT
**Output**: `Notes/wiki/source-code.md` is updated with the new `src/lib/key-domain.ts` module and the extended `src/lib/setup-validator.ts`, `src/lib/etude-params-repository.ts`, and `src/routes/build-etude.tsx`. `Notes/wiki/unit-tests.md` is updated with `tests/key-domain.spec.ts` and the extended setup-validator and repository tests. `Notes/wiki/e2e-tests.md` is updated with the two new e2e spec files. `Notes/wiki/project-overview.md` is updated to mention key selection and pitch spelling. `Notes/wiki/log.md` gets a new entry. `Notes/wiki/index.md` is updated if needed.
**Depends on**: 10

Before writing documentation, read `Notes/wiki/AGENTS.md` and `Notes/wiki/wiki-rules.md` for the wiki conventions (ingest operation, kebab-case filenames, update `index.md` and append to `log.md` with the `## [YYYY-MM-DD] <operation> | <subject>` format).

Ingest the new and modified source files and tests into the wiki following the ingest operation: read each file, identify key takeaways, update the relevant category pages (`source-code.md`, `unit-tests.md`, `e2e-tests.md`, `project-overview.md`), and append an entry to `log.md`. Do not index anything under `node_modules`.

---

### 13. Generate a code walkthrough with showboat

**Type**: CODE WALKTHROUGH
**Output**: A walkthrough generated via `uvx showboat` placed under `Notes/walkthroughs/issue-006-key-selection-and-spelling/code-walkthrough/`. The walkthrough covers the key domain module, the extended setup validator, the repository key persistence and invalidation, the setup form key field and derived-pitch display, and the POST handler, with executable test runs as proof.
**Depends on**: 10

Run `uvx showboat --help` for usage details. Generate a walkthrough of the Issue 6 implementation covering: (1) the key domain catalog and pitch derivation, (2) the extended setup validator with the key field, (3) the repository key persistence and key-change invalidation with identical-resubmit detection, (4) the GET setup form key control and derived-pitch display, (5) the POST handler key validation and hostile-shape tolerance. Place the generated files in `Notes/walkthroughs/issue-006-key-selection-and-spelling/code-walkthrough/`.

---

### 14. Human review of the key catalog, pitch spelling, and cross-cutting contract

**Type**: REVIEW
**Output**: A human verifies the eighteen supported keys and their derived pitch spellings against the PRD's "Supported musical domain" section, confirms the key-signature spelling is correct for all flat and sharp keys, confirms natural-minor scales use natural minor (not harmonic or melodic), and cross-checks the cross-cutting contract section 6 applicability matrix row for Issue 6 (auth + no-cache, PRG 303, version token, safe redisplay, a11y errors, invalidation, epoch all inherited and tested).
**Depends on**: 13

The human should review: (a) the `SUPPORTED_KEYS` list in `src/lib/key-domain.ts` matches the PRD exactly; (b) the `deriveKeyPitches` lookup table produces correct key-signature spellings for every supported key, especially the flat keys (B-flat, E-flat, A-flat major; B, E, F-sharp, C-sharp, D, G, C, F minor) and sharp keys (G, D, A, E major; A, E minor); (c) natural-minor pitches match the natural minor scale; (d) the cross-cutting contract section 6 row for Issue 6 is satisfied — all inherited behaviours (auth + no-cache, PRG 303, version token, safe redisplay, a11y errors, invalidation, epoch) are present and tested; (e) the hostile-shape tolerance for the key field matches the parameter-form contract section 2 rule 5.

---
