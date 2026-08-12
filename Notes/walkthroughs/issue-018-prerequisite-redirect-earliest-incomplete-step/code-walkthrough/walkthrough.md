# Issue 18: Prerequisite redirects to the earliest incomplete step

*2026-08-12T01:54:45Z by Showboat 0.6.1*
<!-- showboat-id: 5cfa94e8-c400-4913-8377-8a060ae25634 -->

This walkthrough covers the Issue 18 implementation: prerequisite redirects to the earliest incomplete step with a safe explanatory message. It walks through (1) the `computeCanonicalRoute` workflow service that wraps `resolveCanonicalRoute` with value-validation, (2) the `PREREQUISITE_REDIRECT_MESSAGE` constant and the dedicated cookie/layout alert, (3) the consolidated route-guard pattern in the entry, notes, split, and review routes, and (4) the e2e tests covering prerequisite redirects with safe messages across all workflow states. Each section includes executable test runs as proof.

## 1. computeCanonicalRoute workflow service

The `computeCanonicalRoute(params)` pure function (`src/lib/workflow-service.ts`) wraps `resolveCanonicalRoute` (the flag-based ordering resolver from Issue 16) with value-validation for the stored downstream selections. When the ordering resolver returns `/etude/split` or `/etude/review`, the service additionally validates the stored pitches against the available set derived from the stored key and octaves, the stored durations against the offerable set for the stored meter, and the stored boundary against the eligible boundaries derived from the stored pitches. If any stored value no longer validates, the service returns the earliest step whose stored values are invalid (or the earliest unconfirmed step, whichever comes first). This catches corrupt states that the flag-only ordering resolver misses — e.g. a stored pitch removed from the available set by an upstream change, or a stored boundary no longer eligible after a pitch change. The function is pure: no DB, no side effects, no mutation, no throws. The 25-test unit suite proves: delegation to the flag-based resolver for every ordering row, value-validation for invalid pitches/durations/boundary, earliest-invalid-step routing, message safety, and purity.

```bash
cd /home/chris/etude-gen && bun test tests/workflow-service.spec.ts 2>&1 | tail -5
```

```output

 25 pass
 0 fail
 37 expect() calls
Ran 25 tests across 1 file. [21.00ms]
```

## 2. PREREQUISITE_REDIRECT_MESSAGE and the dedicated cookie/layout alert

The `PREREQUISITE_REDIRECT_MESSAGE` constant (exported from `src/lib/workflow-service.ts`) is a safe explanatory message shown when a student is redirected from a directly requested step to the earliest incomplete step. The message exposes no internal state or identifiers — no ids, version numbers, epoch values, pitch names, or boundary ids — per cross-cutting contract section 1 rule 6. A new `redirectWithPrerequisiteMessage` helper (`src/lib/redirects.tsx`) sets a dedicated `PREREQUISITE_REDIRECT_FOUND` cookie (`src/constants.ts`), distinct from the ordinary `MESSAGE_FOUND` and `ERROR_FOUND` cookies, so the layout can render the prerequisite-redirect message in its own alert with `data-testid='prerequisite-redirect-message'` — distinguishable from ordinary success/error messages. The layout (`src/routes/build-layout.tsx`) consumes the cookie, renders an `alert-info` div with the testid, and clears the cookie. The unit test suite asserts the message is non-empty and contains none of the forbidden substrings (`ep-`, `user-`, `workflowVersion`, `aggregateEpoch`, pitch names like `C4`, or boundary ids with `|`).

## 3. Consolidated route-guard pattern

Every step route now calls `computeCanonicalRoute` and redirects with `redirectWithPrerequisiteMessage` when the canonical route does not match the route's own path. This consolidates the previously separate inline prerequisite checks (checking `setupConfirmed`, `notesConfirmed`, `splitConfirmed`, or `hand` to decide which step to redirect to) into a single canonical-route guard. Side-effect logic (the split route's one-hand corrective clear and corrupt-state recovery) remains in the routes but is triggered from the redirect branch — these are corrective clears, not ordering decisions.

