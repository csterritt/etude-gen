## Issue 9: Accessible labels, native constraints, and a focused error summary

**Type**: AFK
**Blocked by**: Issue 8

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Make etude form errors and controls usable by keyboard and screen-reader students, per the PRD's accessibility decisions. Every control gets a programmatic label, instructions are associated with their fields, native HTML constraints are present where applicable, and an invalid submission renders an error summary that links to each invalid control, uses semantic status/alert behavior, and receives programmatic focus on load.

Build the error summary as a shared component the later steps reuse rather than repeating markup per step. Field-level errors are programmatically associated with their controls.

### How to verify

- **Manual**: submit an invalid setup form with the keyboard only; confirm focus lands on the error summary, that each summary entry is a link, and that following one moves focus to the offending control.
- **Automated**: Playwright tests asserting the focused element after an invalid submission is the error summary, that summary links resolve to the invalid controls, that every control has an accessible name, that fields carry their native constraint attributes, and that field errors are programmatically associated with their inputs.

### Acceptance criteria

- [ ] Given an invalid submission, when the step reloads, then the error summary receives programmatic focus.
- [ ] Given an error summary with multiple entries, then each entry links to the control it describes and moves focus there when activated.
- [ ] Given any etude form control, then it has a programmatic label and its instructions are associated with it.
- [ ] Given a field with a bounded value, then the control carries the matching native HTML constraint and the server still enforces it independently.
- [ ] Given an error message, then it is announced through semantic status or alert behavior.

### User stories addressed

- User story 29: Error summary linked to field-level errors and focused after invalid submission
- User story 30: Accessible labels and native HTML constraints on every control

---
