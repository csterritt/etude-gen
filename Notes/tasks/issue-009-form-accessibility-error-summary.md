# Tasks for #9: Accessible labels, native constraints, and a focused error summary

Parent issue: #9
Parent PRD: `Notes/PRD-etude-generator.md`

## Tasks

### 1. Write failing Bun tests for error-summary entry building

**Type**: RED
**Output**: A failing `tests/error-summary.spec.ts` that asserts `buildErrorSummaryEntries` produces one summary entry per error (each with a unique anchor id), dedupes duplicate error text for the same field (emitting each distinct message once), orders entries by the order the fields appear in the form, routes a group-level error to the group's first member control id and tags it as a group error, and returns an empty array when there are no field errors.
**Depends on**: none

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test` with `describe`/`it`/`expect`, arrow functions, explicit types, no `any`, kebab-case filenames, look at `tests/safe-redisplay.spec.ts` and `tests/setup-validator.spec.ts` for the pure-function test pattern). Read `Notes/skills/code-writing/typescript-rules` for the TypeScript conventions.

Create `tests/error-summary.spec.ts` importing from `bun:test` and from the not-yet-existing `src/components/error-summary.ts`. The tests must cover: (a) a single field error produces one entry whose `href` anchor targets that field's control id and whose `text` is the error message; (b) a field with two distinct errors produces two entries, each with a unique anchor id derived from the field name and the error index (not the same id), both linking to the same control; (c) a field with the same error message repeated twice produces only one entry for that message (duplicate text per field is emitted once); (d) entries are ordered by the order the fields appear in the form's field list, not by the order errors happen to appear in the `fieldErrors` array; (e) a group-level error (a field whose spec marks it as a group, e.g. `octaves`) produces an entry whose anchor targets the first member control id (e.g. `octaves-field-2`, the first checkbox) and whose entry is marked as a group error so the component can associate it with the group container rather than a single member; (f) an empty `fieldErrors` array produces an empty entries array. The function signature under test is `buildErrorSummaryEntries(fieldErrors: FieldError[], fieldOrder: string[], groupFields: Record<string, { firstMemberId: string }>): ErrorSummaryEntry[]` where `ErrorSummaryEntry` has `anchorId`, `controlId` (the target to focus), `text`, and `isGroup: boolean`. Import `FieldError` from `src/lib/safe-redisplay`. Assert on the structure and order of the returned entries — do not assert on rendered HTML. These tests must fail because the module does not exist yet.

---

### 2. Implement the shared ErrorSummary component

**Type**: GREEN
**Output**: `src/components/error-summary.tsx` exports `buildErrorSummaryEntries` (the pure function from task 1), the `ErrorSummaryEntry` interface, and an `ErrorSummary` TSX component that renders a `<section role="alert" aria-labelledby>` containing a heading and an ordered list of anchor links — one per entry — only when entries is non-empty (renders nothing when empty). The task-1 tests pass.
**Depends on**: 1

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, one export per file where practical, `data-testid` naming with kebab-case, `value` attribute for form inputs not `defaultValue`). Read `Notes/skills/code-writing/styling-html-and-tsx` for the HTML/TSX conventions (Tailwind/DaisyUI classes, contextual escaping) and `Notes/skills/code-writing/typescript-rules` for the TypeScript conventions. Look at `src/components/gated-sign-up-form.tsx` for the existing shared-component pattern and at `src/routes/build-layout.tsx` for the alert/role pattern.

Create `src/components/error-summary.tsx`. Implement `buildErrorSummaryEntries` as a pure arrow function per the task-1 spec: iterate `fieldErrors`, group by field, dedupe duplicate messages per field, assign each distinct (field, message) pair a unique `anchorId` derived from the field name and a per-field error index (e.g. `measures-error-0`, `measures-error-1`), order the resulting entries by the position of each field in `fieldOrder`, and for fields listed in `groupFields` set the entry's `controlId` to that group's `firstMemberId` and `isGroup` to `true` (single-field errors keep `controlId` equal to the field's control id and `isGroup` false). Then implement the `ErrorSummary` component as an arrow function taking `entries: ErrorSummaryEntry[]` and an optional `headingId` (default `'error-summary-heading'`) and `summaryId` (default `'error-summary'`): when `entries` is empty, return `null`; otherwise render a `<section>` with `id={summaryId}`, `role="alert"`, `aria-labelledby={headingId}`, `tabindex={-1}` (so it is programmatically focusable), `data-testid='error-summary'`, and a DaisyUI `alert alert-error` class; inside, an `<h2 id={headingId}>` with corrective heading text, and an `<ol>` whose `<li>` items each contain an `<a href={`#${controlId}`}>` linking to the offending control with the error text as the link content. For group entries, add `data-testid='error-summary-group'` and `aria-label` indicating the group. TSX contextual encoding escapes all error text — no manual sanitization. Run the task-1 tests to confirm they pass.

---

### 3. Write failing Bun tests for the focus-on-load script helper

**Type**: RED
**Output**: A failing `tests/error-summary-focus.spec.ts` that asserts `buildErrorSummaryFocusScript(summaryId)` returns a string containing a guarded inline script that locates the element by the given id and calls `.focus()` on it, and that the script is safe to include unconditionally (guards against a missing element so it never throws on a page without the summary).
**Depends on**: none

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, arrow functions, explicit types, no `any`, kebab-case filenames). Look at `tests/safe-redisplay.spec.ts` for the pure-function test pattern.

Create `tests/error-summary-focus.spec.ts` importing from `bun:test` and from the not-yet-existing `src/lib/error-summary-focus.ts`. The tests must cover: (a) `buildErrorSummaryFocusScript('error-summary')` returns a string that begins with `<script` and ends with `</script>`; (b) the string contains `document.getElementById('error-summary')` (the id is interpolated, not hardcoded — test with a second id to confirm); (c) the string contains a `.focus()` call on the resolved element; (d) the script body guards against the element being null or undefined so it cannot throw on a page where the summary is absent (e.g. an `if (... ) { ... .focus() }` or optional-chaining pattern); (e) the script does not reference any field name, submitted value, or error text — only the summary id. Assert on the returned string's contents. These tests must fail because the module does not exist yet.

---

### 4. Implement the focus-on-load script helper

**Type**: GREEN
**Output**: `src/lib/error-summary-focus.ts` exports `buildErrorSummaryFocusScript(summaryId: string): string` returning a guarded inline `<script>` that focuses the error summary by id. The task-3 tests pass.
**Depends on**: 3

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, one export per file where practical). Read `Notes/skills/code-writing/production-code-control-comments` for the PRODUCTION comment convention.

Create `src/lib/error-summary-focus.ts` exporting `buildErrorSummaryFocusScript` as an arrow function that takes a `summaryId` string and returns a single inline `<script>` string. The script must resolve `document.getElementById(summaryId)` and, if present, call `.focus()` on it — wrapped in a null guard so it never throws when the summary is absent. The script must contain only the summary id and no submitted value, field name, or error text. This is the first and only client-side script in the project; it is a minimal, server-rendered inline script whose sole purpose is to move focus to the error summary after an invalid submission reload, as required by the issue's acceptance criteria. Run the task-3 tests to confirm they pass.

---

### 5. Write failing Playwright e2e tests for the setup-step error summary and accessibility

**Type**: RED
**Output**: A failing `e2e-tests/etude/11-etude-setup-error-summary.spec.ts` asserting: after an invalid submission the focused element is the error summary (`data-testid='error-summary'`); each summary entry is a link whose `href` resolves to an existing control on the page and following it moves focus to that control; every form control has an accessible name (label or aria-label); the measures control carries `min`, `max`, `step`, and `required` attributes and the selects carry `required`; each field-level error element is programmatically associated with its control via `aria-describedby`; a field with two errors produces two summary entries with unique anchors; a group-level (octaves) error's summary entry links to the first octave checkbox and is associated with the group; all control ids on the page are unique; and no `error-summary` element renders when the submission is valid.
**Depends on**: 2, 4

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (Playwright tests, `testWithDatabase` helper, `signInUser` and `navigateToHome` from `e2e-tests/support/`, `data-testid` naming with kebab-case, look at `e2e-tests/etude/10-etude-setup-invalid-redisplay.spec.ts` for the `postSetupViaBrowser` and `submitInvalidAndCaptureNonce` patterns and `e2e-tests/support/finders.ts` and `e2e-tests/support/page-verifiers.ts` for helpers).

Create `e2e-tests/etude/11-etude-setup-error-summary.spec.ts` importing from `@playwright/test` and the support helpers. The tests must cover: (a) submit an invalid measures value (33) alongside valid meter/hands/key via `submitInvalidAndCaptureNonce`, follow the redirect to `/etude/setup`, and assert `page.getByTestId('error-summary')` is visible and `await page.evaluate(() => document.activeElement?.id)` equals `error-summary` (focus landed on the summary); (b) assert each `<a>` inside the summary has an `href` beginning with `#` and that the target id exists on the page, and that activating a link moves `document.activeElement` to the linked control; (c) for each control (`measures-field`, `meter-field`, `hands-field`, `key-field`, each `octaves-field-<n>`), assert it has an accessible name — either a `<label htmlFor>` pointing at it or an `aria-label` — using `page.getByRole(...)` resolution or `accessibility.snapshot()`; (d) assert the measures input has `min="4"`, `max="32"`, `step="1"`, and `required`, and the meter/hands/key selects have `required`; (e) assert each field-level error element's id is referenced by its control's `aria-describedby`; (f) submit a payload that produces two errors on the same field (e.g. an empty measures value that fails both "required" and "range" — adjust to whatever the validator emits) and assert the summary contains two entries for that field with distinct `href` anchors; (g) submit an invalid octaves selection (e.g. zero octaves) and assert the summary entry's `href` points to the first octave checkbox id (`octaves-field-2`) and the group container is associated with the error (e.g. the group `<fieldset>` or container has `aria-describedby` or `aria-invalid`); (h) collect every `id` attribute on the page and assert there are no duplicates; (i) submit a fully valid setup and assert `page.getByTestId('error-summary')` has count 0 (no summary rendered when there are no errors). Use `data-testid` attributes for any new elements. These tests must fail because the ErrorSummary is not yet wired into the form and focus is not yet managed.

