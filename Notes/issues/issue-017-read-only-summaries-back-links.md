## Issue 17: Read-only prior-answer summaries and Back links on later steps

**Type**: AFK
**Blocked by**: Issue 16

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Show earlier answers on each later step as read-only summaries rather than editable controls, and give each later step a Back link that returns to the canonical prior step. Covers the PRD decisions that a student cannot accidentally edit multiple steps at once and that Back controls are canonical GET links that do not save unsaved values from the current page.

Build the summary as a shared component driven by the workflow snapshot so every later step presents the same information consistently.

Each later step's summary contains exactly this:

- Notes step: measure count, meter, key, selected octave ranges, and hands.
- Split step: everything the notes step shows, plus the selected pitches and the selected durations.
- Review step: everything above, plus the split boundary and each hand's resulting pitch set where a boundary applies.

The score page's settings summary is owned by Issue 21 and is not built here.

The notes step counts as one coherent prerequisite — pitches _and_ durations, per section 5 of the cross-cutting contract — so the split step's summary always shows both halves, never durations alone or pitches alone.

A summary renders only the committed, still-valid aggregate. A value that is currently invalid, or that was invalidated by an upstream change under Issue 11, is not rendered as if it were a live selection.

### Cross-cutting contract

Inherits `Notes/issues/etude-cross-cutting-contract.md`:

- Section 1: universal route requirements — the summary reveals no internal identifiers and asserts no ownership from request input; every value comes from the owner-scoped aggregate.
- Section 5: canonical workflow state to route table — Back links target the canonical prior step, and the notes step is treated as a single pitches-and-durations prerequisite.

### How to verify

- **Manual**: on the notes step confirm the setup answers appear as text with no editable controls; change something on the notes step without submitting, click Back, and confirm the unsaved change was not saved; confirm Back returns to the setup step rather than browser history.
- **Automated**: Playwright tests asserting that later steps contain no form controls for prior answers, that each step's summary contains exactly its required fields, that the split step's summary shows both pitches and durations, that the review summary includes the split boundary and each hand's pitch set, that the summary values match the saved state, that a value invalidated by an upstream change is not rendered, that Back is a link performing a GET to the canonical prior step, and that unsaved edits on the current page are discarded rather than persisted after using Back.

### Acceptance criteria

- [ ] Given any later step, then prior answers are rendered as read-only text and not as editable controls.
- [ ] Given the notes step, then its summary shows measure count, meter, key, selected octave ranges, and hands.
- [ ] Given the split step, then its summary additionally shows the selected pitches and the selected durations, because the notes step is one coherent prerequisite.
- [ ] Given the review step, then its summary shows every earlier answer plus the split boundary and each hand's pitch set where a boundary applies.
- [ ] Given a value that is currently invalid or has been invalidated by an upstream change, then no summary renders it; a summary reflects only the committed, still-valid aggregate.
- [ ] Given a change to a prior step, when a later step is loaded, then its summary reflects the new saved values.
- [ ] Given unsaved edits on a later step, when Back is followed, then those edits are not persisted.
- [ ] Given Back on any later step, then it is a link issuing a GET to the canonical prior step.

### User stories addressed

- User story 23: Prior answers shown as read-only summaries on later steps
- User story 24: A Back link on each later step that does not save unsaved edits

---
