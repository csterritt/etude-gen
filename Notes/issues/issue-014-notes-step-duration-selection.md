## Issue 14: Notes step duration selection with compatible defaults and server rhythm validation

**Type**: AFK
**Blocked by**: Issue 12, Issue 13

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Add duration selection to the notes step: eighth, quarter, half, whole, dotted-half, and dotted-quarter offered only when they can fit the selected meter, all individually compatible durations selected by default when the step is first derived, and an authoritative server check that rejects a duration set for which no eligible complete-measure pattern exists, with corrective guidance naming what to change.

Compatibility and eligibility come from the catalog work in Issue 12 — a duration is offerable for a meter when at least one catalog pattern for that meter contains it, and a submitted set is valid only when at least one eligible pattern remains. This is the no-script-safe authoritative path; the client enhancement is a separate slice.

### Cross-cutting contract

`Notes/issues/etude-cross-cutting-contract.md` applies in full for a parameter form:

- Section 1 — authentication, no-cache, owner scoping, safe messages.
- Section 2 — hidden `workflowVersion` compare-and-set (Issue 10), safe redisplay of the
  student's duration selection alongside the error (Issue 8), the focused accessible error
  summary and group-error wiring (Issue 9), native constraints, hostile form shapes, and
  downstream invalidation (Issue 11).
- Section 4 — token table row for `POST /etude/notes`.
- Section 5 — durations are the second half of the single coherent notes-step
  prerequisite. The step is confirmed, and later steps become reachable, only when pitches
  (Issue 13) **and** durations are both confirmed.

### Error text and semantics

The rejection message is corrective and stable, not a restatement of the failure. Its
required semantics:

- It names the affected control group (durations).
- It states that no complete measure can be built from the chosen set for the current
  meter.
- It names at least one concrete corrective action derived from the catalog: the smallest
  set of additional offered durations that would make at least one pattern eligible again.
- It never enumerates catalog patterns, internal token letters, or line numbers.

Fix the exact wording in the implementation and assert it as a stable string in tests, in
the same way Issue 13 fixes "Select at least two pitches when using both hands." The
corrective suggestion is computed, so tests assert the suggestion for specific meters and
selections rather than a single hard-coded sentence.

### Duplicate and unknown values

- Duplicate submissions of the same duration are de-duplicated and accepted; they are not
  an error.
- An unknown or unsupported duration token, and a token that is not offerable for the
  current meter, are rejected with a field-addressable error and nothing is persisted. They
  are never silently dropped, because silently dropping them would persist a set the
  student did not choose.
- An empty selection is rejected.
- Field order is irrelevant; the stored set is normalized to a canonical order.

### How to verify

- **Manual**: with 2/4 selected, confirm whole notes are not offered; select only whole notes in 3/4 by posting directly and confirm the server rejects it with guidance; accept the defaults and confirm they persist.
- **Automated**: Bun tests asserting the offerable duration set per meter, the all-compatible default, acceptance of any set with at least one eligible pattern, rejection with corrective guidance when none exists, the computed corrective suggestion for several meter/selection combinations, de-duplication of repeated values, rejection of an unknown token, rejection of a token not offerable for the meter, and canonical ordering of the stored set. Playwright tests assert the offered controls per meter, the default state, a direct POST of an impossible set producing a group-level error with no persistence and the selection redisplayed, the focused error summary, the inherited stale-version rejection, and that the step becomes complete only after both pitches and durations are confirmed.

### Acceptance criteria

- [ ] Given a selected meter, then only durations that appear in at least one catalog pattern for that meter are offered.
- [ ] Given a newly derived notes step, then every individually compatible duration is selected.
- [ ] Given a submitted duration set with at least one eligible complete-measure pattern, then it is accepted and persisted in canonical order.
- [ ] Given a submitted duration set with no eligible pattern, then it is rejected with the stable corrective message naming the duration group and at least one concrete duration to add, nothing is persisted, and the submitted selection is redisplayed.
- [ ] Given an empty duration selection, then it is rejected.
- [ ] Given duplicate submissions of the same duration, then they are de-duplicated and accepted.
- [ ] Given an unknown duration token, or one that is not offerable for the current meter, then the submission is rejected with a field-addressable error rather than the value being silently dropped.
- [ ] Given the corrective message, then it exposes no catalog pattern, internal token letter, or catalog line number.
- [ ] Given a submission carrying a stale workflow version, then it is rejected and the currently saved durations are shown with an explanatory error.
- [ ] Given confirmed durations and confirmed pitches, then the notes step is complete and the split or review step becomes reachable; given only one of the two, then the notes step remains the earliest incomplete step.

### User stories addressed

- User story 17: Compatible durations selected by default
- User story 18: Choose among the supported durations when they fit the meter
- User story 20: Server rejects an impossible rhythm set with corrective guidance

---
