## Issue 7: Split step — two-hand pitch boundary

**Type**: AFK
**Blocked by**: Issue 5

### Parent PRD

`PRD-etude-generator.md`

### What to build

The conditional two-hand boundary step, end-to-end: `GET /etude/split` offers a boundary between adjacent selected pitches, with lower pitches assigned to the left hand and higher to the right; both resulting sets must be non-empty. `POST /etude/split` validates the boundary against the currently saved pitch selection and persists it with the versioned compare-and-set contract, then redirects toward review. In one-hand mode the step does not exist in the flow: navigation skips it, and direct requests to it redirect to the earliest incomplete canonical step.

### How to verify

- **Manual**: in both-hands mode with several pitches selected, confirm the split step offers exactly the boundaries between adjacent selected pitches, choose one, and confirm the assignment on review; switch to one-hand mode and confirm the split step never appears and its URL redirects away.
- **Automated**: Bun tests for boundary derivation (adjacent selected pitches only, both sets non-empty) and validation against stale pitch selections; Playwright tests for the two-hand flow including the step and the one-hand flow skipping it.

### Acceptance criteria

- [ ] Given both-hands mode, when the student reaches the split step, then the offered boundaries are exactly those between adjacent selected pitches and each leaves both hands non-empty.
- [ ] Given a valid boundary, when submitted, then it persists and lower pitches are assigned left, higher right.
- [ ] Given one-hand mode, when the student follows the flow or requests `/etude/split` directly, then the split step is skipped or redirected away from.

### User stories addressed

- User story 21: boundary between adjacent selected pitches for both hands
- User story 22: no irrelevant split step for one-hand mode

---
