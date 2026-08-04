## Issue 38: Start a new piece clears the complete aggregate

**Type**: AFK
**Blocked by**: Issue 35

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Deliver `POST /etude/start-over`: clearing all current parameters, Piece data, score artifacts, operation state, and download grants, then returning the student to a fresh setup step with the practical defaults from Issue 4. D1 reachability is revoked before or regardless of artifact cleanup completion, and cleanup runs through the Artifact Store retry policy with `cleanupReason` `start_over`.

Start Over is available from the score page and from the workflow steps, follows the PRG pattern with a 303 redirect, and does not restore anything afterwards — there is no history or undo in v1.

### Cross-cutting contract

This issue **builds** the epoch bump named in section 4 of
`Notes/issues/etude-cross-cutting-contract.md`. Sections 1, 3 and 4 apply:
`POST /etude/start-over` is an operation POST that checks the workflow version as a
precondition, and it is the operation that increments the aggregate epoch.

### Start Over while work is in flight

Start Over never waits for an in-flight generation, render retry, or PDF request, and it never
tries to cancel one. Instead it makes the in-flight request's authority worthless:

- The clearing transition **increments the aggregate epoch**. Every conditional commit made by
  an operation request carries the epoch it captured at lock acquisition, so a request that was
  calling LilyPond or writing R2 while Start Over ran can no longer commit a Piece, a
  supersession, a render state, a cooldown timestamp, or a grant.
- Both in-flight locks are cleared. Because the former owner's release is conditional on both
  its owner token and its captured epoch, the former owner cannot release a lock that a later
  request has since acquired, and it cannot resurrect its own lock.
- The former owner therefore cannot recreate current Piece, render, grant, or cooldown state
  after the clear. Its work simply ends in a rejected commit and a safe message.
- An artifact the former owner had already written to R2, or writes after losing authority, is
  by definition unreachable. On a rejected commit the writing request cleans it up with
  `cleanupReason` `commit_failed` (Issue 29). If the write completes after the request has
  already observed the rejection, the write is followed immediately by the same cleanup, and an
  exhausted cleanup emits the `artifact_cleanup_exhausted` orphan log with that reason, which is
  the recorded handoff to privileged operational handling. No artifact is written without a
  cleanup path.
- Because the epoch, not the workflow version, is the guard, resetting parameters back to
  defaults cannot accidentally make a stale request's version comparison succeed.

### How to verify

- **Manual**: generate a score, create a PDF grant, then use Start a new piece and confirm you land on a fresh setup step with defaults, the score and PDF controls are gone, and the previous download URL no longer works.
- **Automated**: Bun tests over the Workflow Service asserting every part of the aggregate is cleared — parameters back to defaults, Piece removed, artifact references revoked, locks and cooldown timestamps reset, grants revoked, aggregate epoch incremented — and that cleanup is invoked with reason `start_over` for each reachable artifact. Concurrency tests run Start Over at every external-work boundary of an in-flight generation, render retry, and PDF request — after lock acquisition, after Piece persistence, during the LilyPond call, after the R2 write, and immediately before the final commit — asserting in each case that the former owner's commit is rejected, that it cannot release a replacement's lock, that no Piece, render state, grant, or cooldown is created, and that any artifact it wrote is unreachable and cleaned up with reason `commit_failed`. A further test asserts that the reset of parameters to defaults cannot make a stale request's version check succeed. Playwright tests assert the fresh defaults, the unreachable prior download, and the 303 redirect.

### Acceptance criteria

- [ ] Given any workflow state, when Start a new piece is submitted, then parameters return to the practical defaults and the student lands on the setup step.
- [ ] Given a current Piece and artifacts, when Start Over runs, then their D1 reachability is revoked and cleanup begins with reason `start_over`.
- [ ] Given an outstanding PDF grant, when Start Over runs, then the grant is revoked and its download URL no longer serves bytes.
- [ ] Given operation state, when Start Over runs, then locks and cooldown timestamps are cleared.
- [ ] Given cleanup that fails and exhausts its retries, then Start Over still completes for the student.
- [ ] Given Start Over, then the aggregate epoch is incremented in the same committed transition as the clearing.
- [ ] Given an in-flight generation, render retry, or PDF request at any external-work boundary, when Start Over runs, then that request cannot commit a Piece, supersession, render state, cooldown timestamp, or grant.
- [ ] Given a former lock owner after Start Over, then it cannot release a lock acquired by a later request and cannot resurrect its own.
- [ ] Given an artifact written by a request that lost authority, then it is unreachable and cleanup is invoked with reason `commit_failed`, with the orphan log emitted if cleanup exhausts its retries.
- [ ] Given parameters reset to defaults, then no stale request's workflow-version comparison can succeed, because the epoch is the guard.

### User stories addressed

- User story 59: Start a new piece clears all current parameters, Piece data, artifacts, operation state, and grants

---