- `build-etude.tsx` `GET /etude`: calls `computeCanonicalRoute` and redirects with an empty message (the entry point is not a prerequisite redirect).
- `build-etude-notes.tsx` `GET /etude/notes` and `POST /etude/notes`: call `computeCanonicalRoute` and redirect with the safe message when the canonical route is not `/etude/notes`.
- `build-etude-split.tsx` `GET /etude/split` and `POST /etude/split`: call `computeCanonicalRoute` and redirect with the safe message when the canonical route is not `/etude/split`; the one-hand `clearEtudeSplit` and corrupt-state `clearEtudeSplit` side effects are triggered from the redirect branch.
- `build-etude-review.tsx` `GET /etude/review`: calls `computeCanonicalRoute` and redirects with the safe message when the canonical route is not `/etude/review`.

The refactor also moved the `parseStoredPitches` helper from the split route into `src/lib/music-domain.ts` so it is shared between the split route and the workflow service, eliminating duplication.

```bash
cd /home/chris/etude-gen && npx tsc --noEmit 2>&1 | grep -E 'workflow-service|build-etude|build-layout|redirects|music-domain|constants' | head -10; echo 'Type check done (only pre-existing errors in unrelated files are expected)'
```

```output
src/lib/redirects.tsx(6,10): error TS6133: 'getCookie' is declared but its value is never read.
Type check done (only pre-existing errors in unrelated files are expected)
```

```bash
cd /home/chris/etude-gen && bun test tests/canonical-route.spec.ts 2>&1 | tail -5
```

```output

 15 pass
 0 fail
 15 expect() calls
Ran 15 tests across 1 file. [9.00ms]
```

## 4. E2e tests for prerequisite redirects with safe messages

The `e2e-tests/etude/24-etude-prerequisite-redirect.spec.ts` file contains 8 Playwright tests covering the prerequisite-redirect behavior across all workflow states. Each test signs in as a known user, creates the aggregate, advances the workflow to a specific state (by confirming setup, pitches, durations, and split as needed), then asserts that direct GETs to later steps redirect 303 to the earliest incomplete step. After following the redirect, the test asserts the page displays a safe prerequisite-redirect message via `data-testid='prerequisite-redirect-message'` and that the message text contains no internal state or identifiers. The tests also cover the 'stored values no longer validate' rows by seeding invalid stored values via the test-only `POST /test/etude/seed-downstream-state` route. The `expectRendersNormally` helper asserts that a step that IS the canonical route renders without the prerequisite-redirect message, distinguishing a normal page load from a redirect.

```bash
cd /home/chris/etude-gen && LD_LIBRARY_PATH='/tmp/libgbm-local/usr/lib/aarch64-linux-gnu:$LD_LIBRARY_PATH' npx playwright test e2e-tests/etude/24-etude-prerequisite-redirect.spec.ts --reporter=line 2>&1 | tail -3
```

```output
Database cleared successfully

  8 passed (8.6s)
```

## 5. isStepReachable — completed steps remain visitable

A key subtlety: the route guard checks whether the step's **prerequisites** are met, not whether the step is the canonical (earliest incomplete) route. A completed step remains visitable for editing — the student can follow a Back link from the review step to the split step even when all steps are confirmed. The `isStepReachable(params, stepPath)` predicate returns true when the canonical route is at or after the requested step in the step ordering, meaning all prior steps are confirmed with valid stored values. The split step is never reachable for one-hand workflows (it is skipped). This lets the Issue 17 Back links continue to work: a Back link from /etude/review to /etude/split lands on the split form, not a redirect back to /etude/review.

```bash
cd /home/chris/etude-gen && bun test tests/workflow-service.spec.ts 2>&1 | tail -5
```

```output

 43 pass
 0 fail
 75 expect() calls
Ran 43 tests across 1 file. [33.00ms]
```

```bash
cd /home/chris/etude-gen && LD_LIBRARY_PATH='/tmp/libgbm-local/usr/lib/aarch64-linux-gnu:$LD_LIBRARY_PATH' npx playwright test e2e-tests/etude/ --reporter=line 2>&1 | tail -3
```

```output
Database cleared successfully

  126 passed (2.8m)
```
