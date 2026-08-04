## Issue 10: Workflow version compare-and-set rejects stale submissions

**Type**: AFK
**Blocked by**: Issue 5

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Carry the current workflow version in every mutable etude form and make the repository update parameters only when the expected version matches, so an older tab cannot overwrite newer decisions. Covers the PRD's optimistic-concurrency decisions: conditional writes only, never read-then-unconditionally-write.

A rejected stale submission returns the student to the canonical step showing the newly current saved state with an explanatory error, and the version increments on every successful parameter commit.

### Cross-cutting contract

This issue **builds** the concurrency-token half of the shared contract in
`Notes/issues/etude-cross-cutting-contract.md`. Sections 1, 2, 3 and 4 apply.

Scope is explicitly wider than the setup step. Every later state-changing etude route
inherits a token from section 4 and must test it:

- **Parameter forms** (`POST /etude/setup`, `/etude/notes`, `/etude/split`) use
  `workflowVersion` as a compare-and-set token that increments on success. Issues 6, 7,
  13, 14 and 16 inherit this.
- **Operation POSTs** (`POST /etude/generate`, `/etude/render/retry`, `/etude/pdf`,
  `/etude/start-over`) submit no student values, so they use `workflowVersion` as a
  **precondition that is checked but never incremented**. A mismatch refuses the request
  before any lock acquisition, any external call, and any state change, and redirects to
  the canonical route for the current state. Issues 20, 30, 31, 32, 33, 34, 35, 37 and 38
  inherit this.
- Operation POSTs additionally require the **aggregate epoch** and, where applicable,
  their lock owner token and the current non-stale Piece identity. The workflow version
  alone is not sufficient for them, because Start Over resets parameters and a naive
  version comparison could coincide. Define the epoch field and its check here so later
  issues can rely on it; Issue 38 owns bumping it and Issue 39 owns its terminal value.
- `GET /etude/pdf/download/:grantId` uses no version token at all; its concurrency
  control is the single-use grant (Issue 36) plus the epoch.

### How to verify

- **Manual**: open the setup step in two tabs, save a change in the first, then submit the second tab's older form and confirm it is rejected with an explanation and the page shows the values saved by the first tab.
- **Automated**: Bun tests over the repository asserting that an update with the expected version succeeds and increments it, that an update with an older version returns a typed conflict and changes nothing, that concurrent updates cannot both succeed, that a _newer-than-current_ version is also rejected rather than accepted, that a non-numeric or negative version is rejected, and that an operation-POST precondition check rejects a mismatch without mutating anything. Further tests assert the epoch check rejects a commit whose captured epoch is no longer current. A Playwright test reproduces the two-tab scenario for a parameter form and a second reproduces it for an operation POST.

### Acceptance criteria

- [ ] Given a form carrying the current version, when it is submitted, then the update succeeds and the version increments.
- [ ] Given a form carrying an older version, when it is submitted, then the update is rejected, nothing is persisted, and the student sees the currently saved state with an explanatory error.
- [ ] Given two submissions with the same expected version, then at most one succeeds.
- [ ] Given a missing, non-numeric, negative, tampered, or newer-than-current version field, then the submission is rejected rather than treated as current.
- [ ] Given a stale-version rejection, then the redisplayed form shows the newly current saved state rather than the rejected submitted values.
- [ ] Given an operation POST whose version precondition fails, then no lock is acquired, no external call is made, no cooldown is consumed, and no state changes.
- [ ] Given a commit whose captured aggregate epoch is no longer current, then the commit is rejected by the repository regardless of the workflow version.

### User stories addressed

- User story 52: Stale submissions from another tab rejected with the currently saved state shown

---
