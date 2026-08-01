## Issue 16: Score page — SVG embed, grand-staff presentation, focus management, refresh stability

**Type**: AFK
**Blocked by**: Issue 15

### Parent PRD

`PRD-etude-generator.md`

### What to build

The full `GET /etude/score` page, end-to-end. On successful generation, the Workflow Service completes the render pipeline from Issue 12's stored Piece: LilyPond call, response validation, sanitization, private R2 write, and final conditional render-state commit (each stage verifying lock ownership). The page shows the Issue 15 settings summary, the sanitized SVG embedded as noninteractive content with an accessible relationship to the structured measure text (no duplicate or misleading screen-reader content), and the structured text itself. The rendered score presents right-hand notes on a treble staff with upward stems and left-hand notes on a bass staff with downward stems, shows the selected key and time signature, and keeps one-hand etudes on a grand staff with the unused staff showing signatures but no notes or rests. After successful generation, one-time server-managed navigation state moves programmatic focus to the score heading/region. A refresh shows the same stored Piece and SVG — never regenerated music. `GET /etude/score` with no current Piece redirects to the earliest incomplete step with a safe message.

### How to verify

- **Manual**: generate an etude and confirm the score shows settings, grand-staff SVG with correct stems/signatures, and the text equivalent; refresh repeatedly and confirm identical music; check focus lands on the score heading after the redirect; request `/etude/score` in a fresh workflow and confirm the redirect with message.
- **Automated**: Playwright tests for the complete generate-to-score flow, score focus after generation, refresh stability, score text alternative, SVG safety (no scripts/handlers/external loads), one-hand staff layout, and the no-Piece redirect; Workflow Service tests for the render pipeline ordering and per-stage ownership checks.

### Acceptance criteria

- [ ] Given successful generation, when the score page loads, then it shows the complete settings, the sanitized grand-staff SVG with key/time signatures, and the structured text equivalent, with focus on the score heading.
- [ ] Given a generated score, when the page is refreshed, then the identical stored Piece and SVG are shown with no new generation.
- [ ] Given a one-hand etude, when rendered, then the unused staff shows key and time signatures with no notes or rests.
- [ ] Given no current Piece, when `/etude/score` is requested, then the response redirects to the earliest incomplete canonical step with a safe message.
- [ ] Given the embedded SVG, then it is noninteractive and creates no duplicate or misleading screen-reader content relative to the structured text.

### User stories addressed

- User story 16: focus moved to the score heading after successful generation
- User story 36: treble/upward and bass/downward staff-stem mapping
- User story 37: one-hand etudes stay on a grand staff with an empty signed staff
- User story 38: score shows selected key and time signature
- User story 42: refresh shows the same stored Piece and SVG

---
