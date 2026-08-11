# Issue 17: Read-only step summaries and Back links

*2026-08-11T18:00:00Z by Showboat 0.6.1*
<!-- showboat-id: b2c3d4e5-6789-01ab-cdef-234567890abc -->

This walkthrough covers the Issue 17 implementation: read-only summaries of prior answers and canonical Back links on every later step of the etude workflow. It walks through (1) the `deriveStepSummary` pure model builder, (2) the shared `EtudeSummary` presentational component, (3) the notes-step summary and Back link wiring, (4) the split-step summary and Back link wiring, and (5) the stub `GET /etude/review` route with its summary and Back link. Each section includes executable test runs as proof.

## 1. deriveStepSummary pure model builder

```bash
cd /home/chris/etude-gen && bun test tests/etude-summary.spec.ts 2>&1 | tail -5
```

```output
  16 pass
  0 fail
  60 expect() calls
Ran 16 tests across 1 file. [33.00ms]
```

The `deriveStepSummary(params, step)` pure function (`src/lib/etude-summary.ts`) reads the owner's committed aggregate snapshot and returns a `StepSummary` carrying exactly the fields confirmed at or before the requested step level. The function is level-aware:

- A `'notes'` summary carries only the setup fields (measures, meter, key, octaves, hand).
- A `'split'` summary adds the notes fields (selected pitches, selected durations).
- A `'review'` summary adds the split fields (boundary, left/right hand pitch sets) when a boundary applies.

Fields beyond the requested level are absent from the model (not null) so the component omits them from the DOM entirely. The split boundary and hand pitch sets are omitted when fewer than two pitches are selected or when no boundary applies (one-hand mode at the review level). The function never re-derives available pitches, offerable durations, or eligible boundaries — those derivations belong to the form routes. It accepts a structural `SummaryParams` subset of `EtudeParams` so routes can pass their own minimal interface without importing the full domain type. The 16-test suite proves: notes/split/review level field inclusion and omission, one-hand and two-hand review behavior, purity (no mutation, no throws on empty aggregate), and catalog-driven offerable filtering using the real packaged rhythm catalog.

## 2. EtudeSummary presentational component

The `EtudeSummary` component (`src/components/etude-summary.tsx`) calls `deriveStepSummary` and renders a `<section data-testid="etude-summary">` containing a `<dl>` of labeled values, one per summary field. Each value is rendered as text only — no `input`, `select`, `textarea`, or `button` elements — so the summary is never editable. Each row carries a stable `data-testid` (`summary-measures`, `summary-meter`, `summary-key`, `summary-octaves`, `summary-hands`, `summary-pitches`, `summary-durations`, `summary-split-boundary`, `summary-left-hand-pitches`, `summary-right-hand-pitches`). Pitch lists are comma-separated phrases; duration tokens are rendered via their `DURATION_LABELS` display labels (never raw tokens); the octave range is rendered as `min` or `min–max`. The component reveals no internal identifiers (no aggregate id, no workflow version, no epoch) and asserts no ownership from request input (cross-cutting contract section 1).

## 3. Notes-step summary and Back link

```bash
cd /home/chris/etude-gen && LD_LIBRARY_PATH="/tmp/libgbm-local/usr/lib/aarch64-linux-gnu:$LD_LIBRARY_PATH" npx playwright test e2e-tests/etude/21-etude-notes-summary-back-link.spec.ts --reporter=line 2>&1 | tail -3
```

```output
  5 passed (7.1s)
```

The notes route (`src/routes/build-etude-notes.tsx`) renders the `EtudeSummary` (notes level) above the form, showing the setup answers as read-only text. A Back link anchor (`data-testid="notes-back-action"`) issues a GET to `/etude/setup`; following it lands on the setup step and discards any unsaved edits on the notes page. The 5-test suite proves: the summary is present with no editable controls, the summary values match the saved state, the Back link is an anchor to `/etude/setup`, unsaved edits are discarded after following Back, and the summary reflects new values after an upstream setup change.

## 4. Split-step summary and Back link

```bash
cd /home/chris/etude-gen && LD_LIBRARY_PATH="/tmp/libgbm-local/usr/lib/aarch64-linux-gnu:$LD_LIBRARY_PATH" npx playwright test e2e-tests/etude/22-etude-split-summary-back-link.spec.ts --reporter=line 2>&1 | tail -3
```

```output
  5 passed (9.8s)
```

The split route (`src/routes/build-etude-split.tsx`) renders the `EtudeSummary` (split level) above the form, showing both setup and notes answers as read-only text. A Back link anchor (`data-testid="split-back-action"`) issues a GET to `/etude/notes`; following it lands on the notes step and discards any unsaved split edits. The 5-test suite proves: the summary shows setup and notes fields with no editable controls, pitches and durations appear together, the summary values match the saved state, the Back link is an anchor to `/etude/notes`, and unsaved split edits are discarded after following Back.

## 5. Stub review route with summary and Back link

```bash
cd /home/chris/etude-gen && LD_LIBRARY_PATH="/tmp/libgbm-local/usr/lib/aarch64-linux-gnu:$LD_LIBRARY_PATH" npx playwright test e2e-tests/etude/23-etude-review-summary-back-link.spec.ts --reporter=line 2>&1 | tail -3
```

```output
  6 passed (10.2s)
```

The stub review route (`src/routes/build-etude-review.tsx`) renders the `EtudeSummary` (review level) showing every earlier answer, plus a canonical Back link. For two-hand mode the Back link targets `/etude/split`; for one-hand mode it targets `/etude/notes`. A direct GET to `/etude/review` when review is not reachable redirects 303 to the canonical route resolved by `resolveCanonicalRoute` (cross-cutting contract section 5). This is a stub: it renders only the summary and Back link and defines no POST handler. Issue 19 will replace it with the full review step (Generate form, etc.). The 6-test suite proves: two-hand summary with boundary and hand pitch sets, two-hand Back link to `/etude/split`, one-hand summary without boundary fields, one-hand Back link to `/etude/notes`, redirect when prerequisites are unmet, and summary values match the saved state.

## Full e2e suite for Issue 17

```bash
cd /home/chris/etude-gen && LD_LIBRARY_PATH="/tmp/libgbm-local/usr/lib/aarch64-linux-gnu:$LD_LIBRARY_PATH" npx playwright test e2e-tests/etude/21-etude-notes-summary-back-link.spec.ts e2e-tests/etude/22-etude-split-summary-back-link.spec.ts e2e-tests/etude/23-etude-review-summary-back-link.spec.ts --reporter=line 2>&1 | tail -3
```

```output
  16 passed (28.4s)
```

All 16 e2e tests for Issue 17 pass, alongside the 16 unit tests for `deriveStepSummary`. The full etude e2e suite (118 tests) also passes, confirming no regressions in the existing notes, split, or setup routes.
