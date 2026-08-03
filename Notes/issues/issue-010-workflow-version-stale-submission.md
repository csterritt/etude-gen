## Issue 10: Workflow version compare-and-set rejects stale submissions

**Type**: AFK
**Blocked by**: Issue 5

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Carry the current workflow version in every mutable etude form and make the repository update parameters only when the expected version matches, so an older tab cannot overwrite newer decisions. Covers the PRD's optimistic-concurrency decisions: conditional writes only, never read-then-unconditionally-write.

A rejected stale submission returns the student to the canonical step showing the newly current saved state with an explanatory error, and the version increments on every successful parameter commit.

### How to verify

- **Manual**: open the setup step in two tabs, save a change in the first, then submit the second tab's older form and confirm it is rejected with an explanation and the page shows the values saved by the first tab.
- **Automated**: Bun tests over the repository asserting that an update with the expected version succeeds and increments it, that an update with an older version returns a typed conflict and changes nothing, and that concurrent updates cannot both succeed. A Playwright test reproduces the two-tab scenario.

### Acceptance criteria

- [ ] Given a form carrying the current version, when it is submitted, then the update succeeds and the version increments.
- [ ] Given a form carrying an older version, when it is submitted, then the update is rejected, nothing is persisted, and the student sees the currently saved state with an explanatory error.
- [ ] Given two submissions with the same expected version, then at most one succeeds.
- [ ] Given a missing or tampered version field, then the submission is rejected rather than treated as current.

### User stories addressed

- User story 52: Stale submissions from another tab rejected with the currently saved state shown

---
