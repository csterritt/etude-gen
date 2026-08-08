# Issue 13: Notes step pitch selection with defaults, Select all, and cardinality rules

*2026-08-08T00:41:02Z by Showboat 0.6.1*
<!-- showboat-id: c37d0b66-cb63-4136-820c-9ad206ab173e -->

This walkthrough covers the Issue 13 implementation: the notes-step pitch selection with first-derivation defaults, Select all without scripting, and cardinality rules. It walks through (1) the validatePitchSelection pure function (cardinality rules, the exact two-hand message, unavailable-pitch rejection, hostile-shape tolerance), (2) the resolvePitchSelectionState pure function (first-derivation all-selected default, non-re-expansion, re-derivation after Issue 11 clear), (3) the updateEtudePitches repository function (CAS persistence, version increment, identical-resubmit short-circuit, stale-version and epoch-mismatch rejections, notesConfirmed stays false), (4) the resolveCanonicalRoute extension to /etude/notes, (5) the GET /etude/notes form rendering (available-pitch derivation, first-derivation vs stored selection, error-summary wiring), and (6) the POST /etude/notes handler (ordinary save with cardinality validation, Select all without scripting, stale-version rejection, redisplay of narrowed selection with cardinality error). Each section includes executable test runs as proof.

## 1. validatePitchSelection pure function

The validatePitchSelection function (src/lib/pitch-selection-validator.ts) is a pure arrow function encoding the Issue 13 pitch-selection rules. It takes an untrusted submitted value (typically a string[] from the form parser), the derived available pitch set, and the selected hand mode. It normalizes the submission to a trimmed string[] (a non-array yields an empty array), filters to only available pitches (rejecting any unavailable pitch with a field-addressable failure naming it), deduplicates, and orders the kept pitches by their position in the available set. It then enforces the cardinality minimum: one-hand mode requires at least one pitch; two-hand mode requires at least two with the exact message 'Select at least two pitches when using both hands.' The function never throws and never mutates its arguments.

```bash
bun test tests/pitch-selection-validator.spec.ts 2>&1 | tail -10
```

```output
(pass) resolvePitchSelectionState > whitespace-only stored pitches is treated as null (first derivation) [0.02ms]
(pass) resolvePitchSelectionState > unavailable stored pitches are filtered out, available ones retained [0.08ms]
(pass) resolvePitchSelectionState > all stored pitches unavailable yields empty selection (not first derivation) [0.07ms]
(pass) resolvePitchSelectionState > stored pitches with surrounding whitespace are trimmed [0.03ms]
(pass) resolvePitchSelectionState > preserves available-set order for stored pitches [0.30ms]

 28 pass
 0 fail
 62 expect() calls
Ran 28 tests across 1 file. [60.00ms]
```

## 2. resolvePitchSelectionState pure function

The resolvePitchSelectionState function (src/lib/pitch-selection-validator.ts) implements the first-derivation semantics. When storedPitches is null or an empty/whitespace string, all available pitches are preselected and isFirstDerivation is true — this is the first derivation. Otherwise the stored selection is parsed, filtered to only pitches in the available set (so a stored pitch no longer available after an upstream change is dropped), and returned in available-set order. A stored narrowed selection is never re-expanded. After an Issue 11 clear (which sets selectedPitches to null), the next render is again a first derivation with the full new available set preselected.

## 3. updateEtudePitches repository function

The updateEtudePitches function (src/lib/etude-params-repository.ts) conditionally sets selectedPitches and increments workflowVersion via a compare-and-set write matching the updateEtudeSetup CAS pattern. It loads the current row, compares the submitted pitches against the stored ones (identical-resubmit short-circuit with no version increment when they match and the version is current), and otherwise issues a conditional Drizzle update with a where clause matching userId, aggregateEpoch, and workflowVersion. On a zero-row update it re-loads to disambiguate epoch-mismatch vs version-mismatch. It does NOT set notesConfirmed — the notes step is confirmed only when both pitches and durations are confirmed (durations are Issue 14). It does NOT modify selectedDurations, splitBoundary, setupConfirmed, notesConfirmed, or splitConfirmed.

```bash
bun test tests/etude-params-repository.spec.ts 2>&1 | grep -A 10 'updateEtudePitches'
```

```output
(pass) updateEtudePitches > persists selectedPitches and increments the workflow version [3.93ms]
(pass) updateEtudePitches > rejects a stale workflow version and persists nothing [3.57ms]
(pass) updateEtudePitches > rejects a stale epoch and persists nothing [3.60ms]
(pass) updateEtudePitches > wraps an injected update failure as a db-error and persists nothing [3.66ms]
(pass) updateEtudePitches > an identical resubmit is a no-op (no version increment, no write) [3.46ms]
(pass) updateEtudePitches > saving a different pitch set after a prior save updates and increments again [3.64ms]
(pass) updateEtudePitches > returns version-mismatch when no aggregate exists for the owner [1.61ms]

 51 pass
 0 fail
 204 expect() calls
Ran 51 tests across 1 file. [300.00ms]
```

