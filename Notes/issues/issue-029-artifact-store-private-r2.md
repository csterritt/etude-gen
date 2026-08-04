## Issue 29: Artifact Store over private R2 with bounded lifecycle and cleanup retries

**Type**: AFK
**Blocked by**: Issue 1

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Build the Artifact Store module that owns private R2 score artifacts: storing and retrieving bounded SVG and PDF data under opaque identifiers that contain no user identifier, validating expected object metadata, and deleting with the defined retry policy. It exposes no public URL and no user-derived key.

Deletion makes one initial attempt followed by three retries delayed 100, 200, and 400 milliseconds. Exhaustion emits a structured `artifact_cleanup_exhausted` log containing exactly `artifactId`, `artifactKind` (`svg` or `pdf`), `cleanupReason`, `attemptCount`, `lastErrorCategory`, `correlationId`, and `occurredAt`; the calling user operation still proceeds. Failures are typed missing, size, storage, or cleanup-exhausted categories.

### Cleanup reasons

The permitted `cleanupReason` values are `replacement`, `start_over`, `grant_consumed`,
`grant_expired`, `account_deleted`, and `commit_failed`.

`commit_failed` is added by this issue set. The PRD's original enumeration has no value for
the orphan path Issue 40 creates: a successful R2 write followed by a failed D1 commit
leaves a written object that never became reachable. Without a dedicated reason, Issue 40
cannot specify its required recovery and the orphan log cannot distinguish an accidental
orphan from a deliberate revocation. It is used for exactly that case — including a commit
rejected because the request lost its lock owner token or because the aggregate epoch moved
(section 4 of `Notes/issues/etude-cross-cutting-contract.md`) — and for no other.

### Object metadata contract

"Expected object metadata" is defined here so mismatch behaviour is testable. Every stored
object carries, and every read validates:

| Field                    | Meaning                                         | Authoritative source                                |
| ------------------------ | ----------------------------------------------- | --------------------------------------------------- |
| `artifactKind`           | `svg` or `pdf`                                  | D1                                                  |
| `contentType`            | `image/svg+xml` or `application/pdf`            | D1                                                  |
| `byteLength`             | exact stored byte count                         | D1, verified against the actual bytes read          |
| `pieceId`                | the Piece UUID the artifact was produced from   | D1                                                  |
| `sourceParameterVersion` | the Piece's source workflow version             | D1                                                  |
| `checksum`               | digest over the stored bytes                    | computed on write, stored in D1, recomputed on read |
| `rendererVersion`        | LilyPond version string reported by the service | the service, recorded via Issue 27                  |
| `createdAt`              | write timestamp                                 | R2/D1, diagnostic only                              |

D1 is authoritative for reachability and for every field above except `rendererVersion`,
which originates at the service. The object's own R2 metadata is a copy used for defence in
depth; on any disagreement between D1 and the object, D1 wins and the read is a typed
mismatch failure. Physical key formatting stays private and is never asserted by tests; the
semantic fields above are.

A read whose `artifactKind`, `contentType`, `byteLength`, `pieceId`,
`sourceParameterVersion`, or `checksum` does not match the caller's expectation returns a
typed mismatch failure and no bytes, even if an object exists.

### Byte limits

The store enforces 5 MB for `svg` and 10 MB for `pdf` against actual bytes on both write and
read. This duplicates the renderer's limits from Issue 27 deliberately, as defence in depth,
so an artifact can never exceed its ceiling because a renderer check was bypassed or
changed. A declared content length is never accepted in place of counting bytes.

### How to verify

- **Manual**: store an artifact in development and confirm no public URL exists for it and that it is only reachable through the authenticated binding.
- **Automated**: Bun tests against a fake R2 boundary asserting round-trip storage and retrieval, that identifiers are opaque and contain no user identifier, actual byte-limit enforcement on both write and read at 5 MB for SVG and 10 MB for PDF including the exact-boundary and one-byte-over cases with an understated declared length, a typed missing failure for an absent object, a typed mismatch failure for each metadata field individually, a mismatch when the object's own metadata disagrees with D1, a checksum mismatch on read, replacement semantics, the exact retry count and 100/200/400 millisecond delays, and the exact `artifact_cleanup_exhausted` event name and field set after exhaustion for each of the six permitted `cleanupReason` values including `commit_failed`. A further test asserts no test depends on the physical key format.

### Acceptance criteria

- [ ] Given bytes within the limit, when they are stored, then they can be retrieved unchanged through the authenticated binding and have no public URL.
- [ ] Given bytes over the limit for the artifact kind, then a typed size failure is returned and nothing is stored, and the limit is enforced against actual bytes rather than a declared length on both write and read.
- [ ] Given a missing object, then a typed missing failure is returned rather than partial data.
- [ ] Given a mismatch in `artifactKind`, `contentType`, `byteLength`, `pieceId`, `sourceParameterVersion`, or `checksum`, then a typed mismatch failure is returned and no bytes are produced.
- [ ] Given a disagreement between D1 and the object's own metadata, then D1 is authoritative and the read is a typed mismatch failure.
- [ ] Given a delete that keeps failing, then exactly one initial attempt and three retries are made at 100, 200, and 400 milliseconds.
- [ ] Given exhausted cleanup, then one `artifact_cleanup_exhausted` log event is emitted with exactly the specified fields, containing no user identifier, and the caller's operation still completes.
- [ ] Given a cleanup request, then its `cleanupReason` is one of `replacement`, `start_over`, `grant_consumed`, `grant_expired`, `account_deleted`, or `commit_failed`, and any other value is rejected.
- [ ] Given an object written successfully whose D1 commit then fails, then cleanup is invocable with reason `commit_failed` and the object is never readable through the store.

### User stories addressed

- User story 64: Failed private-artifact deletions retried three times and then logged as unreachable orphans

---
