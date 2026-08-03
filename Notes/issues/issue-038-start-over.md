## Issue 38: Start a new piece clears the complete aggregate

**Type**: AFK
**Blocked by**: Issue 35

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Deliver `POST /etude/start-over`: clearing all current parameters, Piece data, score artifacts, operation state, and download grants, then returning the student to a fresh setup step with the practical defaults from Issue 4. D1 reachability is revoked before or regardless of artifact cleanup completion, and cleanup runs through the Artifact Store retry policy with `cleanupReason` `start_over`.

Start Over is available from the score page and from the workflow steps, follows the PRG pattern with a 303 redirect, and does not restore anything afterwards — there is no history or undo in v1.

### How to verify

- **Manual**: generate a score, create a PDF grant, then use Start a new piece and confirm you land on a fresh setup step with defaults, the score and PDF controls are gone, and the previous download URL no longer works.
- **Automated**: Bun tests over the Workflow Service asserting every part of the aggregate is cleared — parameters back to defaults, Piece removed, artifact references revoked, locks and cooldown timestamps reset, grants revoked — and that cleanup is invoked with reason `start_over` for each reachable artifact. Playwright tests assert the fresh defaults, the unreachable prior download, and the 303 redirect.

### Acceptance criteria

- [ ] Given any workflow state, when Start a new piece is submitted, then parameters return to the practical defaults and the student lands on the setup step.
- [ ] Given a current Piece and artifacts, when Start Over runs, then their D1 reachability is revoked and cleanup begins with reason `start_over`.
- [ ] Given an outstanding PDF grant, when Start Over runs, then the grant is revoked and its download URL no longer serves bytes.
- [ ] Given operation state, when Start Over runs, then locks and cooldown timestamps are cleared.
- [ ] Given cleanup that fails and exhausts its retries, then Start Over still completes for the student.

### User stories addressed

- User story 59: Start a new piece clears all current parameters, Piece data, artifacts, operation state, and grants

---