---

### 6. Wire the ErrorSummary, focus, instruction association, and id uniqueness into the setup form

**Type**: GREEN
**Output**: `renderEtudeSetupForm` in `src/routes/build-etude.tsx` renders `<ErrorSummary>` above the form when `fieldErrors` is non-empty, includes the focus script from task 4, adds `tabindex={-1}` to the summary (already in the component), associates each instruction `<p>` with its control via `aria-describedby`, fixes the field-error id collision so each error has a unique id, wires group-level errors for octaves to the first checkbox and the group container, and ensures every control id on the page is stable and unique. The task-5 e2e tests pass.
**Depends on**: 5

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, TSX rendering with contextual escaping, `data-testid` naming with kebab-case, `value` attribute for form inputs not `defaultValue`). Read `Notes/skills/code-writing/styling-html-and-tsx` for the HTML/TSX conventions and `Notes/skills/code-writing/production-code-control-comments` for the PRODUCTION comment convention.

Modify `src/routes/build-etude.tsx`: in `renderEtudeSetupForm`, when `fieldErrors` is non-empty, call `buildErrorSummaryEntries(fieldErrors, ['measures', 'meter', 'hands', 'key', 'octaves'], { octaves: { firstMemberId: 'octaves-field-2' } })` and render `<ErrorSummary entries={...} />` immediately above the `<form>` (inside the card body, before the form). Inject the focus script by rendering `{dangerouslySetInnerHTML` isn't needed — render the script string from `buildErrorSummaryFocusScript('error-summary')` inside a `<script>` element via Hono's JSX raw helper or by returning it as a string child; follow whatever pattern the renderer supports for inline scripts (the renderer in `src/renderer.tsx` renders a full HTML document, so a `<script>` tag in the body is valid). Update each field's instruction `<p>` to carry an `id` (e.g. `measures-instructions`) and add that id to the control's `aria-describedby` alongside the error id (combine multiple ids with a space). Replace the existing `renderFieldError` so each error gets a unique id matching its summary anchor (e.g. `measures-error-0`, `measures-error-1`) rather than the colliding `measures-error`; update the control's `aria-describedby` to reference the specific error id(s) for that field. For the octaves group: wrap the checkboxes in a `<fieldset>` with a `<legend>` (or a `<div role="group" aria-labelledby="octaves-group-label">`) so the group has an accessible name, give the group container `aria-describedby` pointing at the octaves error id when present, and ensure the first checkbox id (`octaves-field-2`) is stable (it already is — ids are derived from the octave value, not the index). Confirm every control id on the page is unique across renders for the same value. Run the task-5 e2e tests to confirm they pass.

