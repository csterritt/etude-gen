## Issue 39: Retention until cleared and full etude cleanup on account deletion

**Type**: AFK
**Blocked by**: Issue 38

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Confirm and enforce the retention rule — current etude data has no inactivity expiration and remains until Start Over, replacement, or account deletion — and integrate etude cleanup into the existing account-deletion flow so no user-accessible etude data survives.

Extend `handle-delete-account.ts` and `deleteUserAccount` in `src/lib/db-access.ts` so deleting an account removes or revokes all etude parameters, Pieces, grants, locks, cooldowns, and reachable artifacts, with artifact cleanup running through the Artifact Store retry policy using `cleanupReason` `account_deleted`. The D1 records cascade from the user row; artifact revocation must not depend on cleanup succeeding.

### How to verify

- **Manual**: generate a score and a PDF grant, delete the account, and confirm the account is gone, the download URL no longer serves bytes, and no etude rows remain for that user.
- **Automated**: Bun tests asserting cascade removal of all three etude records, revocation of grants and artifact references, invocation of cleanup with reason `account_deleted`, and that deletion still completes when cleanup exhausts its retries. A further test asserts that a long-idle aggregate is still intact — nothing expires it. A Playwright test covers deletion after a full etude workflow and confirms the previous download URL fails safely.

### Acceptance criteria

- [ ] Given an untouched workflow, when arbitrary time passes, then its parameters, Piece, and artifacts remain available.
- [ ] Given account deletion, then all etude parameters, Piece data, grants, locks, and cooldowns are removed.
- [ ] Given account deletion with reachable artifacts, then their reachability is revoked and cleanup is attempted with reason `account_deleted`.
- [ ] Given cleanup that fails and exhausts its retries during deletion, then the account deletion still completes and the orphan log is emitted.
- [ ] Given a previously issued download URL after deletion, then it serves no bytes and reveals no object details.

### User stories addressed

- User story 60: Etude data retained until cleared or the account is deleted
- User story 61: Account deletion removes or revokes all etude data and reachable artifacts

---
