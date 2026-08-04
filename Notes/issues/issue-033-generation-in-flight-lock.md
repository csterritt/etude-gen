## Issue 33: Two independent in-flight locks — generation/render and PDF — with owner identity and expiry recovery

**Type**: AFK
**Blocked by**: Issue 30

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Prevent concurrent expensive work for one student and recover from crashed requests. The PRD requires new-Piece generation and PDF generation to have **two distinct in-flight locks**, so this issue defines both rather than one. Each is a per-user lock whose acquisition is a conditional write, each acquired lock carries an unpredictable owner identifier held by that request, and each expires exactly 60 seconds after acquisition so a later request can atomically replace it.

Work proceeds in the specified order while the request owns the generation/render lock — domain validation and generation, conditional Piece persistence and supersession, the LilyPond call, response validation and sanitization, the private R2 write, and the final conditional render-state commit — and every commit and release verifies the current owner identifier still matches. A request whose expired lock was replaced cannot commit results or release its replacement's lock. Every non-success path after acquisition conditionally releases its own lock, and successful completion releases it too; expiry is crash-recovery safety, not the normal release path.

### Cross-cutting contract

This issue **builds** the lock-owner column of the applicability matrix in
`Notes/issues/etude-cross-cutting-contract.md`. Sections 1, 3 and 4 apply; section 4's token
table is the authoritative statement of which route uses which lock.

### The two locks

Both locks live in the operation record created in Issue 20 and are **structurally
identical but completely independent**. Each has its own set of fields:

| Field            | Generation/render lock                             | PDF lock            |
| ---------------- | -------------------------------------------------- | ------------------- |
| Owner token      | `generationLockOwner`                              | `pdfLockOwner`      |
| Acquisition time | `generationLockAcquiredAt`                         | `pdfLockAcquiredAt` |
| Captured epoch   | `generationLockEpoch`                              | `pdfLockEpoch`      |
| Used by          | `POST /etude/generate`, `POST /etude/render/retry` | `POST /etude/pdf`   |

Every rule below applies to each lock separately and with the same semantics:

- Acquisition is a single conditional write that succeeds only when that lock is free or its
  own acquisition time is more than 60 seconds old. It never inspects or waits on the other
  lock.
- The owner token is unpredictable, generated per request, and not derived from the user
  identifier, the Piece identifier, or a timestamp.
- The lock expires exactly 60 seconds after its own acquisition and may then be atomically
  replaced by a later request of the same kind.
- Every side effect, every commit, and the release itself is conditional on that lock's
  current owner token still matching, and on the epoch captured at acquisition still being
  current.
- A request whose lock was replaced can neither commit its results nor release its
  replacement's lock, and neither can it release or disturb the other lock.
- Every non-success path after acquisition, and successful completion, conditionally
  releases that request's own lock. Expiry is crash-recovery safety only.

### Independence requirements

- Holding the generation/render lock does not block acquiring the PDF lock, and vice versa,
  so a student may have a generation and a PDF request in flight simultaneously. That is the
  PRD's intent in giving them two distinct controls.
- A generation/render request never reads, writes, or releases the PDF lock fields, and a PDF
  request never touches the generation lock fields. Releasing one must leave the other
  byte-for-byte unchanged.
- An owner token valid for one lock is never accepted by the other.
- The interaction between a completing generation and an in-flight PDF request is governed by
  the shared Piece checks, not by the locks: a PDF request whose Piece is superseded or made
  stale while it was working has its final commit rejected, its artifact cleaned up with
  `cleanupReason` `commit_failed`, and its grant never created (Issues 31, 32, 35).

### How to verify

- **Manual**: start a generation and submit a second one immediately from another tab; confirm the second is refused with a clear message and the first completes normally. Then start a PDF and a generation together and confirm both proceed.
- **Automated**: Bun tests over the repository and Workflow Service, run against **each lock**, asserting conditional acquisition, that a second acquisition of the same lock fails while a live lock is held, that a lock older than 60 seconds is atomically replaceable, that the former owner's commit and release are both rejected after replacement, that owner identifiers are unpredictable and not derived from the user identifier, that an owner token for one lock is rejected by the other, and that every failure category releases the correct lock and leaves the other untouched. Independence tests assert concurrent generation and PDF requests both acquire, that releasing one leaves the other unchanged, and that a PDF request is never refused because a generation lock is held. Crash tests cover a request that dies immediately after acquisition but before any work, and lock loss injected at each stage — after generation, after Piece persistence, after the LilyPond call, after the R2 write, and at the final commit — asserting nothing is published in every case. Playwright tests cover the concurrent-submission message for each lock and post-crash recovery after expiry.

### Acceptance criteria

- [ ] Given a live generation/render lock, when a second generation or retry is submitted, then it is refused and no second Piece is created.
- [ ] Given a live PDF lock, when a second PDF request is submitted, then it is refused, no LilyPond call is made, nothing is stored, and no grant is created.
- [ ] Given a live generation/render lock, then a PDF request can still acquire the PDF lock, and vice versa.
- [ ] Given a lock acquired more than 60 seconds ago, when a later request of the same kind acquires it, then the replacement succeeds atomically; a lock of the other kind is unaffected.
- [ ] Given a request whose lock was replaced, then its commits and its release attempt are both rejected and the replacement's lock remains held.
- [ ] Given an owner token for one lock, then it is never accepted as the owner of the other lock.
- [ ] Given a release of either lock, then the other lock's fields are unchanged.
- [ ] Given any failure after acquisition, then the owning request conditionally releases its own lock.
- [ ] Given successful completion, then the lock is conditionally released rather than left to expire.
- [ ] Given a request that dies immediately after acquisition before doing any work, then the lock is recoverable after 60 seconds and no partial state was committed.
- [ ] Given lock loss injected after generation, after Piece persistence, after the LilyPond call, after the R2 write, or at the final commit, then nothing is published, no cooldown is consumed, and any written artifact is cleaned up with reason `commit_failed`.

### User stories addressed

- User story 48: No more than one new Piece generation in flight at a time
- User story 51: An expired in-flight lock recovers after one minute

---
