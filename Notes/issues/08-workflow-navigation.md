## Issue 8: Workflow navigation — summaries, Back links, prerequisite redirects, upstream invalidation, stale versions

**Type**: AFK
**Blocked by**: Issue 7

### Parent PRD

`PRD-etude-generator.md`

### What to build

The cross-cutting step-navigation semantics hardened across all steps, end-to-end. Later steps show prior answers as read-only summaries. Each later step has a Back link (a canonical GET that does not save unsaved edits on the current page) to the canonical prior step. A direct request for an unavailable later step redirects to the earliest incomplete step with a safe message. Changing setup selections clears all dependent note, duration, split, and review-completion state. Every mutable form carries the current workflow version; a stale submission (e.g. from another tab) is rejected by the compare-and-set update and redisplays the newly current state with an explanatory error.

### How to verify

- **Manual**: complete setup and notes, then confirm the notes step shows setup answers as read-only text; use Back and confirm the prior step loads with saved values and unsaved edits discarded; bookmark the review URL, reset the workflow, and request the bookmark to confirm redirect to the earliest incomplete step; change the key on setup and confirm notes/durations/split were cleared; open two tabs, submit setup in both, and confirm the second tab shows the current state with the stale-submission error.
- **Automated**: Playwright tests for summaries, Back links, prerequisite redirects, upstream invalidation, and the stale-tab conflict (two tabs or sequential version manipulation via db helpers); Bun tests for the dependent-state-clearing rules and version conflict typing in the repository/service.

### Acceptance criteria

- [ ] Given completed earlier steps, when a later step renders, then prior answers appear as read-only summaries, not editable controls.
- [ ] Given unsaved edits on a step, when the student follows Back, then the canonical prior step loads with its saved state and the edits are discarded.
- [ ] Given unmet prerequisites, when any later step or the score URL is requested directly, then the response redirects to the earliest incomplete canonical step with a safe message.
- [ ] Given an upstream setup change, when it commits, then dependent note, duration, split, and review state is cleared.
- [ ] Given a form carrying an outdated workflow version, when submitted, then the update is rejected and the student sees the currently saved state with an explanatory error.

### User stories addressed

- User story 23: prior answers as read-only summaries
- User story 24: Back link to the canonical prior step
- User story 25: redirect to earliest incomplete step
- User story 26: upstream changes clear dependent choices
- User story 52: stale submissions rejected with current state shown

---
