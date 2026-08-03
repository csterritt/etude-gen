## Issue 36: PDF grant lifecycle — expiry, single use, and safe recovery

**Type**: AFK
**Blocked by**: Issue 35

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Bound the temporary PDF download grant exactly as the PRD specifies: it belongs to the authenticated user, expires after 15 minutes, and can be consumed once. The download GET prepares the bounded attachment, atomically consumes the grant, and initiates object cleanup with `cleanupReason` `grant_consumed`. Expired, consumed, foreign, or missing grants never expose object details and redirect the owner to their score with an actionable safe error.

Later etude activity by the owner detects expired grants, atomically revokes them, and attempts physical PDF cleanup with `cleanupReason` `grant_expired`; no background job is required.

### How to verify

- **Manual**: download a PDF, then reload the download URL and confirm you are redirected to the score with a safe error rather than a second download; create a grant, wait past expiry (or advance the clock in test), perform another etude action, and confirm the grant is revoked.
- **Automated**: Bun tests over the repository and Workflow Service asserting single consumption under repeated attempts, expiry at 15 minutes, rejection of another user's grant identifier without revealing whether it exists, rejection of an unknown identifier, atomic revocation of expired grants on later owner activity, and cleanup invoked with the correct reasons. Playwright tests cover the second-download redirect with a safe message and recovery within the normal workflow.

### Acceptance criteria

- [ ] Given a valid grant, when the download completes, then the grant is atomically consumed and object cleanup begins with reason `grant_consumed`.
- [ ] Given an already consumed grant, when the download URL is requested again, then the owner is redirected to the score with an actionable safe error and no bytes are served.
- [ ] Given a grant older than 15 minutes, then it cannot be downloaded.
- [ ] Given a grant identifier belonging to another user or not existing at all, then the response reveals no object details and does not distinguish the two cases.
- [ ] Given later etude activity by the owner with an expired grant present, then the grant is atomically revoked and cleanup is attempted with reason `grant_expired`.

### User stories addressed

- User story 57: The temporary PDF download remains available for 15 minutes and permits one download
- User story 58: Expired, consumed, or missing PDF downloads redirect to the score with a safe error

---
