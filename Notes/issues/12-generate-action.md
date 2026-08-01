## Issue 12: Generate action — lock, cooldown, Piece persistence and supersession

**Type**: AFK
**Blocked by**: Issue 11

### Parent PRD

`PRD-etude-generator.md`

### What to build

`POST /etude/generate` end-to-end, from the review page's Generate control through concurrency controls to a stored Piece (rendering to SVG lands in Issues 13–16; until then the score route shows a render-pending state that Issue 16/17 completes). The Workflow Service coordinates: domain validation, Piece generation, conditional Piece persistence with supersession of any old Piece, and final state commit. Concurrency follows "Data and concurrency": an in-flight lock with an unpredictable per-request owner identifier, acquired atomically; every commit and release conditionally verifies the owner still matches; locks expire exactly 60 seconds after acquisition and may be atomically replaced; every non-success path conditionally releases its own lock. The new-Piece cooldown is 60 seconds starting only after full success; failed attempts never consume it. Generating a replacement revokes the old SVG's reachability immediately and starts artifact cleanup even if later rendering fails. Only one generation is in flight at a time.

### How to verify

- **Manual**: from review, click Generate and confirm the resulting state (render-pending score); immediately click Generate again and confirm the cooldown message; use two tabs or a throttled request to confirm a second concurrent generation is rejected; confirm the old Piece is no longer reachable after a replacement.
- **Automated**: Bun tests for repository lock semantics (conditional acquisition, owner-identifier checks on commit/release, expired-lock replacement while the former owner is still running, unconditional owner-scoped release per failure category, one-minute recovery) and independent success-only cooldown accounting; Workflow Service tests for the full transition order, lost-lock-owner commit rejection, and supersession; Playwright tests for generation from review and the cooldown message (extending resend/reset cooldown prior art).

### Acceptance criteria

- [ ] Given an approved review, when the student generates, then a new immutable Piece reflecting exactly those settings is persisted and the old Piece (if any) is superseded and its artifacts revoked.
- [ ] Given a successful generation, when the student attempts another within 60 seconds, then it is rejected with a cooldown message; after a failed attempt, no cooldown is consumed.
- [ ] Given a request still running when its 60-second lock expires and is replaced, when it tries to commit or release, then the conditional check rejects it and the replacement's lock is untouched.
- [ ] Given two concurrent generation requests, then exactly one holds the lock and the other receives a safe in-flight rejection.
- [ ] Given any failure after lock acquisition, then the request conditionally releases its own lock.

### User stories addressed

- User story 31: Generate creates an immutable Piece from approved settings
- User story 42: refresh shows the same stored Piece (persistence half)
- User story 48: one new-Piece generation in flight at a time
- User story 49: one successful generation per minute
- User story 50: failed attempts do not consume the cooldown
- User story 51: expired in-flight lock recovers after one minute

---