---

### 7. Refactor the error-summary wiring

**Type**: REFACTOR
**Output**: No duplicated error-display logic between `renderFieldError` and `ErrorSummary`; the field-order and group-field configuration is defined once and shared; `tsc --noEmit` reports zero errors in any file created or modified for this issue; the full Bun unit suite and the Playwright e2e suite pass.
**Depends on**: 6

Read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md`. Search `src/routes/`, `src/components/`, `src/lib/`, and `tests/` for any duplicated error-id derivation, duplicated field-order lists, or inline error rendering that should live in `src/components/error-summary.tsx`. Move any such logic behind the component or a shared constant. Ensure the field-order and group-field configuration used by `buildErrorSummaryEntries` is defined in one place and imported where needed, not duplicated between the route and the tests. Run `tsc --noEmit`, the full `bun test` suite, and `npx playwright test` and confirm they are green. Do not modify the parent issue, the parent PRD, or prior task/issue/walkthrough files in `Notes/`.

---

### 8. Update wiki and notes documentation

**Type**: DOCUMENT
**Output**: Wiki and Notes updates describing the new `src/components/error-summary.tsx` shared component, `src/lib/error-summary-focus.ts`, the changes to `src/routes/build-etude.tsx` (ErrorSummary rendering, focus script, instruction association, group-level error wiring, unique error ids), and the new test files. Follow `Notes/wiki/wiki-rules.md` and `Notes/wiki/AGENTS.md` for the wiki ingest operation.
**Depends on**: 7

Before writing documentation, read `Notes/wiki/AGENTS.md` and `Notes/wiki/wiki-rules.md` for the wiki conventions (ingest operation, kebab-case filenames, update `index.md` and append to `log.md` with the `## [YYYY-MM-DD] <operation> | <subject>` format).

