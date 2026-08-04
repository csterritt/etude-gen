## Issue 36: PDF grant lifecycle — expiry, single use, and safe recovery

**Type**: AFK
**Blocked by**: Issue 35

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Bound the temporary PDF download grant exactly as the PRD specifies: it belongs to the authenticated user, expires after 15 minutes, and can be consumed once. Expired, consumed, foreign, or missing grants never expose object details and redirect the owner to their score with an actionable safe error.

Later etude activity by the owner detects expired grants, atomically revokes them, and attempts physical PDF cleanup with `cleanupReason` `grant_expired`; no background job is required.

### Cross-cutting contract

`Notes/issues/etude-cross-cutting-contract.md` applies:

- Section 1 — the download GET requires the authenticated session and no-cache headers like
  every other etude route. Authentication is checked **before** the grant is looked at, so an
  anonymous request never reveals whether a grant identifier exists.
- Section 4 — the download GET's concurrency control is the single-use grant plus the
  aggregate epoch; it carries no workflow version.

### Exact delivery order

"When the download completes" is not observable to a server: no server can know that a
browser received an entire response body, and deleting an object while streaming it from R2
is a race. The required order is therefore:

1. Authenticate the session. An anonymous request is denied without any grant lookup.
2. Load the grant scoped to the authenticated owner and verify the aggregate epoch. Unknown,
   foreign, expired, and already-consumed grants are all treated identically.
3. **Read the object into response-owned bytes** through the Artifact Store, validating the
   metadata contract from Issue 29 and the 10 MB ceiling against actual bytes. Nothing is
   consumed yet.
4. Only after that read succeeds, **atomically claim and consume the grant** with a
   conditional write. If the claim fails because another concurrent request won it, this
   request serves no bytes and redirects with the same safe error as an already-consumed
   grant; the bytes it read are discarded.
5. Build the response from the already-owned bytes, with the attachment filename, the exact
   byte length, and no streaming dependency on R2.
6. **Then** schedule object cleanup with `cleanupReason` `grant_consumed`. Cleanup never runs
   before the bytes are owned and the claim has succeeded.

Claiming after a successful bounded read, rather than before it, means a storage failure
cannot burn the student's single use. If the object read fails at step 3, the grant is left
unconsumed, no cleanup is scheduled, and the owner is redirected to the score with the
generic retry message and correlation identifier so they can request a new PDF — the failure
is not silently converted into a spent grant.

"One use" therefore means **one successful server response attempt**, not confirmed client
receipt. A student whose network drops mid-transfer has spent the grant and must request
another PDF; that is the accepted v1 behaviour and must be stated in the student-facing copy
rather than worked around.

### How to verify

- **Manual**: download a PDF, then reload the download URL and confirm you are redirected to the score with a safe error rather than a second download; create a grant, wait past expiry (or advance the clock in test), perform another etude action, and confirm the grant is revoked.
- **Automated**: Bun tests over the repository and Workflow Service asserting single consumption under repeated attempts, expiry at exactly 15 minutes with a controlled clock covering just-inside and just-outside the boundary, rejection of another user's grant identifier without revealing whether it exists, rejection of an unknown identifier, atomic revocation of expired grants on later owner activity, and cleanup invoked with the correct reasons. Ordering tests assert that an anonymous request performs no grant lookup, that a failed object read leaves the grant unconsumed and schedules no cleanup, that two concurrent download requests result in exactly one served response and one safe redirect, that the response body is built from bytes already read rather than streamed from R2, and that cleanup is scheduled only after a successful claim. Playwright tests cover the second-download redirect with a safe message and recovery within the normal workflow.

### Acceptance criteria

- [ ] Given a valid grant, then the object is read into response-owned bytes first, the grant is then atomically consumed, the response is built from those bytes, and only then does object cleanup begin with reason `grant_consumed`.
- [ ] Given an object read that fails, then the grant remains unconsumed, no cleanup is scheduled, no bytes are served, and the owner sees the generic retry message with a correlation identifier.
- [ ] Given two concurrent requests for the same grant, then exactly one serves bytes and the other is redirected with the already-consumed safe error.
- [ ] Given an anonymous request for a download URL, then authentication is refused before any grant lookup and nothing about the grant is revealed.
- [ ] Given an already consumed grant, when the download URL is requested again, then the owner is redirected to the score with an actionable safe error and no bytes are served.
- [ ] Given a grant older than 15 minutes, then it cannot be downloaded; at exactly 15 minutes it is expired, and just inside 15 minutes it is still valid, asserted with a controlled clock.
- [ ] Given a spent grant, then the student-facing copy states that one download is permitted and that an interrupted transfer requires requesting a new PDF.
- [ ] Given a grant identifier belonging to another user or not existing at all, then the response reveals no object details and does not distinguish the two cases.
- [ ] Given later etude activity by the owner with an expired grant present, then the grant is atomically revoked and cleanup is attempted with reason `grant_expired`.

### User stories addressed

- User story 57: The temporary PDF download remains available for 15 minutes and permits one download
- User story 58: Expired, consumed, or missing PDF downloads redirect to the score with a safe error

---
