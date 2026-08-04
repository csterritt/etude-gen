## Issue 34: New-Piece success cooldown that only successes consume

**Type**: AFK
**Blocked by**: Issue 33

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Limit successful etude generation to one per minute using the last-success timestamp described in the PRD's "Data and concurrency" section, kept separate from the in-flight lock. The 60-second cooldown starts only after Piece persistence, valid SVG receipt, sanitization, private R2 persistence, and the final D1 state update have all succeeded, so validation, service, sanitization, and storage failures never block recovery. Rendering retry is never blocked by this cooldown.

A student inside the cooldown sees a clear message telling them when they can generate again, and no new Piece is created.

The cooldown is per user and per aggregate, not per Piece. It is not reset by the current Piece being superseded, by any parameter change, or by Start Over having been used earlier in the same minute. Start Over clearing the timestamp is owned by Issue 38 and is the single exception; nothing else in this slice clears or shortens it.

Boundary semantics are exact: generation is refused when the elapsed time since the recorded success timestamp is strictly less than 60,000 milliseconds, and is allowed at exactly 60,000 milliseconds. Tests use a controlled, injected clock rather than real waiting, with cases at 59,999 ms, exactly 60,000 ms, and 60,001 ms.

A refused attempt does no work at all: no Piece is created, no generation/render lock is acquired, no LilyPond call is made, nothing is written to R2, and the current Piece is not superseded.

### Cross-cutting contract

Inherits `Notes/issues/etude-cross-cutting-contract.md`:

- Section 1: universal route requirements — authenticated, no-cache, owner-scoped, and a 303 redirect with a safe message on refusal.
- Section 3: operation-POST contract — `workflowVersion` is a precondition and is not incremented, and a refusal does no external work, acquires no lock, and changes no state.
- Section 4: concurrency tokens — `POST /etude/generate` carries the new-Piece cooldown alongside the generation/render lock owner token and the aggregate epoch; `POST /etude/render/retry` is exempt from this cooldown.

### How to verify

- **Manual**: generate successfully, then press Generate again immediately and confirm the refusal message; force a rendering failure and confirm Retry rendering and a subsequent Generate are not blocked.
- **Automated**: Bun tests over the repository and Workflow Service with an injected clock asserting the timestamp is recorded only after the full success sequence, refusal at 59,999 ms, permission at exactly 60,000 ms and at 60,001 ms, that a refused attempt creates no Piece, acquires no lock, makes no LilyPond call and does not supersede the current Piece, that a replacement generation attempted during the same cooldown after a parameter change or supersession is still refused, that each failure category leaves the timestamp untouched, and that render retry ignores this cooldown. Playwright tests cover the cooldown message and unaffected retry, following the existing resend/reset cooldown tests as prior art for time-based behavior.

### Acceptance criteria

- [ ] Given a fully successful generation, then the new-Piece cooldown timestamp is recorded at that moment.
- [ ] Given elapsed time strictly less than 60,000 ms since the recorded success timestamp, then generation is refused with an informative message; at exactly 60,000 ms and beyond it is allowed.
- [ ] Given a controlled clock in tests, then the 59,999 ms, 60,000 ms, and 60,001 ms cases are all covered without real waiting.
- [ ] Given a generation attempt inside the cooldown, then it creates no Piece, acquires no lock, performs no LilyPond call, and does not supersede the current Piece.
- [ ] Given the cooldown is per user and per aggregate, then it is not reset by the Piece being superseded, by a parameter change, or by a replacement generation attempt; only Start Over clears it, and that clearing is owned by Issue 38.
- [ ] Given a validation, service, sanitization, storage, or commit failure, then the cooldown timestamp is unchanged.
- [ ] Given an active new-Piece cooldown, then Retry rendering is still permitted.

### User stories addressed

- User story 49: Successful etude generation limited to one per minute
- User story 50: Failed generation or rendering attempts do not consume the success cooldown

---
