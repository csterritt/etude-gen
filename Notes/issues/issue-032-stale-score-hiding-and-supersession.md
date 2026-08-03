## Issue 32: Stale score hidden after parameter changes; replacement supersedes and cleans up

**Type**: AFK
**Blocked by**: Issue 11, Issue 30

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Ensure revised settings are never shown beside stale music. Changing a parameter after generation hides the old score and its PDF controls while the Piece is retained internally until it is replaced. Creating a replacement Piece supersedes the old one immediately: its SVG reference becomes unreachable in D1 and artifact cleanup begins through the Artifact Store's retry policy with `cleanupReason` `replacement`, even if rendering the replacement later fails.

Covers the PRD decisions on stale Pieces and supersession, and connects the invalidation from Issue 11 to the score and PDF surfaces.

### How to verify

- **Manual**: generate a score, change the key, and confirm the score and PDF controls disappear while the workflow returns to the affected steps; regenerate and confirm the new score appears and the previous artifact is no longer reachable.
- **Automated**: Bun tests over the Workflow Service and repository asserting that a parameter change marks the Piece stale without deleting it, that score and PDF operations refuse a stale Piece, that replacement revokes D1 reachability before or regardless of cleanup completion, and that cleanup is invoked with the `replacement` reason even when the replacement's rendering subsequently fails. Playwright tests assert the score is hidden after a change and that the superseded artifact is unreachable after regeneration.

### Acceptance criteria

- [ ] Given a generated score, when any parameter changes, then the score and PDF controls are hidden and the Piece is retained internally.
- [ ] Given a stale Piece, when the score route is requested, then it does not display the stale music.
- [ ] Given a replacement Piece is created, then the previous Piece's SVG reference becomes unreachable immediately and cleanup begins with `cleanupReason` `replacement`.
- [ ] Given a replacement whose rendering later fails, then the superseded artifact is still unreachable and its cleanup still proceeds.
- [ ] Given cleanup that exhausts its retries, then the user operation still completes and the orphan log from Issue 29 is emitted.

### User stories addressed

- User story 43: Changing a parameter hides the old score while retaining it internally until replacement
- User story 44: Creating a replacement Piece revokes and cleans up the superseded SVG immediately

---
