## Issue 9: Accessible labels, native constraints, and a focused error summary

**Type**: AFK
**Blocked by**: Issue 8

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Make etude form errors and controls usable by keyboard and screen-reader students, per the PRD's accessibility decisions. Every control gets a programmatic label, instructions are associated with their fields, native HTML constraints are present where applicable, and an invalid submission renders an error summary that links to each invalid control, uses semantic status/alert behavior, and receives programmatic focus on load.

Build the error summary as a shared component the later steps reuse rather than repeating markup per step. Field-level errors are programmatically associated with their controls.

### Cross-cutting contract

This issue **builds** the accessible-error half of the shared contract in
`Notes/issues/etude-cross-cutting-contract.md`. Sections 1 (universal route
requirements) and 2 (parameter-form contract) apply.

This is not a setup-step-only slice. The shared error summary and field-error wiring are
a **prerequisite for every later etude form**: Issues 6, 7, 13, 14 and 16 all render it
and each must assert it for its own controls, per the applicability matrix in section 6.
An issue that adds a form without this wiring is incomplete.

### Identifier and multi-error rules

- Every control has a stable, unique `id`; multi-value groups (octave ranges, pitches,
  durations) are a labelled group whose members have unique ids derived from the value,
  not the index, so ids stay stable when the available set changes.
- A field with more than one error contributes one summary entry per error, each with its
  own unique target anchor, ordered as the fields appear in the form. Duplicate error
  text for the same field is emitted once.
- A group-level error (for example "Select at least two pitches when using both hands")
  links to the group's first member control and is associated with the group, not with an
  arbitrary single checkbox.
- The summary is present only when there are errors; it is not rendered empty and hidden.

### How to verify

- **Manual**: submit an invalid setup form with the keyboard only; confirm focus lands on the error summary, that each summary entry is a link, and that following one moves focus to the offending control.
- **Automated**: Playwright tests asserting the focused element after an invalid submission is the error summary, that summary links resolve to the invalid controls, that every control has an accessible name, that fields carry their native constraint attributes, that field errors are programmatically associated with their inputs, that a field with two errors produces two uniquely anchored entries, that a group-level error targets and is associated with its group, and that all control ids on the page are unique. The same assertions are re-run against every later step's form as those steps are built.

### Acceptance criteria

- [ ] Given an invalid submission, when the step reloads, then the error summary receives programmatic focus.
- [ ] Given an error summary with multiple entries, then each entry links to the control it describes and moves focus there when activated.
- [ ] Given any etude form control, then it has a programmatic label and its instructions are associated with it.
- [ ] Given a field with a bounded value, then the control carries the matching native HTML constraint and the server still enforces it independently.
- [ ] Given an error message, then it is announced through semantic status or alert behavior.
- [ ] Given any etude form page, then every control identifier is unique and stable across renders for the same value.
- [ ] Given a field with more than one error, then each error is a separately anchored summary entry and no error text is duplicated.
- [ ] Given a group-level error, then the summary entry moves focus into the group and the error is associated with the group rather than a single member.
- [ ] Given a submission with no errors, then no error summary element is rendered at all.

### User stories addressed

- User story 29: Error summary linked to field-level errors and focused after invalid submission
- User story 30: Accessible labels and native HTML constraints on every control

---
