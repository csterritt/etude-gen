## Issue 4: Octave range selection with continuous expansion

**Type**: AFK
**Blocked by**: Issue 2

### Parent PRD

`PRD-etude-generator.md`

### What to build

Add keyboard scale-range selection (octaves 2 through 6) to the setup step, end-to-end from domain rule to form control. The Music Domain interprets the lowest and highest selections as one continuous expanded range including every intervening scale range, each derived tonic-to-tonic before the global upper cap. The setup form exposes the range checkboxes with the saved selection, validates at least one selection server-side, and persists the expansion-relevant raw selections. The derived expanded range is consumed by the notes step in Issue 5.

### How to verify

- **Manual**: select octaves 2 and 5 only, submit, and confirm on the notes step (or a temporary diagnostic render if Issue 5 is not yet built) that octaves 3 and 4 pitches are included; try submitting with no range selected and confirm rejection.
- **Automated**: Bun tests for contiguous octave expansion (adjacent, non-adjacent, single range, boundary octaves 2 and 6) and validation of empty/invalid selections; Playwright test for selecting ranges, submitting, and confirming persistence and the validation error path.

### Acceptance criteria

- [ ] Given non-adjacent octave selections, when the range is derived, then every scale range between the lowest and highest selection is included.
- [ ] Given a single selected octave, when the range is derived, then it spans tonic-to-tonic for that octave subject to the global upper cap.
- [ ] Given no selected range, when the student submits setup, then the server rejects the submission with a field-level error and no state change.

### User stories addressed

- User story 9: select one or more keyboard scale ranges, octaves 2–6
- User story 10: non-adjacent selections interpreted as one continuous range

---
