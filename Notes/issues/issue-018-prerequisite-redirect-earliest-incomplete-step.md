## Issue 18: Direct requests for unavailable steps redirect to the earliest incomplete step

**Type**: AFK
**Blocked by**: Issue 16

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Make every etude step guard its prerequisites: a direct GET for a step whose prerequisites are not met redirects to the earliest incomplete canonical step with a safe message, so stale bookmarks and hand-typed URLs recover into the workflow instead of rendering an incoherent page. Covers the PRD's route-contract decision on unmet prerequisites, and completes the `GET /etude` entry redirect to the canonical route for the saved state.

The Workflow Service computes the earliest incomplete step from the snapshot; routes ask it rather than reimplementing the ordering.

### Cross-cutting contract

This issue **builds** the canonical state-to-route resolution named in section 5 of
`Notes/issues/etude-cross-cutting-contract.md`. Sections 1 and 5 apply, and section 4's
epoch is part of the snapshot the resolution reads. Every later route asks this single
resolver rather than reimplementing it.

### Canonical state-to-route table

This is the complete table the resolver must implement. It is the same table as section 5
of the cross-cutting contract; keep the two in step.

| State                                                                                   | Canonical route                                                                                                               |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| No aggregate                                                                            | create defaults, then `/etude/setup`                                                                                          |
| Setup unconfirmed                                                                       | `/etude/setup`                                                                                                                |
| Setup confirmed; pitches or durations unconfirmed                                       | `/etude/notes`                                                                                                                |
| Notes confirmed; hands = both; split unconfirmed                                        | `/etude/split`                                                                                                                |
| Notes confirmed; hands = left or right                                                  | split is skipped entirely                                                                                                     |
| All applicable steps confirmed; no current Piece                                        | `/etude/review`                                                                                                               |
| Current Piece, not stale, SVG render committed                                          | `/etude/score`                                                                                                                |
| Current Piece, not stale, render failed or artifact reference absent                    | `/etude/score`, in the retry-rendering state owned by Issue 31                                                                |
| Current Piece whose `sourceParameterVersion` is older than the workflow version (stale) | the earliest incomplete step, or `/etude/review` when all steps are confirmed; score and PDF surfaces are hidden per Issue 32 |
| Stored values that no longer validate after an upstream change                          | the earliest step whose stored values are now invalid, treated as unconfirmed                                                 |

Completion is per-step confirmation by a successful POST, not merely the presence of valid
default values, and the notes step counts as confirmed only when pitches and durations are
both confirmed. Review completion is derived from this table and is never stored.

### How to verify

- **Manual**: as a student who has only completed setup, request `/etude/review` directly and confirm you land on the notes step with a safe explanatory message; then complete the workflow and confirm the same URL renders normally.
- **Automated**: Bun tests over the earliest-incomplete-step calculation for every row of the table, including a fresh aggregate whose defaults are valid but unconfirmed, pitches confirmed with durations unconfirmed, the one-hand case where split is not a step, a current rendered Piece, a render-failure Piece, a stale Piece with all steps confirmed, a stale Piece with a step unconfirmed, and stored values that no longer validate. Playwright tests request each step and the score directly at each stage of completion and assert the redirect target and message, and assert `/etude` redirects to the canonical route for each of those states.

### Acceptance criteria

- [ ] Given an incomplete workflow, when a later step is requested directly, then the student is redirected to the earliest incomplete canonical step with a safe message.
- [ ] Given a complete prerequisite chain, when a step is requested directly, then it renders normally.
- [ ] Given a one-hand workflow, then the split step is never chosen as the earliest incomplete step.
- [ ] Given a fresh aggregate whose defaults are valid but unconfirmed, then the canonical route is `/etude/setup` rather than a later step.
- [ ] Given confirmed pitches but unconfirmed durations, then the canonical route is `/etude/notes`.
- [ ] Given a current non-stale Piece with a committed render, then the canonical route is `/etude/score`; given a render failure, then it is `/etude/score` in the retry state.
- [ ] Given a stale Piece, then the canonical route is the earliest incomplete step, or review when every step is confirmed, and never the score.
- [ ] Given `GET /etude`, then it redirects to the canonical route for the saved current state for every row of the table.
- [ ] Given any redirect message here, then it exposes no internal state or identifiers.

### User stories addressed

- User story 25: Direct request for an unavailable later step redirected to the earliest incomplete step

---
