## Issue 31: Rendering failure preserves the Piece and offers Retry rendering

**Type**: AFK
**Blocked by**: Issue 30

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Make rendering failures recoverable without changing the music. When generation succeeds but rendering fails, the newly generated Piece is preserved and the student is shown an explicit Retry rendering action backed by `POST /etude/render/retry`, which reuses the saved Piece, generates no new music, and re-runs serialization, the service call, sanitization, storage, and the render-state commit. Focus moves to the score heading after a successful retry, using the same one-time navigation state as Issue 21.

Every category from Issues 27, 28, and 29 — malformed, oversized, mistyped, timed-out, unsafe, and storage-failed output — is handled as a retryable rendering failure. Bad external output is never embedded, and the student sees a safe message with the correlation identifier rather than service detail.

### Cross-cutting contract

`Notes/issues/etude-cross-cutting-contract.md` applies:

- Section 1 — authentication, no-cache, owner scoping, safe messages.
- Section 3 — `POST /etude/render/retry` is an operation POST: the workflow version is a
  precondition, not incremented; the aggregate epoch and the lock owner token are verified
  immediately before every side effect and again at every commit.
- Section 4 — retry uses the generation/render lock and is exempt from the new-Piece
  cooldown.
- Section 5 — the retry state is a state of `GET /etude/score`, and every refusal redirects
  through the Issue 18 resolver.

### Rejecting a stale retry

A Retry control rendered before another tab changed the parameters must not render stale
music, and must not spend external work rendering something that will be hidden. Retry
therefore revalidates, **immediately before the LilyPond call and again at the final
commit**:

1. The submitted workflow version equals the current workflow version.
2. The aggregate epoch captured at lock acquisition is still current.
3. The Piece being retried is still the current Piece, by `pieceId`.
4. That Piece is not stale: its `sourceParameterVersion` equals the current workflow
   version.
5. The request still owns the generation/render lock, by owner token.

If any check fails **before** the call, the request performs no LilyPond call, writes
nothing, consumes no cooldown, releases its own lock conditionally, and redirects 303 to the
canonical route for the current state with a safe explanatory message. A direct
`POST /etude/render/retry` for a stale Piece is refused the same way, whether or not a Retry
control was ever displayed.

If a check fails **after** a successful R2 write but before the render-state commit, the
commit is rejected, the artifact never becomes current, and cleanup runs with
`cleanupReason` `commit_failed` (Issue 29).

Retry never regenerates music, so a refusal never changes the stored Piece.

### How to verify

- **Manual**: force a rendering failure in development, confirm the page reports a retryable failure with a Retry rendering control and no score, then make the service succeed and confirm Retry produces a score whose structured text is unchanged from the failed attempt's Piece.
- **Automated**: Bun tests over the Workflow Service asserting the Piece is persisted before rendering and retained on each failure category, that retry regenerates no music, and that each typed renderer failure maps to the retryable state. Playwright tests assert the failure page, the Retry control, an unchanged Piece across retry, focus on the score heading after a successful retry, and the safe message with a correlation identifier.

### Acceptance criteria

- [ ] Given generation succeeded and rendering failed, then the new Piece is preserved and the page offers Retry rendering.
- [ ] Given Retry rendering, then the same stored Piece is rendered and its notes are unchanged.
- [ ] Given malformed, oversized, mistyped, timed-out, unsafe, or unstorable service output, then it is treated as a retryable rendering failure and nothing is embedded.
- [ ] Given a rendering failure, then the student sees a safe message with the correlation identifier and no service detail.
- [ ] Given a successful retry, then focus moves to the score heading.
- [ ] Given a retry for a Piece that has become stale, then no LilyPond call is made, nothing is written, no cooldown is consumed, and the student is redirected to the canonical route for the current state with a safe message.
- [ ] Given a direct retry POST for a stale Piece, a superseded `pieceId`, a stale workflow version, or a stale aggregate epoch, then it is refused identically whether or not a Retry control was displayed.
- [ ] Given a retry whose lock owner token no longer matches, then no side effect proceeds, no commit succeeds, and the replacement's lock is not released.
- [ ] Given a check that fails after a successful R2 write, then the render-state commit is rejected, the artifact never becomes current, and cleanup runs with reason `commit_failed`.
- [ ] Given any refusal, then the stored Piece is unchanged and no new music is generated.

### User stories addressed

- User story 45: Rendering failure preserves the Piece and offers an explicit Retry rendering action
- User story 46: Malformed, oversized, mistyped, timed-out, or unsafe service output handled as retryable

---