Update the relevant wiki pages: `Notes/wiki/source-code.md` (add `src/components/error-summary.tsx`, `src/lib/error-summary-focus.ts`, and the changed `src/routes/build-etude.tsx`), `Notes/wiki/e2e-tests.md` (catalog `e2e-tests/etude/11-etude-setup-error-summary.spec.ts`), `Notes/wiki/unit-tests.md` (catalog `tests/error-summary.spec.ts` and `tests/error-summary-focus.spec.ts`), `Notes/wiki/project-overview.md` (describe the shared accessible error summary pattern, the focus-on-load inline script, the per-error unique anchor ids, the group-level error wiring, and how this issue establishes the accessible-error contract inherited by Issues 6, 7, 13, 14, and 16), and `Notes/wiki/index.md` if new sections are added. Append a `## [YYYY-MM-DD] ingest | issue-009 form accessibility error summary` entry to `Notes/wiki/log.md`. Do not modify the parent issue or the parent PRD.

---

### 9. Code walkthrough

**Type**: CODE WALKTHROUGH
**Output**: `Notes/walkthroughs/issue-009-form-accessibility-error-summary/code-walkthrough/` containing the files generated by `uvx showboat` for this implementation.
**Depends on**: 8

Run `uvx showboat --help` for current usage, then generate a walkthrough of the issue-009 implementation into a new directory `Notes/walkthroughs/issue-009-form-accessibility-error-summary/code-walkthrough/`. The walkthrough should cover: (1) the `buildErrorSummaryEntries` pure function with per-error unique anchors, dedupe, field-order ordering, and group-error routing, (2) the `ErrorSummary` TSX component with `role="alert"`, `aria-labelledby`, `tabindex=-1`, and anchor links, (3) the focus-on-load inline script helper, (4) the setup-form wiring — summary rendering, instruction association via `aria-describedby`, unique error ids, the octaves group `<fieldset>`/`aria-describedby` wiring, and id uniqueness, and (5) the e2e accessibility assertions. Place all generated files there.

---

### 10. Human review against the PRD and cross-cutting contract

**Type**: REVIEW
**Output**: A human verifies the implementation against the PRD's "Validation, errors, logging, and accessibility" sections, the issue's "Identifier and multi-error rules" and "How to verify" sections, cross-cutting contract §1 (universal route requirements), §2 (parameter-form contract: rows 3 and 4 — error summary focused on redisplay, native constraints with independent server enforcement), and §6 (applicability matrix row for Issue 9), confirming every acceptance criterion in the parent issue is met.
**Depends on**: 9

This is a human-in-the-loop step. The human must verify: (a) an invalid submission reloads the step with the error summary receiving programmatic focus; (b) each summary entry is a link that moves focus to the control it describes when activated; (c) every form control has a programmatic label and its instructions are associated with it; (d) bounded fields carry the matching native HTML constraint and the server still enforces it independently; (e) error messages are announced through semantic status/alert behavior (`role="alert"` on the summary and on field errors); (f) every control id is unique and stable across renders for the same value; (g) a field with more than one error produces separately anchored summary entries with no duplicated error text; (h) a group-level error's summary entry moves focus into the group and the error is associated with the group rather than a single member; (i) a submission with no errors renders no error summary element at all. Record the result in the review notes. Do not modify the parent issue or the parent PRD.

---
