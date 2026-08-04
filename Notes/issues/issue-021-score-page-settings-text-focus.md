## Issue 21: Score page with settings summary, structured text equivalent, and focus management

**Type**: AFK
**Blocked by**: Issue 20

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Build the Score Presenter and the score page content: the complete settings repeated above the score, and a structured measure-by-measure textual equivalent listing each hand's notes, rests, and durations, derived only from the authoritative Piece and never parsed from a rendered score. After a successful generation, one-time server-managed navigation state moves programmatic focus to the score heading or region.

Covers the PRD's score-page presentation and accessibility decisions. The structured text must not create duplicate or misleading screen-reader content once the SVG is embedded in Issue 30.

`GET /etude/score` with no current Piece redirects with a safe message to the earliest incomplete canonical step from section 5 of the cross-cutting contract. A stored Piece that fails its contract invariant validation — missing measures, durations not summing to the meter's measure length, a pitch outside the declared key or hand range, a non-empty unused hand, or an unsupported duration token, as defined in Issue 26 — is treated as a presenter failure: the page shows the generic safe error with its correlation identifier from Issue 2. It never renders a partial score, never omits the failing measure silently, and never surfaces a thrown exception or technical detail to the student.

Scope boundaries: the retry/failed-render state is owned by Issue 31, and hiding a stale Piece is owned by Issue 32. Issue 21 owns only the settings summary, the structured text equivalent, and focus management for a current, non-stale, renderable Piece.

### Cross-cutting contract

Inherits `Notes/issues/etude-cross-cutting-contract.md`:

- Section 1: universal route requirements — authenticated and no-cache, owner-scoped, and a correlation identifier carried on the response and in the safe error.
- Section 5: canonical workflow state to route table — no current Piece redirects to the earliest incomplete canonical step with a safe message.

### How to verify

- **Manual**: generate an etude and confirm the page repeats every setting, lists every measure with each hand's events, and that focus lands on the score heading immediately after generation; refresh directly and confirm focus is not forced on an ordinary page load; request `/etude/score` with no current Piece and confirm the redirect and safe message.
- **Automated**: Bun tests over the presenter asserting key and time signature output, ordered measures, both hands, an empty unused hand, and every pitch, rest, and duration token rendered with stable text derived only from the Piece, plus tests that each invariant violation category produces the generic safe error and no partial score rather than a thrown exception. Playwright tests assert the settings summary matches the configuration, the measure text matches the generated Piece, the score heading is the focused element after generation, and that `GET /etude/score` with no current Piece redirects to the earliest incomplete canonical step with a safe message.

### Acceptance criteria

- [ ] Given a generated Piece, then the score page repeats the complete settings that produced it.
- [ ] Given a generated Piece, then the page lists every measure in order with each hand's pitches, rests, and durations.
- [ ] Given a one-hand Piece, then the unused hand is presented as having no events rather than omitted inconsistently or duplicated.
- [ ] Given a successful generation, when the score page loads, then programmatic focus is on the score heading or region.
- [ ] Given an ordinary reload of the score page, then focus is not forcibly moved and the one-time navigation state has been consumed.
- [ ] Given `GET /etude/score` with no current Piece, then it redirects to the earliest incomplete canonical step with a safe message and renders no score content.
- [ ] Given a stored Piece that fails its contract invariant validation, then the page shows the generic safe error with a correlation identifier, renders no partial score, and surfaces no exception or technical detail.
- [ ] Given a current Piece whose render failed or is stale, then this issue renders neither retry state nor stale-hiding behaviour; those belong to Issues 31 and 32 respectively.

### User stories addressed

- User story 16: Focus moved to the score heading after successful generation or rendering retry
- User story 39: The generated page repeats the complete settings above the score
- User story 40: Structured measure-by-measure text equivalent for assistive technology

---
