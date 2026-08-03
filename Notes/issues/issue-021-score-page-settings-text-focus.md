## Issue 21: Score page with settings summary, structured text equivalent, and focus management

**Type**: AFK
**Blocked by**: Issue 20

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Build the Score Presenter and the score page content: the complete settings repeated above the score, and a structured measure-by-measure textual equivalent listing each hand's notes, rests, and durations, derived only from the authoritative Piece and never parsed from a rendered score. After a successful generation, one-time server-managed navigation state moves programmatic focus to the score heading or region.

Covers the PRD's score-page presentation and accessibility decisions. The structured text must not create duplicate or misleading screen-reader content once the SVG is embedded in Issue 30.

### How to verify

- **Manual**: generate an etude and confirm the page repeats every setting, lists every measure with each hand's events, and that focus lands on the score heading immediately after generation; refresh directly and confirm focus is not forced on an ordinary page load.
- **Automated**: Bun tests over the presenter asserting key and time signature output, ordered measures, both hands, an empty unused hand, and every pitch, rest, and duration token rendered with stable text derived only from the Piece. Playwright tests assert the settings summary matches the configuration, the measure text matches the generated Piece, and the score heading is the focused element after generation.

### Acceptance criteria

- [ ] Given a generated Piece, then the score page repeats the complete settings that produced it.
- [ ] Given a generated Piece, then the page lists every measure in order with each hand's pitches, rests, and durations.
- [ ] Given a one-hand Piece, then the unused hand is presented as having no events rather than omitted inconsistently or duplicated.
- [ ] Given a successful generation, when the score page loads, then programmatic focus is on the score heading or region.
- [ ] Given an ordinary reload of the score page, then focus is not forcibly moved and the one-time navigation state has been consumed.

### User stories addressed

- User story 16: Focus moved to the score heading after successful generation or rendering retry
- User story 39: The generated page repeats the complete settings above the score
- User story 40: Structured measure-by-measure text equivalent for assistive technology

---
