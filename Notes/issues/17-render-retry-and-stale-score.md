## Issue 17: Render retry, stale-score hiding, and replacement cleanup

**Type**: AFK
**Blocked by**: Issue 16

### Parent PRD

`PRD-etude-generator.md`

### What to build

The failure-and-revision behavior of the score lifecycle, end-to-end. When rendering fails (any typed renderer, storage, or commit failure), the newly generated Piece is preserved and the score state offers an explicit Retry rendering action; `POST /etude/render/retry` reuses the saved Piece — never regenerating music — is not blocked by the new-Piece cooldown, still uses the generation/render in-flight lock, and moves focus to the score heading on success. When the student changes any parameter after generation, the old score and its PDF controls are hidden while the Piece is retained internally until replacement; a replacement Piece revokes and cleans up the superseded SVG immediately, even if rendering the replacement later fails. An R2 write failure after valid SVG receipt does not consume the cooldown and retains the Piece for retry.

### How to verify

- **Manual**: with a simulated service outage (fake/misconfigured URL in dev), generate and confirm the retry state; restore service, retry, and confirm the identical music appears with focus on the score heading; generate, then edit a setup parameter, and confirm the score and PDF controls disappear; regenerate and confirm the old SVG is no longer reachable.
- **Automated**: Workflow Service tests for render retry identity (same Piece), retry not consuming the cooldown, stale-score hiding on parameter change, replacement cleanup on supersession, R2-failure retention, and lock use on retry; Playwright tests for the retry flow with focus, stale-score hiding, and post-replacement artifact unreachability.

### Acceptance criteria

- [ ] Given a rendering failure, when the student views the score state, then the new Piece is preserved and an explicit Retry rendering action is offered.
- [ ] Given a retry, when it succeeds, then the displayed music is identical to the failed attempt's Piece, no cooldown was consumed, and focus moves to the score heading.
- [ ] Given a parameter change after generation, when any etude page renders, then the old score and PDF controls are hidden until a replacement is generated.
- [ ] Given a replacement Piece, when it is created, then the superseded SVG is revoked and cleanup begins immediately regardless of the replacement's rendering outcome.
- [ ] Given an R2 write failure after valid SVG receipt, then the cooldown is unconsumed and the Piece remains retryable.

### User stories addressed

- User story 43: parameter changes hide the old score while retaining it internally
- User story 44: replacement revokes and cleans up the superseded SVG immediately
- User story 45: rendering failure preserves the Piece and offers Retry rendering

---
