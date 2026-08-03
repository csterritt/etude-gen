## Issue 11: Upstream changes clear dependent downstream choices

**Type**: AFK
**Blocked by**: Issue 7

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Make a successful setup change clear all dependent note, duration, split, and review-completion state, so previously valid downstream selections cannot silently become invalid. Covers the PRD decision that changing setup selections invalidates dependent state and that any retained Piece becomes stale with its score and PDF controls hidden.

The Workflow Service owns this invalidation, driven by which upstream fields actually changed — resubmitting identical values must not discard downstream work. At this stage the downstream fields exist in the aggregate even where their steps arrive in later slices; hiding a stale Piece is wired in when generation exists.

### How to verify

- **Manual**: complete setup, make downstream selections, then change the key or octave range and confirm the downstream selections are cleared and must be made again; resubmit setup with unchanged values and confirm nothing is cleared.
- **Automated**: Bun tests over the Workflow Service asserting invalidation for each upstream field that dependent state derives from, no invalidation when values are unchanged, and that review completion is reset. A Playwright test walks forward, changes an upstream value, and asserts the downstream step no longer reports completion.

### Acceptance criteria

- [ ] Given saved downstream selections, when the key, octave range, meter, measure count, or hand selection changes, then the dependent note, duration, split, and review state is cleared.
- [ ] Given a setup submission whose values are identical to the saved ones, then downstream state is preserved.
- [ ] Given cleared downstream state, then the workflow's earliest incomplete step moves back accordingly.
- [ ] Given invalidation, then it happens in the same committed transition as the upstream change, never partially.

### User stories addressed

- User story 26: Upstream changes clear dependent downstream choices

---
