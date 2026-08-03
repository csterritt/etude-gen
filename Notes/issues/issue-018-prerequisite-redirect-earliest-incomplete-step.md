## Issue 18: Direct requests for unavailable steps redirect to the earliest incomplete step

**Type**: AFK
**Blocked by**: Issue 16

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Make every etude step guard its prerequisites: a direct GET for a step whose prerequisites are not met redirects to the earliest incomplete canonical step with a safe message, so stale bookmarks and hand-typed URLs recover into the workflow instead of rendering an incoherent page. Covers the PRD's route-contract decision on unmet prerequisites, and completes the `GET /etude` entry redirect to the canonical route for the saved state.

The Workflow Service computes the earliest incomplete step from the snapshot; routes ask it rather than reimplementing the ordering.

### How to verify

- **Manual**: as a student who has only completed setup, request `/etude/review` directly and confirm you land on the notes step with a safe explanatory message; then complete the workflow and confirm the same URL renders normally.
- **Automated**: Bun tests over the earliest-incomplete-step calculation for every partial-completion state, including the one-hand case where split is not a step. Playwright tests request each step directly at each stage of completion and assert the redirect target and message, and assert `/etude` redirects to the canonical step.

### Acceptance criteria

- [ ] Given an incomplete workflow, when a later step is requested directly, then the student is redirected to the earliest incomplete canonical step with a safe message.
- [ ] Given a complete prerequisite chain, when a step is requested directly, then it renders normally.
- [ ] Given a one-hand workflow, then the split step is never chosen as the earliest incomplete step.
- [ ] Given `GET /etude`, then it redirects to the canonical route for the saved current state.
- [ ] Given any redirect message here, then it exposes no internal state or identifiers.

### User stories addressed

- User story 25: Direct request for an unavailable later step redirected to the earliest incomplete step

---
