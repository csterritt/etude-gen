## Issue 15: Score presenter — settings echo and structured measure text

**Type**: AFK
**Blocked by**: Issue 12 and Issue 14

### Parent PRD

`PRD-etude-generator.md`

### What to build

The Score Presenter module's pure, Bun-testable behavior, wired minimally into the render-pending score state so it is verifiable before the full page lands. From an owner-authorized current Piece, produce: the complete selected-settings summary that heads the score page, and a structured measure-by-measure textual equivalent listing each hand's notes, rests, and durations — derived only from the authoritative Piece, never parsed from SVG. Key and time signature appear in the text; ordered measures cover both hands with empty unused hands represented. Missing or stale artifacts produce a retry state rather than score content.

### How to verify

- **Manual**: with a generated Piece, view the score route's render-pending/diagnostic state and confirm the settings summary and per-measure text match the Piece JSON.
- **Automated**: Bun tests covering key and time signatures, ordered measures, both hands, empty unused hands, every pitch/rest and duration token, and stable accessible text derived only from the Piece; a Workflow Service test that a Piece whose artifact is missing or superseded yields the retry state.

### Acceptance criteria

- [ ] Given any current Piece, when presented, then the settings summary repeats the complete approved configuration.
- [ ] Given any current Piece, when the structured text is produced, then every measure lists each hand's pitches/rests and durations in order, matching the Piece exactly.
- [ ] Given a Piece with a missing or stale artifact, when presented, then the result is a retry state, not partial score content.

### User stories addressed

- User story 39: generated page repeats the complete settings above the score
- User story 40: structured measure-by-measure text equivalent

---
