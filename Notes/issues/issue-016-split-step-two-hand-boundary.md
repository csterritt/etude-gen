## Issue 16: Conditional split step for the two-hand boundary

**Type**: AFK
**Blocked by**: Issue 13, Issue 14

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Deliver `GET /etude/split` and `POST /etude/split` for two-hand workflows only: the student chooses a boundary between adjacent selected pitches, lower pitches are assigned to the left hand and higher pitches to the right, and both sets must be non-empty. For one-hand workflows the step does not appear in the workflow at all and a direct request is redirected away rather than rendered.

The Music Domain owns boundary eligibility, derived from the currently selected pitches. Submitting a boundary that is not between two adjacent selected pitches, or that would leave a hand empty, is rejected.

### Cross-cutting contract

`Notes/issues/etude-cross-cutting-contract.md` applies in full for a parameter form:

- Section 1 — authentication, no-cache, owner scoping, safe messages.
- Section 2 — hidden `workflowVersion` compare-and-set (Issue 10), safe redisplay of the
  chosen boundary with the error (Issue 8), the focused accessible error summary and
  field-error wiring (Issue 9), native constraints, hostile form shapes, and downstream
  invalidation (Issue 11).
- Section 4 — token table row for `POST /etude/split`.
- Section 5 — the split step's prerequisite is the **complete** notes step: pitches
  (Issue 13) and durations (Issue 14) both confirmed. Split is never reachable, and never
  chosen as the earliest incomplete step, while either half is unconfirmed.

### Redirect targets and corrupt-state recovery

Every non-render outcome names an explicit destination:

| Situation                                                                                                          | Destination                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One-hand workflow, direct `GET` or `POST /etude/split`                                                             | The canonical route for the current state (section 5). No split value is stored, and any previously stored boundary is cleared.                                                                                                       |
| Two hands, notes step not fully confirmed                                                                          | `GET /etude/notes` with a safe message                                                                                                                                                                                                |
| Two hands, fewer than two pitches stored (state corrupted by an out-of-band change or an interrupted invalidation) | `GET /etude/notes` with the safe corrective message and the notes step treated as unconfirmed, so the student re-selects pitches. The split step never renders an empty or single-option boundary list, and never invents a boundary. |
| Stored boundary no longer between two adjacent currently selected pitches                                          | The split step renders with no boundary preselected and the stored value discarded, rather than preselecting an ineligible option                                                                                                     |
| Valid submission                                                                                                   | 303 to the canonical next route, which is `GET /etude/review`                                                                                                                                                                         |

### How to verify

- **Manual**: with both hands and several pitches selected, open the split step, choose a boundary, and confirm the resulting left/right assignment is shown and persisted; switch to one hand and confirm the split step is skipped and a direct visit redirects.
- **Automated**: Bun tests asserting the eligible boundary list for a given pitch selection, rejection of a boundary that empties a hand or is not between adjacent selected pitches, the resulting hand assignment, and the recovery result for a two-hand aggregate holding fewer than two pitches. Playwright tests cover the two-hand step appearing in the flow with a working submission, the one-hand flow skipping it and redirecting a direct GET and a direct POST, a direct visit while durations are unconfirmed redirecting to the notes step, the inherited stale-version rejection, and the redisplay of an invalid boundary with a focused error summary.

### Acceptance criteria

- [ ] Given both hands and at least two selected pitches, then the split step offers a boundary between each adjacent pair and no others.
- [ ] Given a chosen boundary, then lower pitches are assigned left, higher pitches right, both sets are non-empty, the assignment is persisted, and the response is a 303 redirect to `GET /etude/review`.
- [ ] Given a submitted boundary that would leave a hand empty or is not between adjacent selected pitches, then it is rejected, nothing is persisted, and the step is redisplayed with a focused error summary.
- [ ] Given a one-hand workflow, then the split step is absent from the workflow, a direct GET and a direct POST both redirect to the canonical route, and no boundary is stored.
- [ ] Given a two-hand workflow whose durations are unconfirmed, then a direct split request redirects to the notes step with a safe message.
- [ ] Given a two-hand workflow with fewer than two stored pitches, then the split step never renders and the student is returned to the notes step with the step treated as unconfirmed.
- [ ] Given a stored boundary that is no longer eligible, then it is discarded and no ineligible option is preselected.
- [ ] Given a submission carrying a stale workflow version, then it is rejected and the currently saved state is shown with an explanatory error.

### User stories addressed

- User story 21: Choose a boundary between adjacent selected pitches for both hands
- User story 22: No irrelevant split step when generating for one hand

---
