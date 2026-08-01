## Issue 19: Start Over + account-deletion cleanup

**Type**: AFK
**Blocked by**: Issue 18

### Parent PRD

`PRD-etude-generator.md`

### What to build

The two ways etude data ends, end-to-end. `POST /etude/start-over` clears the complete aggregate — all current parameters, Piece data, score artifacts, operation state (locks, cooldowns), and download grants — revoking D1 reachability before or regardless of artifact cleanup completion, and returns the student to a fresh setup step with PRD defaults. Current data otherwise has no inactivity expiration: it remains until Start Over, replacement, or account deletion. Account deletion (integrating with the existing Better Auth account-deletion path without redesigning it) removes or revokes all etude parameters, Pieces, grants, locks, cooldowns, and reachable artifacts for the deleted user, relying on the cascade-deletion semantics from Issue 1 plus artifact cleanup.

### How to verify

- **Manual**: build a complete workflow with a generated score and an active PDF grant, click Start a new piece, and confirm a fresh defaulted setup step plus unreachable old score and grant URLs; delete the account (via existing account flows) and confirm no etude data or artifact remains reachable.
- **Automated**: Workflow Service tests for Start Over clearing every state category and revoking reachability before cleanup, and for account-deletion cleanup across all three records and artifacts; repository tests for cascade behavior; Playwright tests for the Start Over flow landing on defaulted setup and for data retention across sessions without Start Over.

### Acceptance criteria

- [ ] Given an active workflow with score and grant, when the student starts over, then parameters, Piece, artifacts, operation state, and grants are cleared or revoked and the setup step shows fresh defaults.
- [ ] Given an inactive workflow, when time passes without Start Over, then all etude data is retained unchanged.
- [ ] Given account deletion, when it completes, then no etude parameters, Pieces, grants, locks, cooldowns, or reachable artifacts survive for that user.
- [ ] Given an artifact cleanup failure during Start Over or deletion, then reachability is still revoked and the retry/orphan policy from Issue 13 applies.

### User stories addressed

- User story 59: Start a new piece clears everything
- User story 60: data retained until cleared or account deleted
- User story 61: account deletion removes all etude data and artifacts

---
