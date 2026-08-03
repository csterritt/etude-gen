## Issue 31: Rendering failure preserves the Piece and offers Retry rendering

**Type**: AFK
**Blocked by**: Issue 30

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Make rendering failures recoverable without changing the music. When generation succeeds but rendering fails, the newly generated Piece is preserved and the student is shown an explicit Retry rendering action backed by `POST /etude/render/retry`, which reuses the saved Piece, generates no new music, and re-runs serialization, the service call, sanitization, storage, and the render-state commit. Focus moves to the score heading after a successful retry, using the same one-time navigation state as Issue 21.

Every category from Issues 27, 28, and 29 — malformed, oversized, mistyped, timed-out, unsafe, and storage-failed output — is handled as a retryable rendering failure. Bad external output is never embedded, and the student sees a safe message with the correlation identifier rather than service detail.

### How to verify

- **Manual**: force a rendering failure in development, confirm the page reports a retryable failure with a Retry rendering control and no score, then make the service succeed and confirm Retry produces a score whose structured text is unchanged from the failed attempt's Piece.
- **Automated**: Bun tests over the Workflow Service asserting the Piece is persisted before rendering and retained on each failure category, that retry regenerates no music, and that each typed renderer failure maps to the retryable state. Playwright tests assert the failure page, the Retry control, an unchanged Piece across retry, focus on the score heading after a successful retry, and the safe message with a correlation identifier.

### Acceptance criteria

- [ ] Given generation succeeded and rendering failed, then the new Piece is preserved and the page offers Retry rendering.
- [ ] Given Retry rendering, then the same stored Piece is rendered and its notes are unchanged.
- [ ] Given malformed, oversized, mistyped, timed-out, unsafe, or unstorable service output, then it is treated as a retryable rendering failure and nothing is embedded.
- [ ] Given a rendering failure, then the student sees a safe message with the correlation identifier and no service detail.
- [ ] Given a successful retry, then focus moves to the score heading.

### User stories addressed

- User story 45: Rendering failure preserves the Piece and offers an explicit Retry rendering action
- User story 46: Malformed, oversized, mistyped, timed-out, or unsafe service output handled as retryable

---
