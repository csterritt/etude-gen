## Issue 14: Notes step duration selection with compatible defaults and server rhythm validation

**Type**: AFK
**Blocked by**: Issue 12, Issue 13

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Add duration selection to the notes step: eighth, quarter, half, whole, dotted-half, and dotted-quarter offered only when they can fit the selected meter, all individually compatible durations selected by default when the step is first derived, and an authoritative server check that rejects a duration set for which no eligible complete-measure pattern exists, with corrective guidance naming what to change.

Compatibility and eligibility come from the catalog work in Issue 12 — a duration is offerable for a meter when at least one catalog pattern for that meter contains it, and a submitted set is valid only when at least one eligible pattern remains. This is the no-script-safe authoritative path; the client enhancement is a separate slice.

### How to verify

- **Manual**: with 2/4 selected, confirm whole notes are not offered; select only whole notes in 3/4 by posting directly and confirm the server rejects it with guidance; accept the defaults and confirm they persist.
- **Automated**: Bun tests asserting the offerable duration set per meter, the all-compatible default, acceptance of any set with at least one eligible pattern, and rejection with corrective guidance when none exists. Playwright tests assert the offered controls per meter, the default state, and a direct POST of an impossible set producing a field-level error with no persistence.

### Acceptance criteria

- [ ] Given a selected meter, then only durations that appear in at least one catalog pattern for that meter are offered.
- [ ] Given a newly derived notes step, then every individually compatible duration is selected.
- [ ] Given a submitted duration set with at least one eligible complete-measure pattern, then it is accepted and persisted.
- [ ] Given a submitted duration set with no eligible pattern, then it is rejected with corrective guidance and nothing is persisted.
- [ ] Given an empty duration selection, then it is rejected.

### User stories addressed

- User story 17: Compatible durations selected by default
- User story 18: Choose among the supported durations when they fit the meter
- User story 20: Server rejects an impossible rhythm set with corrective guidance

---
