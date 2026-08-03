## Issue 30: End-to-end rendering — generate, render, store, and embed the score

**Type**: AFK
**Blocked by**: Issue 21, Issue 28, Issue 29

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Join the pieces built so far into the complete happy path: `POST /etude/generate` persists the Piece, serializes it, calls the LilyPond service for SVG, validates and sanitizes the response, writes the sanitized SVG to private R2, commits the render state in D1, and redirects to the score, where the page embeds the sanitized SVG alongside the structured text from Issue 21.

The score page retrieves the artifact through the binding only after checking current-user ownership and Piece version. The embedded SVG is noninteractive, has an accessible relationship to the structured text, and must not create duplicate or misleading screen-reader content. The Workflow Service is the only caller that composes repository, generator, renderer, and artifact-store operations.

### How to verify

- **Manual**: generate a two-hand etude and confirm the engraved score appears with the right hand on treble and left on bass, the correct key and time signature, and the structured text below it; refresh and confirm the same SVG is served rather than re-rendered.
- **Automated**: Playwright tests asserting the score page embeds an SVG, that the SVG contains no script, event handler, or focusable interactive content, that it is accessibly related to the structured text without duplicating it for screen readers, and that a reload returns the identical artifact. A Bun test over the Workflow Service asserts the ordered composition and that another user's request cannot retrieve the artifact.

### Acceptance criteria

- [ ] Given an approved configuration, when Generate succeeds, then the score page displays the engraved SVG for the stored Piece.
- [ ] Given the embedded SVG, then it contains no script, event handler, external load, or focusable interactive content and is not reachable by keyboard as an interactive element.
- [ ] Given a screen reader, then the SVG is accessibly related to the structured text and does not duplicate it.
- [ ] Given a reload of the score page, then the stored artifact is served without another service call.
- [ ] Given a request from a different user or for a superseded Piece version, then the artifact is not returned.

### User stories addressed

- User story 36: Right hand on treble with upward stems, left hand on bass with downward stems (end-to-end confirmation)
- User story 37: One-hand scores remain on a grand staff with an empty unused staff (end-to-end confirmation)
- User story 41: The embedded SVG contains no unsafe or inaccessible interactive content

---
