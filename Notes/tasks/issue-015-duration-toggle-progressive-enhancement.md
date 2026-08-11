# Tasks for #15: Progressive enhancement for duration toggles and Select all

Parent issue: #15
Parent PRD: `Notes/PRD-etude-generator.md`

## Tasks

### 1. Bun unit tests for the pure disabled-set algorithm

**Type**: RED  
**Output**: A file in `tests/` (using `bun:test`) with failing tests for a pure `computeDisabledDurations` function.  
**Depends on**: none

Before implementing, read and follow the coding standards in `Notes/skills/AGENTS.md` (in particular the `code-writing/` skills: `always-do-red-green`, `typescript-rules`, `comment-writing`, and `running-tests`).

Write Bun tests in the `tests` directory for a pure function `computeDisabledDurations(selectedTokens, meterPatterns)` that returns the duration tokens whose deselection from `selectedTokens` would leave no eligible complete-measure pattern. A pattern is eligible when every token it contains is in the selected set. Cover: a selection where removing one token eliminates all eligible patterns (that token is disabled); a selection where every token can be removed while leaving at least one eligible pattern (empty disabled set); the single-selected case (removing the only selected token leaves the empty set, which has no eligible pattern, so it is disabled); a multi-token selection where more than one token is required; and deterministic ordering of the returned tokens. The function must be pure: it must not mutate its arguments and must not throw. Mirror the existing test style in `tests/` for `duration-selection-validator` and `rhythm-catalog`. Do not implement the function yet — the tests must fail.

---

### 2. Implement `src/lib/duration-disabled-set.ts`

**Type**: GREEN  
**Output**: `src/lib/duration-disabled-set.ts` exports `computeDisabledDurations`; the Bun tests from task 1 pass.  
**Depends on**: 1

Before implementing, read and follow the coding standards in `Notes/skills/AGENTS.md` (in particular `code-writing/typescript-rules`, `code-writing/comment-writing`, and `code-writing/always-do-red-green`).

Implement the minimal pure module `src/lib/duration-disabled-set.ts` exporting `computeDisabledDurations(selectedTokens: ReadonlySet<string>, meterPatterns: ReadonlyArray<ReadonlyArray<string>>): string[]`. For each token in `selectedTokens`, test whether the set minus that token still admits at least one eligible pattern (a pattern whose every token is in the reduced set); if not, the token is in the disabled set. Return the disabled tokens in a deterministic, canonical order (reuse `CANONICAL_DURATION_ORDER` from `src/lib/duration-selection-validator.ts`). Do not mutate the inputs. Do not import the catalog parser — the caller supplies the patterns, so the module stays free of catalog I/O. Run the Bun tests and confirm they pass.

---

### 3. Playwright tests (JS enabled) for disabled-toggle aria behavior

**Type**: RED  
**Output**: A spec in `e2e-tests/etude/` whose assertions fail until the enhancement exists.  
**Depends on**: 2

Before implementing, read and follow the coding standards in `Notes/skills/AGENTS.md` (in particular `code-writing/running-tests` and the `AGENTS.md` rule on `data-testid` naming and the `e2e-tests/support` and `e2e-tests/sign-in` helpers).

Write a Playwright spec in `e2e-tests/etude/` that signs in, completes setup and the pitch step, and reaches `/etude/notes` with scripting enabled. Assert: after deselecting durations until only one eligible pattern remains, the duration toggles whose deselection would eliminate every eligible rhythm are marked with `aria-disabled="true"` and are NOT given the native `disabled` attribute; each such toggle remains focusable (can receive focus via keyboard) and stays in the accessibility tree; each such toggle's `aria-describedby` resolves to a visible, programmatically-associated reason element (not a `title` attribute, not colour alone); the disabled set is already correct on first paint before any interaction (derive a meter/selection where the server-rendered default already has a required toggle and assert it is marked on load); and when a toggle enters or leaves the disabled state the change is announced through a polite live region (assert the live region exists with `aria-live="polite"` and its text updates on a state change). Use the existing helpers in `e2e-tests/support` and mirror the structure of `16-etude-notes-duration-selection.spec.ts`. These tests must fail against the current code.

---

### 4. Playwright tests for Select all (no reload), init-failure, and scripted bypass

