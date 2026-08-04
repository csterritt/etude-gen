## Issue 30: End-to-end rendering — generate, render, store, and embed the score

**Type**: AFK
**Blocked by**: Issue 21, Issue 28, Issue 29

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Join the pieces built so far into the complete happy path: `POST /etude/generate` persists the Piece, serializes it, calls the LilyPond service for SVG, validates and sanitizes the response, writes the sanitized SVG to private R2, commits the render state in D1, and redirects to the score, where the page embeds the sanitized SVG alongside the structured text from Issue 21.

The score page retrieves the artifact through the binding only after checking current-user ownership and Piece version. The embedded SVG is noninteractive, has an accessible relationship to the structured text, and must not create duplicate or misleading screen-reader content. The Workflow Service is the only caller that composes repository, generator, renderer, and artifact-store operations.

### Deployability

Like Issue 20, this slice is **non-deployable scaffolding**. The generation capability flag
introduced in Issue 20 stays off for production traffic until Issues 31, 33, 34 and 40 are
complete. This slice must not be the one that turns generation on, because it implements the
multi-resource happy path without recovery, locking, cooldown, or partial-failure coherence.

### Cross-cutting contract

`Notes/issues/etude-cross-cutting-contract.md` applies:

- Section 1 — authentication, no-cache, owner scoping, safe messages.
- Section 3 — `POST /etude/generate` is an operation POST: workflow version as a
  precondition, aggregate epoch verified at acquisition and at every commit, and the current
  non-stale Piece re-verified immediately before the external call and again at final commit.
- Section 5 — the score route is reachable only for a current non-stale Piece with a
  committed render; every other state redirects through the Issue 18 resolver.
- Section 7 — the correlation identifier is threaded through the renderer, artifact store,
  and any cleanup this slice triggers.

### Accessible SVG-to-text relationship

The relationship is fixed here rather than left to interpretation:

- The engraved SVG is inlined with `aria-hidden="true"` and `focusable="false"` and no
  `tabindex`, so it is purely visual and contributes no accessible name, role, or focus stop
  (Issue 28's embed-time rules).
- The structured measure-by-measure text from Issue 21 is the sole accessible
  representation. It is real page content in document order immediately after the score
  region, inside a labelled region with its own heading, not a visually hidden duplicate of
  the SVG and not an `alt`-style summary.
- The score region has an accessible name that identifies it as the engraved score, and the
  structured-text region's heading identifies it as the text equivalent, so the two are
  discoverable as one score presentation without either duplicating the other.
- No `title` or `desc` element inside the SVG contributes text, because Issue 28's policy
  removes accessibility semantics from inside the SVG.

### How to verify

- **Manual**: generate a two-hand etude and confirm the engraved score appears with the right hand on treble and left on bass, the correct key and time signature, and the structured text below it; refresh and confirm the same SVG is served rather than re-rendered.
- **Automated**: Playwright tests asserting the score page embeds an SVG, that the SVG contains no script, event handler, or focusable interactive content, that it is accessibly related to the structured text without duplicating it for screen readers, and that a reload returns the identical artifact. A Bun test over the Workflow Service asserts the ordered composition and that another user's request cannot retrieve the artifact.

### Acceptance criteria

- [ ] Given an approved configuration, when Generate succeeds, then the score page displays the engraved SVG for the stored Piece.
- [ ] Given the embedded SVG, then it contains no script, event handler, external load, or focusable interactive content and is not reachable by keyboard as an interactive element.
- [ ] Given a screen reader, then the SVG is accessibly related to the structured text and does not duplicate it.
- [ ] Given a reload of the score page, then the stored artifact is served without another service call.
- [ ] Given a request from a different user or for a superseded Piece version, then the artifact is not returned.
- [ ] Given the inlined SVG, then it carries `aria-hidden="true"` and `focusable="false"`, has no `tabindex`, and exposes no accessible name from any internal `title` or `desc`.
- [ ] Given the score page, then the structured text is the sole accessible representation, sits in a labelled region with its own heading immediately after the score region, and is not a visually hidden duplicate of the SVG.
- [ ] Given the ordered composition, then the current non-stale Piece identity and the aggregate epoch are re-verified immediately before the LilyPond call and again at the final render-state commit.
- [ ] Given a successful R2 write whose render-state commit then fails, then the artifact never becomes current and cleanup is invoked with reason `commit_failed`.
- [ ] Given the generation capability flag is off, then this slice's routes are not reachable by a student.

### User stories addressed

- User story 36: Right hand on treble with upward stems, left hand on bass with downward stems (end-to-end confirmation)
- User story 37: One-hand scores remain on a grand staff with an empty unused staff (end-to-end confirmation)
- User story 41: The embedded SVG contains no unsafe or inaccessible interactive content

---
