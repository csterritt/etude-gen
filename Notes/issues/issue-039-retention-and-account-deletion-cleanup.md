## Issue 39: Retention until cleared and full etude cleanup on account deletion

**Type**: AFK
**Blocked by**: Issue 38

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Confirm and enforce the retention rule — current etude data has no inactivity expiration and remains until Start Over, replacement, or account deletion — and integrate etude cleanup into the existing account-deletion flow so no user-accessible etude data survives.

Extend `handle-delete-account.ts` and `deleteUserAccount` in `src/lib/db-access.ts` so deleting an account removes or revokes all etude parameters, Pieces, grants, locks, cooldowns, and reachable artifacts, with artifact cleanup running through the Artifact Store retry policy using `cleanupReason` `account_deleted`. The D1 records cascade from the user row; artifact revocation must not depend on cleanup succeeding.

### Cross-cutting contract

This issue **builds** the terminal epoch named in section 4 of
`Notes/issues/etude-cross-cutting-contract.md`. Section 1 applies to the deletion route
itself, and section 7 applies to the cleanup logging.

### Required ordering

D1 cascade deletion destroys the very rows that hold the artifact identifiers, so cleanup must
not depend on reading them afterwards. The order is fixed:

1. **Capture** the owner-scoped artifact references — every current and superseded SVG and PDF
   identifier still recorded for that user — into request-local state, while the rows still
   exist.
2. **Revoke** reachability and move the aggregate epoch to a terminal value that no captured
   epoch can ever match, so no in-flight request can commit anything afterwards.
3. **Delete** the user row and let the etude records cascade.
4. **Clean up** best-effort using the captured opaque identifiers, with
   `cleanupReason` `account_deleted`.

If step 3 fails, the account is not deleted and the student sees the existing generic retry
message; because step 2 already revoked reachability, no etude data is reachable in the
meantime, and a retry re-captures and proceeds. If step 4 fails and exhausts its retries, the
deletion still stands and the `artifact_cleanup_exhausted` orphan log records each opaque
identifier for privileged operational handling.

### Deletion while work is in flight

The terminal epoch is what makes this safe. A generation, render retry, or PDF request that was
calling LilyPond or writing R2 when the account was deleted cannot commit a Piece, a render
state, a cooldown, or a grant, and cannot release a lock, because its captured epoch will never
match again. Any artifact it had written, or writes after losing authority, is unreachable and is
cleaned up with `cleanupReason` `commit_failed` (Issue 29); an exhausted cleanup emits the orphan
log. No path exists by which a deleted account's request publishes a new artifact reference.

### How to verify

- **Manual**: generate a score and a PDF grant, delete the account, and confirm the account is gone, the download URL no longer serves bytes, and no etude rows remain for that user.
- **Automated**: Bun tests asserting the capture-revoke-delete-clean order, cascade removal of all three etude records, revocation of grants and artifact references, invocation of cleanup with reason `account_deleted` for every captured identifier including superseded ones, that no cleanup call needs to read a deleted row, and that deletion still completes when cleanup exhausts its retries. Failure tests cover a D1 deletion failure after revocation (the account survives, nothing etude-related is reachable, a retry succeeds) and a cleanup failure after successful deletion. Concurrency tests delete the account at each external-work boundary of an in-flight generation, render retry, and PDF request, asserting the request cannot publish a Piece, render state, grant, cooldown, or artifact reference, and that any artifact it wrote is cleaned up with reason `commit_failed`. A controlled-clock test advances the clock well past any plausible expiry window and asserts the aggregate, Piece, and artifacts are untouched and that no code path exists that expires or sweeps current etude state. A Playwright test covers deletion after a full etude workflow and confirms the previous download URL fails safely.

### Acceptance criteria

- [ ] Given an untouched workflow, when the clock is advanced arbitrarily far in a controlled-clock test, then its parameters, Piece, and artifacts are unchanged and no expiry or sweep path removes current state.
- [ ] Given account deletion, then artifact references are captured and reachability revoked before the rows are deleted, and every cleanup call uses a captured opaque identifier rather than reading a deleted row.
- [ ] Given a D1 deletion failure after revocation, then the account is not deleted, no etude data is reachable, the student sees the generic retry message, and a retry completes the deletion.
- [ ] Given account deletion, then the aggregate epoch is moved to a terminal value that no captured epoch can match.
- [ ] Given an in-flight generation, render retry, or PDF request at any external-work boundary, when the account is deleted, then that request cannot publish a Piece, render state, grant, cooldown, or artifact reference, and any artifact it wrote is cleaned up with reason `commit_failed`.
- [ ] Given account deletion, then all etude parameters, Piece data, grants, locks, and cooldowns are removed.
- [ ] Given account deletion with reachable artifacts, then their reachability is revoked and cleanup is attempted with reason `account_deleted`.
- [ ] Given cleanup that fails and exhausts its retries during deletion, then the account deletion still completes and the orphan log is emitted.
- [ ] Given a previously issued download URL after deletion, then it serves no bytes and reveals no object details.

### User stories addressed

- User story 60: Etude data retained until cleared or the account is deleted
- User story 61: Account deletion removes or revokes all etude data and reachable artifacts

---
