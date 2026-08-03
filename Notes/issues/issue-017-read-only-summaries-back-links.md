## Issue 17: Read-only prior-answer summaries and Back links on later steps

**Type**: AFK
**Blocked by**: Issue 16

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Show earlier answers on each later step as read-only summaries rather than editable controls, and give each later step a Back link that returns to the canonical prior step. Covers the PRD decisions that a student cannot accidentally edit multiple steps at once and that Back controls are canonical GET links that do not save unsaved values from the current page.

Build the summary as a shared component driven by the workflow snapshot so every later step presents the same information consistently.

### How to verify

- **Manual**: on the notes step confirm the setup answers appear as text with no editable controls; change something on the notes step without submitting, click Back, and confirm the unsaved change was not saved; confirm Back returns to the setup step rather than browser history.
- **Automated**: Playwright tests asserting that later steps contain no form controls for prior answers, that the summary values match the saved state, that Back is a link performing a GET to the canonical prior step, and that unsaved edits on the current page are discarded rather than persisted after using Back.

### Acceptance criteria

- [ ] Given any later step, then prior answers are rendered as read-only text and not as editable controls.
- [ ] Given a change to a prior step, when a later step is loaded, then its summary reflects the new saved values.
- [ ] Given unsaved edits on a later step, when Back is followed, then those edits are not persisted.
- [ ] Given Back on any later step, then it is a link issuing a GET to the canonical prior step.

### User stories addressed

- User story 23: Prior answers shown as read-only summaries on later steps
- User story 24: A Back link on each later step that does not save unsaved edits

---
