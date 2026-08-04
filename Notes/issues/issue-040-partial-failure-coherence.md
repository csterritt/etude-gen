## Issue 40: Partial-failure coherence across D1 and private object storage

**Type**: AFK
**Blocked by**: Issue 31, Issue 32, Issue 33, Issue 34, Issue 35, Issue 36, Issue 37, Issue 38, Issue 39

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Make every multi-resource etude operation leave the last committed workflow coherent when D1 or R2 fails partway. Covers the PRD decisions that database failures preserve the prior committed aggregate where possible with a generic retry message, and that explicit state transitions prevent an R2 failure from making an artifact current without a matching D1 commit.

Concretely: an R2 write failure after valid SVG or PDF receipt does not consume the corresponding cooldown; an SVG failure retains the Piece for Retry rendering; a PDF failure returns the student to their current score; and a D1 commit failure after a successful R2 write leaves the artifact unreachable rather than half-current. Reuse the existing database retry hooks and `Result`-based error handling as prior art.

This issue is deliberately last and depends on **every** mechanism whose failure behaviour it
verifies: render recovery and retry (Issue 31), staleness and supersession (Issue 32), both
in-flight locks (Issue 33), the new-Piece cooldown (Issue 34), PDF generation and grants
(Issue 35), grant lifecycle and delivery ordering (Issue 36), the PDF cooldown (Issue 37),
Start Over (Issue 38), and account deletion (Issue 39). It cannot assert their failure
boundaries before they exist.

### Cross-cutting contract

`Notes/issues/etude-cross-cutting-contract.md` applies:

- Section 3 — every operation POST's per-stage re-verification is part of what makes partial
  failures coherent.
- Section 4 — the aggregate epoch and the lock owner tokens are the conditional-commit guards
  this issue exercises.
- Section 7 — every failure logged here carries the originating correlation identifier, or a
  generated operation correlation identifier when the work outlives the request.

### Orphan cleanup after a successful write and a failed commit

The one case the PRD's original cleanup-reason set could not express is an R2 write that
succeeded followed by a D1 commit that did not. The artifact exists, it is not reachable, and
none of `replacement`, `start_over`, `grant_consumed`, `grant_expired`, or `account_deleted`
describes it. Issue 29 therefore adds `cleanupReason` `commit_failed`, and this issue requires
its use:

- Every path that writes an artifact and then fails to commit its D1 reference — for any
  reason, including a database failure, a lost lock owner token, a stale aggregate epoch, a
  superseded Piece, or a stale workflow version — invokes best-effort cleanup for that object
  with `cleanupReason` `commit_failed`.
- Cleanup runs through the Artifact Store's retry policy. Exhaustion emits the standard
  `artifact_cleanup_exhausted` orphan log with that reason, so the object is recorded for
  privileged operational handling rather than lost silently.
- Cleanup failure never changes what the student sees: the outcome is still the prior coherent
  state or the defined retryable state.
- The student-facing outcome is never "your score is being prepared"; it is either the previous
  coherent state or an explicitly retryable state.

### Deployability

This issue closes the invariants that Issues 20 and 30 deferred. The generation capability flag
introduced in Issue 20 is turned on and then removed as part of this issue, once every failure
path in the table below is proven. That flag is the mechanism that kept the intermediate slices
from being externally reachable.

### How to verify

- **Manual**: with a fault injected at each boundary in development, confirm the student always sees either the previous coherent state or a retryable state, never a score that mismatches its settings.
- **Automated**: Bun tests over the Workflow Service injecting a failure at each transition — D1 parameter commit, downstream invalidation, Piece persistence, supersession, R2 SVG write, render-state commit, cooldown timestamp write, R2 PDF write, grant commit, grant consumption, Start Over clearing, and account-deletion revocation — asserting the resulting state is the prior committed aggregate or a defined retryable state, that no artifact becomes current without its D1 commit, that the relevant cooldown is not consumed, that any orphaned object is cleaned up with reason `commit_failed`, and that the student-facing message is generic with a correlation identifier. The same matrix is run for the lost-lock-owner and stale-epoch variants of each commit, not just for storage errors. A test asserts cleanup exhaustion emits the orphan log with reason `commit_failed` while the student-facing outcome is unchanged. Playwright tests assert the recovery paths using the existing database-failure hooks.

### Acceptance criteria

- [ ] Given a D1 failure during any etude transition, then the prior committed aggregate is preserved and the student sees a generic retry message with a correlation identifier.
- [ ] Given an R2 write failure after valid SVG receipt, then the Piece is retained for Retry rendering and the new-Piece cooldown is not consumed.
- [ ] Given an R2 write failure after valid PDF receipt, then the student is returned to their current score and the PDF cooldown is not consumed.
- [ ] Given a D1 commit failure after a successful R2 write, then the artifact never becomes current, remains unreachable, and is cleaned up with `cleanupReason` `commit_failed`.
- [ ] Given a commit rejected because the lock owner token no longer matches or the aggregate epoch moved, then the same orphan cleanup with reason `commit_failed` applies.
- [ ] Given orphan cleanup that exhausts its retries, then the `artifact_cleanup_exhausted` log is emitted with reason `commit_failed` and the student-facing outcome is unchanged.
- [ ] Given any partial failure, then settings and displayed music never mismatch, and the student is never left in an indeterminate "in progress" state.
- [ ] Given every failure path in this issue is proven, then the generation capability flag from Issue 20 is enabled and removed from the codebase.

### User stories addressed

- User story 62: Database or private-object-storage failures leave the last committed workflow coherent

---