**Type**: RED  
**Output**: A spec in `e2e-tests/etude/` whose assertions fail until the enhancement exists.  
**Depends on**: 2

Before implementing, read and follow the coding standards in `Notes/skills/AGENTS.md` (in particular `code-writing/running-tests` and the `data-testid` and support-helper rules).

Write a Playwright spec in `e2e-tests/etude/` covering three concerns with scripting enabled. (a) Select all: click the `notes-select-all-action` control and assert every pitch checkbox becomes selected without a page reload (assert the URL does not change to a POST redirect and no server round trip occurs, e.g. by asserting the page object stays on `/etude/notes` and the checkboxes update in place). (b) Init failure: simulate an enhancement initialization failure (for example by making the embedded pattern data malformed/absent so the script's guarded init path runs) and assert every duration toggle stays fully usable — none carry `aria-disabled` and deselection is not suppressed. (c) Scripted bypass: with the enhancement active, forcibly re-enable and uncheck a disabled toggle to produce an impossible set, submit the form, and assert the Issue 14 server rejection is returned (the corrective guidance message and no persistence). Mirror the POST helpers in `16-etude-notes-duration-selection.spec.ts`. These tests must fail against the current code (except the bypass assertion, which should already pass).

---

### 5. Playwright tests (JS disabled) confirming the no-script path is unchanged

**Type**: RED  
**Output**: A spec in `e2e-tests/etude/` locking in the no-script guarantee.  
**Depends on**: 2

Before implementing, read and follow the coding standards in `Notes/skills/AGENTS.md` (in particular `code-writing/running-tests` and the support-helper rules).

Write a Playwright spec in `e2e-tests/etude/` that loads `/etude/notes` with JavaScript disabled (use a Playwright context with scripting disabled, following the project's existing no-script test patterns). Assert: every duration toggle is usable (no `aria-disabled`, no native `disabled`, deselection submits normally); submitting an impossible duration set hits the Issue 14 server rejection with the corrective guidance and the submitted selection redisplayed; and Select all works through the server (it persists the full pitch set and reloads). This locks in the guarantee that the enhancement is strictly additive. Some assertions may already pass against the current code; write them anyway so the no-script contract is regression-protected.

---

### 6. Server rendering changes for the enhancement hooks

**Type**: GREEN  
**Output**: `src/routes/build-etude-notes.tsx` embeds the current meter's catalog patterns as JSON, renders per-toggle reason-text elements, a polite live region, and the data hooks the client reads, and references the enhancement script; the no-script markup and POST behavior are unchanged.  
**Depends on**: 2, 3, 4, 5

Before implementing, read and follow the coding standards in `Notes/skills/AGENTS.md` (in particular `code-writing/typescript-rules`, `code-writing/styling-html-and-tsx`, `code-writing/web-behavior`, `code-writing/production-code-control-comments`, and the `AGENTS.md` rules on `data-testid`, redirects, and form submission).

Modify `src/routes/build-etude-notes.tsx` to add the minimal server-rendered hooks the enhancement needs, without changing any POST behavior or any no-script-visible control behavior. Specifically: embed the current meter's catalog patterns (the parsed patterns for `params.timeSignature`) as a JSON blob in a `<script type="application/json" id="...">` block or a `data-` attribute on the form (a non-executing data block, so no new CSP script hash is needed); render a per-duration reason-text element (initially empty/hidden) whose id the client will reference via `aria-describedby`; render a polite live region (`aria-live="polite"`) for state-change announcements; add stable `data-testid` and id hooks the client script will query; and add a `<script src="...">` tag referencing the enhancement asset in `public/` (the CSP `scriptSrc` already allows `'self'`, so no CSP change is required for an external file — confirm this rather than adding an inline hash). Keep the existing `data-testid` names (`duration-field-<token>`, `notes-select-all-action`, `notes-save-action`) unchanged. Do not add any client-side validation authority: the server POST handler and its rejection logic from Issue 14 must remain the only guard. Run the Playwright suite and confirm tasks 3–5 still fail in their enhancement-specific assertions (the hooks are present but inert without the client script).

---

### 7. Client enhancement script `public/notes-enhancement.js`

**Type**: GREEN  
**Output**: `public/notes-enhancement.js` implements the enhancement; the Playwright specs from tasks 3, 4, and 5 pass.  
**Depends on**: 6

Before implementing, read and follow the coding standards in `Notes/skills/AGENTS.md` (in particular `code-writing/web-behavior`, `code-writing/typescript-rules` as applicable to client code, and the rule that client-side code requires the explicit permission granted by this issue).

Write a self-contained, guarded script at `public/notes-enhancement.js` (served as a static asset via the Workers ASSETS binding; CSP `scriptSrc 'self'` permits it). The script must: read the embedded meter patterns JSON and the server-rendered checked state from the DOM; on first paint, before any interaction, compute the disabled set using the same algorithm as `src/lib/duration-disabled-set.ts` (mirror that pure logic — keep the two in sync) and mark each disabled toggle with `aria-disabled="true"` (never the native `disabled` attribute), wire its `aria-describedby` to its visible reason-text element, and write the reason text; suppress deselection of an `aria-disabled` toggle by intercepting the change/click and keeping the checkbox checked; update the disabled set and the live region's text whenever the selection changes (announcing toggles that enter or leave the disabled state through the polite live region); handle Select all by checking every pitch checkbox in place and preventing the form submission (no server round trip), leaving Save notes as the persistence path; and fail gracefully — wrap initialization in a try/catch so that on any error no toggle is marked or suppressed and every control stays fully usable. The script must add no client-side authority over validation, ownership, or persisted state; it only suppresses impossible deselections and enhances Select all. Run the full Playwright suite and confirm tasks 3, 4, and 5 now pass.

---

### 8. Tighten and verify additivity

**Type**: REFACTOR  
**Output**: A review pass confirming the enhancement is strictly additive and adds no client-side authority; no behavior change.  
**Depends on**: 7

Re-read the implementation against the issue's acceptance criteria. Verify: the no-script path is behaviorally equivalent to before the enhancement (no new required attributes, no removed controls, no changed POST semantics); the enhancement never sets the native `disabled` attribute; reason text is conveyed only via `aria-describedby` to visible text (never `title`, never colour alone); state changes are announced only through the polite live region; the disabled set is computed on first paint from server-rendered state; init failure leaves every toggle usable; and the server rejection from Issue 14 remains the only guard against an impossible set. Consolidate any duplicated logic or dead hooks introduced during GREEN, without changing behavior. Re-run the Bun and Playwright suites and confirm everything still passes.

---

### 9. Document the enhancement

**Type**: DOCUMENT  
**Output**: A wiki/notes update describing the enhancement, its scope, build/serving approach, and the no-script guarantee.  
**Depends on**: 8

Read `Notes/wiki/wiki-rules.md` and follow it. Document the duration-toggle progressive enhancement and the Select all enhancement in the appropriate wiki location: what they do, that they are strictly additive, how the client script is built and served (a static asset in `public/` served via the Workers ASSETS binding under the existing `scriptSrc 'self'` CSP), the embedded-patterns data block, the graceful-init-failure guarantee, and that server-side validation from Issue 14 remains authoritative. Do not modify the parent issue or the parent PRD.

---

### 10. Code walkthrough

**Type**: CODE WALKTHROUGH  
**Output**: `Notes/walkthroughs/issue-015/code-walkthrough/` containing the showboat-generated walkthrough.  
**Depends on**: 8

Run `uvx showboat --help` for usage, then generate a code walkthrough of the implementation. Create a new directory `Notes/walkthroughs/issue-015/code-walkthrough` and place all files showboat generates there. The walkthrough should cover the pure disabled-set module, the server-rendered hooks in `build-etude-notes.tsx`, and the client enhancement script.

---

### 11. Human decision (HITL gate)

**Type**: REVIEW  
**Output**: Reviewer sign-off confirming the enhancement's scope, build/serving approach, strict additivity, and that no client-side authority was added over validation, ownership, or persisted state.  
**Depends on**: 9, 10

This issue is HITL because the project's coding rules require explicit permission before any client-side code. Before the work is considered done, a human reviewer must confirm: the enhancement stays within the single approved progressive-enhancement decision; the build/serving approach (static asset in `public/` under `scriptSrc 'self'`, embedded patterns as a non-executing JSON data block) is acceptable; the enhancement is strictly additive and the no-script path is unchanged; and no client-side authority over validation, ownership, or persisted state was introduced. Do not modify the parent issue or the parent PRD.

---
