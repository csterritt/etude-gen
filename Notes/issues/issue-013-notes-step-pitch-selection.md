## Issue 13: Notes step pitch selection with defaults, Select all, and cardinality rules

**Type**: AFK
**Blocked by**: Issue 7, Issue 11

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Deliver `GET /etude/notes` and the pitch half of `POST /etude/notes`: the step lists every available pitch derived from the saved key and octave range, selects them all by default when the step is first derived, offers a Select all control that works without scripting, and enforces the cardinality rules — at least one pitch for one-hand mode and at least two for two-hand mode, with the exact field-level message "Select at least two pitches when using both hands."

Available pitches come from the Music Domain derivation built in Issues 6 and 7; the step must never offer a pitch outside the derived set, and the server must reject any submitted pitch that is not currently available.

### How to verify

- **Manual**: reach the notes step with a fresh aggregate and confirm every pitch is checked; deselect several, submit, and confirm persistence; with both hands selected, submit one pitch and confirm the exact error message; use Select all with JavaScript disabled and confirm the full set is restored.
- **Automated**: Bun tests over the domain rules for one-hand minimum, two-hand minimum, the exact message string, rejection of unavailable pitches, and the all-selected default derivation. Playwright tests cover the default state, Select all without scripting, one-hand and two-hand cardinality failures, and persistence of a narrowed selection.

### Acceptance criteria

- [ ] Given a newly derived notes step, then every available pitch is selected.
- [ ] Given both hands selected, when fewer than two pitches are submitted, then the submission is rejected with the field-level message "Select at least two pitches when using both hands."
- [ ] Given one hand selected, when zero pitches are submitted, then the submission is rejected; when one pitch is submitted, then it is accepted.
- [ ] Given a submitted pitch that is not in the derived available set, then the submission is rejected and nothing is persisted.
- [ ] Given Select all activated with scripting unavailable, then the request round-trips through the server and all available pitches become selected.

### User stories addressed

- User story 13: All available key pitches selected by default on the notes step
- User story 14: Select one or more pitches for one hand, at least two for two hands
- User story 15: A Select all control

---
