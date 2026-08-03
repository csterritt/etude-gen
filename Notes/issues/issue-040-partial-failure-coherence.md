## Issue 40: Partial-failure coherence across D1 and private object storage

**Type**: AFK
**Blocked by**: Issue 32, Issue 35

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Make every multi-resource etude operation leave the last committed workflow coherent when D1 or R2 fails partway. Covers the PRD decisions that database failures preserve the prior committed aggregate where possible with a generic retry message, and that explicit state transitions prevent an R2 failure from making an artifact current without a matching D1 commit.

Concretely: an R2 write failure after valid SVG or PDF receipt does not consume the corresponding cooldown; an SVG failure retains the Piece for Retry rendering; a PDF failure returns the student to their current score; and a D1 commit failure after a successful R2 write leaves the artifact unreachable rather than half-current. Reuse the existing database retry hooks and `Result`-based error handling as prior art.

### How to verify

- **Manual**: with a fault injected at each boundary in development, confirm the student always sees either the previous coherent state or a retryable state, never a score that mismatches its settings.
- **Automated**: Bun tests over the Workflow Service injecting a failure at each transition — D1 parameter commit, Piece persistence, R2 SVG write, render-state commit, R2 PDF write, and grant commit — asserting the resulting state is the prior committed aggregate or a defined retryable state, that no artifact becomes current without its D1 commit, that the relevant cooldown is not consumed, and that the student-facing message is generic with a correlation identifier. Playwright tests assert the recovery paths using the existing database-failure hooks.

### Acceptance criteria

- [ ] Given a D1 failure during any etude transition, then the prior committed aggregate is preserved and the student sees a generic retry message with a correlation identifier.
- [ ] Given an R2 write failure after valid SVG receipt, then the Piece is retained for Retry rendering and the new-Piece cooldown is not consumed.
- [ ] Given an R2 write failure after valid PDF receipt, then the student is returned to their current score and the PDF cooldown is not consumed.
- [ ] Given a D1 commit failure after a successful R2 write, then the artifact never becomes current and remains unreachable.
- [ ] Given any partial failure, then settings and displayed music never mismatch.

### User stories addressed

- User story 62: Database or private-object-storage failures leave the last committed workflow coherent

---
