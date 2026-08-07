# Issue 9: Form accessibility error summary — accessible labels, native constraints, and a focused error summary

*2026-08-07T01:23:42Z by Showboat 0.6.1*
<!-- showboat-id: aeb73f3b-eb81-4ea3-b3b1-ccc45ce524ea -->

This walkthrough covers the Issue 9 implementation: form accessibility with an accessible error summary, native HTML constraints, and programmatic focus on load. It walks through (1) the buildErrorSummaryEntries pure function with per-error unique anchors, dedupe, field-order ordering, and group-error routing, (2) the ErrorSummary TSX component with role='alert', aria-labelledby, tabindex=-1, and anchor links, (3) the focus-on-load inline script helper, (4) the setup-form wiring — summary rendering, instruction association via aria-describedby, unique error ids, the octaves group fieldset/aria-describedby wiring, and id uniqueness, and (5) the e2e accessibility assertions. Each section includes executable test runs as proof.

## 1. buildErrorSummaryEntries — pure entry-builder with unique anchors, dedupe, and group routing

The buildErrorSummaryEntries function (src/components/error-summary.tsx) is a pure arrow function that takes field-addressable errors, a field order list, and a group-field map, and produces an ordered array of ErrorSummaryEntry objects. Each entry has: an anchorId (unique per error, following the <field>-error-<index> pattern), a controlId (the target element id to focus), text (the error message), and isGroup (whether this is a group-level error). The function deduplicates identical error messages per field (emitting each distinct message once), orders entries by the field's visual appearance in the form (not by error array order), and routes group-field errors to the group's first member control id (e.g. octaves errors target octaves-field-2, the first checkbox).

```bash
bun test tests/error-summary.spec.ts 2>&1 | tail -5
```

```output

 12 pass
 0 fail
 40 expect() calls
Ran 12 tests across 1 file. [26.00ms]
```

## 2. ErrorSummary TSX component — role='alert', aria-labelledby, tabindex=-1, anchor links

The ErrorSummary component (src/components/error-summary.tsx) renders a <section> with role='alert', aria-labelledby pointing to the heading, tabindex=-1 (so it is programmatically focusable), data-testid='error-summary', and a DaisyUI alert class. Inside is an <h2> heading and an <ol> of <li> items, each containing an <a> link whose href resolves to the invalid control's id. When entries is empty, the component returns null — no error summary is rendered on a clean step. TSX contextual encoding escapes all error text, so no manual sanitization is needed. The component is shared so future parameter forms (Issues 6, 7, 13, 14, 16) can reuse it per the cross-cutting contract.

## 3. Focus-on-load inline script helper

The buildErrorSummaryFocusScript function (src/lib/error-summary-focus.ts) returns a minimal, server-rendered inline <script> string that resolves document.getElementById(summaryId) and, if present, calls .focus() on it. The script is guarded so it never throws when the summary is absent. It contains only the summary id and DOM focus logic — no field name, submitted value, or error text. This is the first and only client-side script in the project. Its SHA-256 hash is whitelisted in ALLOW_SCRIPTS_SECURE_HEADERS so the CSP permits its execution on the setup GET route.

```bash
bun test tests/error-summary-focus.spec.ts 2>&1 | tail -5
```

```output

 5 pass
 0 fail
 13 expect() calls
Ran 5 tests across 1 file. [17.00ms]
```

## 4. Setup-form wiring — summary rendering, instruction association, unique error ids, group fieldset

The renderEtudeSetupForm function in src/routes/build-etude.tsx wires the ErrorSummary, focus script, instruction association, and unique error ids into the setup form. When fieldErrors is non-empty, it calls buildErrorSummaryEntries with SETUP_FIELD_ORDER and SETUP_GROUP_FIELDS (the single source of truth for field ordering and group configuration), renders <ErrorSummary> above the form, and injects the focus script via Hono's raw() helper. Each control's aria-describedby references both its instructions element (e.g. measures-instructions) and its field-level error elements (e.g. measures-error-0). The octaves field is wrapped in a <fieldset> with a <legend>; a group-level octaves error targets the first member checkbox (octaves-field-2) and is associated with the fieldset via aria-describedby. The GET route uses ALLOW_SCRIPTS_SECURE_HEADERS so the CSP permits the focus script. Each field-level error element has a unique id following the <field>-error-<index> pattern, matching its summary entry's anchorId.

## 5. E2e accessibility assertions

The e2e test suite (e2e-tests/etude/11-etude-setup-error-summary.spec.ts) contains 10 Playwright tests verifying: (a) the error summary receives programmatic focus on load after an invalid submission, (b) each summary entry is a link whose href resolves to an existing control and following it moves focus there, (c) every form control has an accessible name, (d) bounded fields carry native HTML constraint attributes, (e) each field-level error element is programmatically associated with its control via aria-describedby, (f) the unique anchor pattern <field>-error-<index> supports multiple errors per field, (g) a group-level octaves error targets the first checkbox and is associated with the group, (h) all control ids on the page are unique, (i) no error summary renders when the submission is valid, and (j) multiple invalid fields produce ordered summary entries.

```bash
npx playwright test e2e-tests/etude/11-etude-setup-error-summary.spec.ts --reporter=line 2>&1 | tail -5
```

```output
Database sessions cleared successfully

Database cleared successfully

  10 passed (13.9s)
```

## 6. Full test suite verification

Run the complete etude e2e suite to confirm no regressions across all etude tests:

```bash
npx playwright test e2e-tests/etude/ --reporter=line 2>&1 | tail -5
```

```output
Database sessions cleared successfully

Database cleared successfully

  56 passed (1.1m)
```
