# Issue 14: Notes step duration selection with compatible defaults and server rhythm validation

*2026-08-08T12:24:31Z by Showboat 0.6.1*
<!-- showboat-id: d05306ce-1a19-4f38-ad5c-023d2d2f7a05 -->

This walkthrough covers the Issue 14 implementation: the notes-step duration selection with first-derivation all-compatible defaults, the offerable-per-meter duration set, the authoritative eligibility validation with corrective guidance, and the combined save that confirms the coherent notes step. It walks through (1) the computeOfferableDurations pure function (offerable set per meter from the catalog), (2) the validateDurationSelection pure function (de-dup, canonical ordering, unknown/not-offerable rejection, empty rejection, eligibility with the corrective message), (3) the computeCorrectiveSuggestion pure function (smallest addition set that restores eligibility, named by display label), (4) the resolveDurationSelectionState pure function (all-offerable first-derivation default, non-re-expansion, re-derivation after an Issue 11 clear), (5) the combined updateEtudeNotes repository function (CAS persistence of both halves, notesConfirmed: true, version increment, identical-resubmit short-circuit, stale-version and epoch-mismatch rejections), and (6) the extended GET/POST /etude/notes handlers (duration controls per meter, default state, combined save, corrective rejection with redisplay, Select all remaining pitch-only). Each section includes executable test runs as proof.

## 1 & 2. computeOfferableDurations and validateDurationSelection pure functions

```bash
bun test tests/duration-selection-validator.spec.ts 2>&1 | tail -6
```

```output
(pass) resolveDurationSelectionState > preserves offerable order for a stored set submitted out of order [0.01ms]

 25 pass
 0 fail
 70 expect() calls
Ran 25 tests across 1 file. [26.00ms]
```

The computeOfferableDurations pure function (src/lib/duration-selection-validator.ts) derives the offerable duration set for a meter: a duration is offerable when at least one catalog pattern for that meter contains it, returned in the module's canonical order. The validateDurationSelection pure function normalizes a hostile submission, dedups, rejects unknown and not-offerable tokens field-addressably, rejects an empty selection, and — when the offerable kept set has no eligible complete-measure pattern — rejects with a single group-level failure whose stable corrective message names the computed corrective suggestion by display label. The 25-test suite above (duration-selection-validator.spec.ts) proves all four pure functions, including the exact stable corrective-message string.

## 3. updateEtudeNotes repository function

```bash
bun test tests/etude-params-repository.spec.ts 2>&1 | grep -A 12 'updateEtudeNotes'
```

```output
(pass) updateEtudeNotes > persists pitches and durations in canonical order, increments the version, and confirms the notes step [1.76ms]
(pass) updateEtudeNotes > when the pitches match the stored pitches but the durations change, the durations update and the version increments [1.81ms]
(pass) updateEtudeNotes > rejects a stale workflow version, persists nothing, and leaves notesConfirmed unchanged [1.58ms]
(pass) updateEtudeNotes > rejects a stale epoch, persists nothing, and leaves everything unchanged [1.96ms]
(pass) updateEtudeNotes > wraps an injected update failure as a db-error and persists nothing [1.39ms]
(pass) updateEtudeNotes > an identical resubmit is a no-op (no version increment, notesConfirmed unchanged) [1.48ms]
(pass) updateEtudeNotes > rejects a stale-version resubmit of identical values as a version-mismatch [1.81ms]

 58 pass
 0 fail
 240 expect() calls
Ran 58 tests across 1 file. [144.00ms]
```

The combined updateEtudeNotes function (src/lib/etude-params-repository.ts) persists both halves of the coherent notes-step prerequisite in one compare-and-set transition: load -> identical-resubmit short-circuit -> conditional update guarding userId/aggregateEpoch/workflowVersion -> zero-row disambiguation. On success it sets selectedPitches, selectedDurations, and notesConfirmed: true and increments the workflow version, leaving split state untouched. It mirrors the updateEtudePitches CAS pattern; updateEtudePitches is retained unchanged as the pitch-only Select all path. The 7 new repository cases above prove persistence in canonical order, the notesConfirmed transition, stale-version and epoch-mismatch rejections, db-error handling, and the identical/stale identical-resubmit semantics.

## 4. resolveDurationSelectionState pure function

The resolveDurationSelectionState pure function implements the first-derivation semantics for the duration group. When no duration selection is stored (null, empty, or whitespace), a freshly derived notes step preselects every offerable duration and isFirstDerivation is true; a stored narrowed selection is parsed, filtered to tokens still offerable for the current meter (a stored token no longer offerable after an upstream meter change is dropped), returned in offerable order, and never re-expanded. After an Issue 11 clear (which sets selectedDurations to null), the next render is again a first derivation. This behavior is proven by the resolveDurationSelectionState describe block in the 25-test suite above.

## 5. computeCorrectiveSuggestion pure function

The computeCorrectiveSuggestion pure function finds the smallest set of additional offered durations (not already selected) whose addition makes at least one eligible complete-measure pattern, searching sizes k = 1 upward over canonical-ordered combinations deterministically. It returns an empty set when the selection is already eligible. The corrective message (buildImpossibleSetMessage) exposes only the DURATION_LABELS display labels (`the eighth duration`, `the half and quarter durations`) — never catalog patterns, internal token letters, or line numbers. This is proven by the computeCorrectiveSuggestion describe block in the 25-test suite above for several meter/selection combinations including a multi-token addition set.

## 6. Extended GET/POST /etude/notes handlers

```bash
npx playwright test e2e-tests/etude/16-etude-notes-duration-selection.spec.ts --reporter=line 2>&1 | tail -6
```

```output

Database sessions cleared successfully

Database cleared successfully

  10 passed (5.9s)
```

The GET /etude/notes handler (src/routes/build-etude-notes.tsx) now renders a second duration fieldset alongside the pitches fieldset: offerable durations are derived from the stored meter's catalog patterns via computeOfferableDurations (catalog parsed once per request via the shared loadRhythmCatalog helper), rendered with display labels from DURATION_LABELS and data-testid='duration-field-<token>', pre-selected per first-derivation or stored selection, and wired into the error summary for both groups. The POST /etude/notes ordinary save validates both halves (validatePitchSelection + validateDurationSelection) and persists both via updateEtudeNotes, redirecting 303; on a duration rejection it shapes a single redisplay payload carrying the submitted pitches and durations and all field errors, so the submitted duration selection is redisplayed alongside the group-level corrective error with the error summary focused and linked into the duration group. Select all remains pitch-only via updateEtudePitches, so the notes step stays incomplete until a full combined save. The 10 e2e tests above prove the offered controls per meter, the all-compatible default, a direct POST of an impossible set rejected with no persistence and the selection redisplayed, duplicate de-duplication, unknown/not-offerable rejection, empty rejection, stale-version rejection, and step completeness only after both halves are confirmed.
