## Issue 16: Conditional split step for the two-hand boundary

**Type**: AFK
**Blocked by**: Issue 13

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Deliver `GET /etude/split` and `POST /etude/split` for two-hand workflows only: the student chooses a boundary between adjacent selected pitches, lower pitches are assigned to the left hand and higher pitches to the right, and both sets must be non-empty. For one-hand workflows the step does not appear in the workflow at all and a direct request is redirected away rather than rendered.

The Music Domain owns boundary eligibility, derived from the currently selected pitches. Submitting a boundary that is not between two adjacent selected pitches, or that would leave a hand empty, is rejected.

### How to verify

- **Manual**: with both hands and several pitches selected, open the split step, choose a boundary, and confirm the resulting left/right assignment is shown and persisted; switch to one hand and confirm the split step is skipped and a direct visit redirects.
- **Automated**: Bun tests asserting the eligible boundary list for a given pitch selection, rejection of a boundary that empties a hand or is not between adjacent selected pitches, and the resulting hand assignment. Playwright tests cover the two-hand step appearing in the flow with a working submission, and the one-hand flow skipping it and redirecting a direct request.

### Acceptance criteria

- [ ] Given both hands and at least two selected pitches, then the split step offers a boundary between each adjacent pair and no others.
- [ ] Given a chosen boundary, then lower pitches are assigned left, higher pitches right, both sets are non-empty, and the assignment is persisted.
- [ ] Given a submitted boundary that would leave a hand empty or is not between adjacent selected pitches, then it is rejected and nothing is persisted.
- [ ] Given a one-hand workflow, then the split step is absent from the workflow and a direct request redirects to the canonical step.

### User stories addressed

- User story 21: Choose a boundary between adjacent selected pitches for both hands
- User story 22: No irrelevant split step when generating for one hand

---
