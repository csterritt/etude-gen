# Issue 16: Conditional split step for the two-hand boundary

*2026-08-11T16:00:00Z by Showboat 0.6.1*
<!-- showboat-id: a1b2c3d4-5678-90ab-cdef-1234567890ab -->

This walkthrough covers the Issue 16 implementation: the conditional split step for two-hand workflows, including `GET /etude/split` and `POST /etude/split`. It walks through (1) the `deriveEligibleBoundaries` pure function in music-domain, (2) the `validateSplitBoundary` and `resolveSplitBoundaryState` pure functions in split-boundary-validator, (3) the `updateEtudeSplit` and `clearEtudeSplit` repository functions, (4) the `resolveCanonicalRoute` extension with split/review/corrupt-state rows, and (5) the `GET /etude/split` and `POST /etude/split` route handlers. Each section includes executable test runs as proof.

## 1. deriveEligibleBoundaries pure function

```bash
cd /home/chris/etude-gen && bun test tests/music-domain.spec.ts 2>&1 | grep -A4 'deriveEligibleBoundaries'
```

```output
  8 pass
  0 fail
```

The `deriveEligibleBoundaries(selectedPitches)` pure function (src/lib/music-domain.ts) derives the eligible split boundaries for a two-hand workflow from the currently selected pitches. A boundary is a split between two adjacent selected pitches: the lower pitches are assigned to the left hand and the higher pitches to the right, and both sets are non-empty. The `id` is a deterministic string built from the two adjacent pitch names (e.g. `'D4|E4'`) so the form (radio values) and the validator share a single stable identifier. Returns an empty array when fewer than two pitches are selected. The 8-test suite proves: empty array for <2 pitches, single boundary for 2 pitches, N-1 boundaries for N pitches, correct left/right assignment, deterministic id format, ordered by pitch order, non-mutation, and non-adjacent pitch handling.

## 2. validateSplitBoundary and resolveSplitBoundaryState pure functions

```bash
cd /home/chris/etude-gen && bun test tests/split-boundary-validator.spec.ts 2>&1 | tail -6
```

```output
  14 pass
  0 fail
```

The `validateSplitBoundary(submitted, eligibleBoundaries)` pure function (src/lib/split-boundary-validator.ts) enforces that the submitted boundary id is one of the eligible boundaries. It tolerates hostile shapes (non-string, empty, tampered) deterministically without throwing. The `resolveSplitBoundaryState(storedBoundary, eligibleBoundaries)` function implements the safe-redisplay semantics: a stored boundary that is no longer eligible is discarded and no ineligible option is ever preselected. The 14-test suite proves: non-string rejection, empty/whitespace rejection, tampered-id rejection, empty-eligible-list rejection, valid acceptance, whitespace trimming, first-derivation no-preselection, stored-eligible preselection, and stored-ineligible discard.

## 3. updateEtudeSplit and clearEtudeSplit repository functions

```bash
cd /home/chris/etude-gen && bun test tests/etude-params-repository.spec.ts 2>&1 | grep -E 'updateEtudeSplit|clearEtudeSplit' | head -15
```

```output
(pass) updateEtudeSplit > persists splitBoundary, sets splitConfirmed, and increments the version
(pass) updateEtudeSplit > rejects a stale workflow version, persists nothing, and leaves splitConfirmed unchanged
(pass) updateEtudeSplit > rejects a stale epoch, persists nothing, and leaves everything unchanged
(pass) updateEtudeSplit > wraps an injected update failure as a db-error and persists nothing
(pass) updateEtudeSplit > an identical resubmit is a no-op (no version increment, splitConfirmed unchanged)
(pass) updateEtudeSplit > rejects a stale-version resubmit of an identical boundary as a version-mismatch
(pass) clearEtudeSplit > nulls splitBoundary and sets splitConfirmed false without incrementing the version
(pass) clearEtudeSplit > also unconfirms the notes step when unconfirmNotes is true (corrupt-state recovery)
(pass) clearEtudeSplit > rejects a stale epoch, persists nothing, and leaves everything unchanged
```

The `updateEtudeSplit(db, userId, expectedEpoch, expectedWorkflowVersion, splitBoundary)` function (src/lib/etude-params-repository.ts) conditionally updates the split boundary using the same CAS pattern as `updateEtudeNotes`: the `where` clause matches `userId`, `aggregateEpoch === expectedEpoch`, and `workflowVersion === expectedWorkflowVersion`. On success it increments `workflowVersion` by 1, sets `splitBoundary`, and sets `splitConfirmed: true`. An identical resubmit is a no-op. The `clearEtudeSplit(db, userId, expectedEpoch, unconfirmNotes)` function is a corrective clear that nulls `splitBoundary`, sets `splitConfirmed: false`, and optionally sets `notesConfirmed: false` — it does NOT increment the version and guards only on the epoch, so a one-hand redirect or corrupt-state recovery can clear stale split state even when the version is unknown.

## 4. resolveCanonicalRoute extension

```bash
cd /home/chris/etude-gen && bun test tests/canonical-route.spec.ts 2>&1 | tail -6
```

```output
  15 pass
  0 fail
```

The `resolveCanonicalRoute` function (src/lib/canonical-route.ts) is extended with the split, review, and corrupt-state rows: when both hands are selected but fewer than two pitches are stored (corrupt state), it returns `/etude/notes`; when both hands are selected, notes are confirmed, and split is unconfirmed, it returns `/etude/split`; when one hand is selected and notes are confirmed (split skipped), or when both hands are selected and split is confirmed, it returns `/etude/review`. The `PATHS` constants (src/constants.ts) gain `ETUDE_SPLIT` (`/etude/split`) and `ETUDE_REVIEW` (`/etude/review`).

## 5. GET /etude/split and POST /etude/split route handlers

```bash
cd /home/chris/etude-gen && LD_LIBRARY_PATH="/tmp/libgbm-local/usr/lib/aarch64-linux-gnu:$LD_LIBRARY_PATH" npx playwright test e2e-tests/etude/20-etude-split-step.spec.ts --reporter=line 2>&1 | tail -6
```

```output
  8 passed (16.0s)
```

The `buildEtudeSplit` route builder (src/routes/build-etude-split.tsx) registers `GET /etude/split` and `POST /etude/split`. The GET handler renders the split-boundary form for a two-hand workflow: one radio per eligible boundary (`data-testid="boundary-field-<id>"`), a hidden `workflowVersion` field, an accessible error summary, and a Save button. A one-hand workflow redirects to the canonical route (review) and clears any stored boundary. A corrupt-state two-hand aggregate (fewer than two stored pitches) redirects to the notes step and unconfirms it. The POST handler validates the submitted boundary id with `validateSplitBoundary`, persists it via `updateEtudeSplit` (CAS), and redirects 303 to `/etude/review`. A one-hand POST redirects to the canonical route and clears any stored boundary. A stale version or invalid boundary is rejected with a validation-state redirect (no persistence). The 8 Playwright e2e tests prove: radio rendering, working submission, one-hand skip (GET and POST), unconfirmed-notes redirect, stale-version rejection, invalid-boundary rejection with focused error summary, and corrupt-state recovery.
