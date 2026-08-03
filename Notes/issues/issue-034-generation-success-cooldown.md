## Issue 34: New-Piece success cooldown that only successes consume

**Type**: AFK
**Blocked by**: Issue 33

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Limit successful etude generation to one per minute using the last-success timestamp described in the PRD's "Data and concurrency" section, kept separate from the in-flight lock. The 60-second cooldown starts only after Piece persistence, valid SVG receipt, sanitization, private R2 persistence, and the final D1 state update have all succeeded, so validation, service, sanitization, and storage failures never block recovery. Rendering retry is never blocked by this cooldown.

A student inside the cooldown sees a clear message telling them when they can generate again, and no new Piece is created.

### How to verify

- **Manual**: generate successfully, then press Generate again immediately and confirm the refusal message; force a rendering failure and confirm Retry rendering and a subsequent Generate are not blocked.
- **Automated**: Bun tests over the repository and Workflow Service asserting the timestamp is recorded only after the full success sequence, that a generation within 60 seconds of that timestamp is refused with no Piece created, that one just after 60 seconds is allowed, that each failure category leaves the timestamp untouched, and that render retry ignores this cooldown. Playwright tests cover the cooldown message and unaffected retry, following the existing resend/reset cooldown tests as prior art for time-based behavior.

### Acceptance criteria

- [ ] Given a fully successful generation, then the new-Piece cooldown timestamp is recorded at that moment.
- [ ] Given a generation attempt within 60 seconds of the last success, then it is refused with an informative message and no Piece is created.
- [ ] Given an attempt after the 60 seconds elapse, then generation proceeds.
- [ ] Given a validation, service, sanitization, storage, or commit failure, then the cooldown timestamp is unchanged.
- [ ] Given an active new-Piece cooldown, then Retry rendering is still permitted.

### User stories addressed

- User story 49: Successful etude generation limited to one per minute
- User story 50: Failed generation or rendering attempts do not consume the success cooldown

---
