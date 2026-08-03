## Issue 33: Generation and render in-flight lock with owner identity and expiry recovery

**Type**: AFK
**Blocked by**: Issue 30

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Prevent concurrent generation for one student and recover from crashed requests. Add the per-user in-flight lock described in the PRD's "Data and concurrency" section: acquisition is a conditional write, each acquired lock carries an unpredictable owner identifier held by that request, and the lock expires exactly 60 seconds after acquisition so a later request can atomically replace it.

Work proceeds in the specified order while the request owns the lock — domain validation and generation, conditional Piece persistence and supersession, the LilyPond call, response validation and sanitization, the private R2 write, and the final conditional render-state commit — and every commit and release verifies the current owner identifier still matches. A request whose expired lock was replaced cannot commit results or release its replacement's lock. Every non-success path after acquisition conditionally releases its own lock, and successful completion releases it too; expiry is crash-recovery safety, not the normal release path. Both `POST /etude/generate` and `POST /etude/render/retry` use this lock.

### How to verify

- **Manual**: start a generation and submit a second one immediately from another tab; confirm the second is refused with a clear message and the first completes normally.
- **Automated**: Bun tests over the repository and Workflow Service asserting conditional acquisition, that a second acquisition fails while a live lock is held, that a lock older than 60 seconds is atomically replaceable, that the former owner's commit and release are both rejected after replacement, that owner identifiers are unpredictable and not derived from the user identifier, and that every failure category releases the lock. Playwright tests cover the concurrent-submission message and post-crash recovery after expiry.

### Acceptance criteria

- [ ] Given a live in-flight lock, when a second generation or retry is submitted, then it is refused and no second Piece is created.
- [ ] Given a lock acquired more than 60 seconds ago, when a later request acquires it, then the replacement succeeds atomically.
- [ ] Given a request whose lock was replaced, then its commits and its release attempt are both rejected.
- [ ] Given any failure after acquisition, then the owning request conditionally releases its own lock.
- [ ] Given successful completion, then the lock is conditionally released rather than left to expire.

### User stories addressed

- User story 48: No more than one new Piece generation in flight at a time
- User story 51: An expired in-flight lock recovers after one minute

---
