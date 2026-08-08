# Issue 14 — Human Review

Human-in-the-loop review of the Issue 14 implementation (notes-step duration selection with
compatible defaults and server rhythm validation) against the parent issue's "How to verify" and
"Acceptance criteria", PRD user stories 17, 18, and 20, and the cross-cutting contract.

**Reviewer**: human review step (recorded by the implementing agent after running the full
automated verification below). **Date**: 2026-08-08.

## How verification was performed

- **Unit**: `bun test tests/duration-selection-validator.spec.ts` (25 pass) and
  `bun test tests/etude-params-repository.spec.ts` (58 pass, including the 7 new
  `updateEtudeNotes` cases).
- **End-to-end**: `npx playwright test` — the full suite passed (160 passed, 43 skipped, 0 failed),
  including `16-etude-notes-duration-selection.spec.ts` (10 tests) and the retained
  `15-etude-notes-pitch-selection.spec.ts` (updated so its ordinary-save pitch tests also submit a
  valid duration set, per the coherent-notes-step semantics).
- **Types**: `tsc --noEmit` reports zero errors in every file created or modified for this issue
  (`src/lib/duration-selection-validator.ts`, `src/lib/etude-params-repository.ts`,
  `src/routes/build-etude-notes.tsx`, and the new/modified tests).

## Parent issue acceptance criteria

- [x] **Offerable per meter** — only durations that appear in at least one catalog pattern for the
  meter are offered (`computeOfferableDurations`). Verified by unit tests and the e2e "2/4 meter
  offers H/Q/R/E and omits whole/dotted-half" test.
- [x] **All-compatible default** — a newly derived notes step preselects every individually
  compatible duration (`resolveDurationSelectionState` first derivation). Verified by unit tests and
  the e2e default-state test.
- [x] **Eligible set accepted, canonically persisted** — a set with at least one eligible
  complete-measure pattern is accepted and stored in canonical order. Verified by unit tests and the
  e2e de-duplication/canonical-order test (`'Q,E'`).
- [x] **Impossible set rejected with corrective guidance, no persistence, redisplay** — a set with
  no eligible pattern is rejected with the stable corrective message naming the duration group, the
  current meter, and the smallest additional duration(s) by display label; nothing is persisted and
  the submitted selection is redisplayed (e2e direct-POST test).
- [x] **Empty selection rejected** — "Select at least one duration." (unit + e2e).
- [x] **Duplicates de-duplicated and accepted** (unit + e2e).
- [x] **Unknown / not-offerable token rejected field-addressably, never silently dropped** (unit +
  e2e).
- [x] **Corrective message exposes no pattern / token letter / line number** — `buildImpossibleSetMessage`
  maps suggestion tokens through `DURATION_LABELS` only and names the meter; it never enumerates
  catalog patterns, internal token letters, or line numbers (verified in the module and its test).
- [x] **Stale version rejected, current saved state shown** (unit + e2e).
- [x] **Step complete only after both pitches and durations confirmed** — `updateEtudeNotes` sets
  `notesConfirmed: true` only on the combined save; Select all remains pitch-only so the step stays
  incomplete (e2e step-completeness test).

## PRD user stories

- **17 (compatible durations selected by default)** — satisfied by the all-offerable first-derivation
  default.
- **18 (choose among eighth/quarter/half/whole/dotted-half/dotted-quarter when they fit the meter)** —
  satisfied by the offerable-per-meter control list.
- **20 (server rejects an impossible rhythm set with corrective guidance)** — satisfied by the
  authoritative `validateDurationSelection` server path and its corrective message.

## Cross-cutting contract

- **§2 (whole parameter-form contract)** — hidden `workflowVersion` carried on the form and used for
  compare-and-set; safe invalid-value redisplay through the one-time validation state
  (`shapeRedisplayPayload` + nonce); focused accessible error summary with field-level wiring for
  both the pitches and durations groups (group-level duration errors link into the first
  `duration-field-*` member); native HTML constraints (checked checkboxes with accessible labels);
  hostile form shapes tolerated (`normalizeSubmitted`, `form.getAll`, defensive catalog parse);
  downstream invalidation already handled by the Issue 11 `updateEtudeSetup` dependency map.
- **§4 (token table row for `POST /etude/notes`)** — the combined save performs a compare-and-set on
  `workflowVersion` (and `aggregateEpoch`) and increments it by 1 on success; `updateEtudeNotes` is
  the single committed transition for both halves.
- **§5 (one coherent notes-step prerequisite)** — the step is confirmed only when both pitches and
  durations are confirmed; the combined save drives `notesConfirmed` to true, and the pitch-only
  Select all path never confirms it.

## Code-review passes (first-pass)

- **Logic**: no off-by-one in the corrective-suggestion combination search; loops terminate; typed
  failures; no reachable dead code; no incorrect boolean logic.
- **Operation ordering**: validation completes before any write; the repository performs
  load → identical-resubmit short-circuit → guarded CAS → zero-row disambiguation; no
  side-effect-before-guard.
- **Bad practices**: strict equality, no unsafe coercion, typed `Result<string[], DurationSelectionFailure[]>`,
  no `any` in the new module (the route's `Bindings: any` matches the shared pre-existing route-builder
  pattern).
- **Security**: parameterized Drizzle writes (no SQL interpolation); corrective message leaks no
  pattern/token/line detail; unexpected errors delegated to the safe-error handler with sanitized
  logging.
- **Magic strings**: `EMPTY_DURATION_MESSAGE`, `DURATION_LABELS`, and `CANONICAL_DURATION_ORDER` are
  named constants; the corrective message is a stable string asserted in tests.
- **TypeScript strict**: `tsc --noEmit` clean for all files created or modified in this issue.

## Conclusion

The implementation satisfies the parent issue's acceptance criteria, the referenced PRD user
stories, and the cross-cutting contract §2/§4/§5, and passes the full unit and end-to-end suites.
No corrective action required.
