## Issue 13: Notes step pitch selection with defaults, Select all, and cardinality rules

**Type**: AFK
**Blocked by**: Issue 7, Issue 11

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Deliver `GET /etude/notes` and the pitch half of `POST /etude/notes`: the step lists every available pitch derived from the saved key and octave range, selects them all by default when the step is first derived, offers a Select all control that works without scripting, and enforces the cardinality rules — at least one pitch for one-hand mode and at least two for two-hand mode, with the exact field-level message "Select at least two pitches when using both hands."

Available pitches come from the Music Domain derivation built in Issues 6 and 7; the step must never offer a pitch outside the derived set, and the server must reject any submitted pitch that is not currently available.

### Cross-cutting contract

`Notes/issues/etude-cross-cutting-contract.md` applies in full for a parameter form:

- Section 1 — authentication, no-cache, owner scoping, safe messages.
- Section 2 — the whole parameter-form contract: the hidden `workflowVersion` with
  compare-and-set (Issue 10), safe invalid-value redisplay through the one-time
  validation state (Issue 8), the focused accessible error summary and field-error wiring
  (Issue 9), native constraints, hostile form shapes, and downstream invalidation
  (Issue 11).
- Section 4 — token table row for `POST /etude/notes`.
- Section 5 — the notes step is one coherent prerequisite: it counts as confirmed only
  when **both** pitches (this issue) and durations (Issue 14) are confirmed.

### First-derivation semantics

"First derived" means the first time the notes step is rendered while no pitch selection
is stored for the current available set. Concretely:

- A newly created aggregate has no stored pitch selection, so all available pitches are
  preselected.
- After Issue 11 clears the pitch selection because the key or octave range changed, the
  next render is again a first derivation and again preselects the full new available set.
  It does not attempt to carry over the previous selection or intersect it with the new
  set.
- Once a selection is stored, later renders show exactly the stored selection, including a
  narrowed one, and never re-expand it.

### Select all versus an ordinary save

Without scripting, Select all is a distinct submit button on the same form. It is
distinguishable server-side by its own submit name and:

- selects every currently available pitch, ignoring which checkboxes were submitted;
- is still subject to the workflow-version compare-and-set;
- persists the full set and marks the pitch half confirmed, exactly as an ordinary save
  would, so it can never produce a cardinality error;
- redirects 303 back to the notes step.

An ordinary save persists exactly the submitted checkbox set and is the only path that can
fail the cardinality rules.

### How to verify

- **Manual**: reach the notes step with a fresh aggregate and confirm every pitch is checked; deselect several, submit, and confirm persistence; with both hands selected, submit one pitch and confirm the exact error message; use Select all with JavaScript disabled and confirm the full set is restored.
- **Automated**: Bun tests over the domain rules for one-hand minimum, two-hand minimum, the exact message string, rejection of unavailable pitches, and the all-selected default derivation, including re-derivation after an Issue 11 clear and non-re-expansion of a stored narrowed selection. Playwright tests cover the default state, Select all without scripting, one-hand and two-hand cardinality failures, persistence of a narrowed selection, the inherited stale-version rejection, the redisplay of a narrowed selection alongside a cardinality error, and the focused error summary linking into the pitch group.

### Acceptance criteria

- [ ] Given a newly derived notes step, then every available pitch is selected.
- [ ] Given both hands selected, when fewer than two pitches are submitted, then the submission is rejected with the field-level message "Select at least two pitches when using both hands."
- [ ] Given one hand selected, when zero pitches are submitted, then the submission is rejected; when one pitch is submitted, then it is accepted.
- [ ] Given a submitted pitch that is not in the derived available set, then the submission is rejected and nothing is persisted.
- [ ] Given Select all activated with scripting unavailable, then the request round-trips through the server, all available pitches become selected and persisted, and no cardinality error can result.
- [ ] Given a pitch selection cleared by an upstream key or octave change, when the notes step is next rendered, then the full new available set is preselected rather than the previous selection being carried over or intersected.
- [ ] Given a stored narrowed selection, when the notes step is rendered again, then exactly that selection is shown and it is not re-expanded.
- [ ] Given a rejected pitch submission, then the student's narrowed selection is redisplayed with the group-level error, the error summary is focused, and nothing is persisted.
- [ ] Given a submission carrying a stale workflow version, then it is rejected and the currently saved selection is shown with an explanatory error.
- [ ] Given duplicate, reordered, empty, or unknown pitch field values, then each resolves to a deterministic accept or field-addressable reject and never a 500.
- [ ] Given a successful pitch save, then the pitch half of the notes step is confirmed but the step itself is complete only once durations are confirmed too.

### User stories addressed

- User story 13: All available key pitches selected by default on the notes step
- User story 14: Select one or more pitches for one hand, at least two for two hands
- User story 15: A Select all control

---