## 4. resolveCanonicalRoute notes-step extension

The resolveCanonicalRoute function (src/lib/canonical-route.ts) now returns PATHS.ETUDE_NOTES when params.setupConfirmed is true and params.notesConfirmed is false. This matches cross-cutting contract section 5: the notes step is the earliest incomplete step when setup is confirmed but notes are not. The notes step is one coherent prerequisite — both pitches and durations must be confirmed for it to count as complete. Later issues extend the resolver for the split/review/score rows.

```bash
bun test tests/canonical-route.spec.ts 2>&1 | tail -10
```

```output
(pass) resolveCanonicalRoute > routes to /etude/setup when setup is not confirmed [0.08ms]
(pass) resolveCanonicalRoute > routes to /etude/notes when setup is confirmed and notes are unconfirmed [0.02ms]
(pass) resolveCanonicalRoute > routes to /etude/notes when pitches are saved but durations are not yet confirmed [0.02ms]
(pass) resolveCanonicalRoute > routes past /etude/notes when notes are confirmed (one hand, no split needed) [0.02ms]
(pass) resolveCanonicalRoute > still routes to /etude/setup when setup is not confirmed even if notes are confirmed [0.02ms]

 6 pass
 0 fail
 6 expect() calls
Ran 6 tests across 1 file. [13.00ms]
```

## 5. GET /etude/notes form rendering

The GET /etude/notes handler (src/routes/build-etude-notes.tsx) renders the pitch checkbox form. Available pitches are derived from the stored key and octave range via deriveAvailablePitches and parseStoredOctaves (shared with the setup route from src/lib/music-domain.ts). The pre-selected pitches come from resolvePitchSelectionState: first-derivation preselects all available pitches when no selection is stored; a stored narrowed selection is shown as-is and never re-expanded. The form carries a hidden workflowVersion field, accessible labels for each pitch checkbox (data-testid='pitch-field-<pitch>'), an error summary (ErrorSummary component) with field-level error elements (data-testid='pitches-error'), and two submit buttons: an ordinary Save (data-testid='notes-save-action') and a Select all (data-testid='notes-select-all-action'). The GET handler consumes any pending validation-state record from a rejected POST — when present, the submitted pitches override the pre-selection for redisplay. The GET route uses ALLOW_SCRIPTS_SECURE_HEADERS so the CSP permits the error-summary focus script.

## 6. POST /etude/notes handler

The POST /etude/notes handler (src/routes/build-etude-notes.tsx) handles two actions. The 'save' action reads the submitted pitches via form.getAll('pitches'), validates them via validatePitchSelection (cardinality rules and availability), and on success persists via updateEtudePitches (CAS) with a 303 redirect; on validation failure it shapes the redisplay payload and redirects with validation state. The 'select-all' action ignores the submitted checkboxes, persists all available pitches via updateEtudePitches, and redirects 303 — Select all can never produce a cardinality error because it selects every available pitch. On a stale version or epoch, the handler redirects 303 with an explanatory error (redisplaying the committed saved state, not the submitted values). On a db-error, the handler delegates to handleUnexpectedError.

```bash
npx playwright test e2e-tests/etude/15-etude-notes-pitch-selection.spec.ts 2>&1 | tail -15
```

```output
Database sessions cleared successfully
Database cleared successfully
  ✓  6 e2e-tests/etude/15-etude-notes-pitch-selection.spec.ts:329:3 › Issue 13: notes step pitch selection › a stale workflow version is rejected and the currently saved selection is shown (1.4s)
Database cleared successfully
Database seeded successfully: 2 users, 2 accounts, 5 codes
Database sessions cleared successfully
Database cleared successfully
  ✓  7 e2e-tests/etude/15-etude-notes-pitch-selection.spec.ts:375:3 › Issue 13: notes step pitch selection › a rejected two-hand submission redisplays the narrowed selection with the cardinality error (1.5s)
Database cleared successfully
Database seeded successfully: 2 users, 2 accounts, 5 codes
Database sessions cleared successfully
Database cleared successfully
  ✓  8 e2e-tests/etude/15-etude-notes-pitch-selection.spec.ts:426:3 › Issue 13: notes step pitch selection › the error summary links into the pitch group (1.5s)

  8 passed (13.6s)
```
