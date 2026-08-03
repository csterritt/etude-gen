## Issue 29: Artifact Store over private R2 with bounded lifecycle and cleanup retries

**Type**: AFK
**Blocked by**: Issue 1

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Build the Artifact Store module that owns private R2 score artifacts: storing and retrieving bounded SVG and PDF data under opaque identifiers that contain no user identifier, validating expected object metadata, and deleting with the defined retry policy. It exposes no public URL and no user-derived key.

Deletion makes one initial attempt followed by three retries delayed 100, 200, and 400 milliseconds. Exhaustion emits a structured `artifact_cleanup_exhausted` log containing exactly `artifactId`, `artifactKind` (`svg` or `pdf`), `cleanupReason` (`replacement`, `start_over`, `grant_consumed`, `grant_expired`, or `account_deleted`), `attemptCount`, `lastErrorCategory`, `correlationId`, and `occurredAt`; the calling user operation still proceeds. Failures are typed missing, size, storage, or cleanup-exhausted categories.

### How to verify

- **Manual**: store an artifact in development and confirm no public URL exists for it and that it is only reachable through the authenticated binding.
- **Automated**: Bun tests against a fake R2 boundary asserting round-trip storage and retrieval, that identifiers are opaque and contain no user identifier, actual byte-limit enforcement on both write and read, a typed missing failure for an absent object, a typed mismatch failure when object metadata does not match expectations, replacement semantics, the exact retry count and 100/200/400 millisecond delays, and the exact `artifact_cleanup_exhausted` event name and field set after exhaustion.

### Acceptance criteria

- [ ] Given bytes within the limit, when they are stored, then they can be retrieved unchanged through the authenticated binding and have no public URL.
- [ ] Given bytes over the limit, then a typed size failure is returned and nothing is stored.
- [ ] Given a missing object or mismatched metadata, then the typed missing or mismatch failure is returned rather than partial data.
- [ ] Given a delete that keeps failing, then exactly one initial attempt and three retries are made at 100, 200, and 400 milliseconds.
- [ ] Given exhausted cleanup, then one `artifact_cleanup_exhausted` log event is emitted with exactly the specified fields, containing no user identifier, and the caller's operation still completes.

### User stories addressed

- User story 64: Failed private-artifact deletions retried three times and then logged as unreachable orphans

---
