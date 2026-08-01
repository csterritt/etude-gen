## Issue 3: Form validation UX — preserved values, error summary focus, accessible controls

**Type**: AFK
**Blocked by**: Issue 2

### Parent PRD

`PRD-etude-generator.md`

### What to build

The shared invalid-submission experience, built on the setup step as the proving ground and structured so later step pages reuse it. Invalid submissions redirect to the same step with safe submitted values preserved in one-time server-managed validation state; persisted domain state changes only after authoritative validation succeeds. The redisplayed page shows an error summary linked to field-level errors, the summary receives programmatic focus, and errors use semantic status/alert behavior. Every form control has a programmatic label, instructions are associated with their fields, and native HTML constraints match the server rules. Errors identify the affected controls and explain the supported range or combination; invalid values are never silently coerced.

### How to verify

- **Manual**: submit the setup form with multiple invalid values; confirm the same step redisplays with submitted values preserved, a focused error summary whose links jump to each invalid control, and no loss of the valid fields.
- **Automated**: Playwright tests (extending the existing form-validation suite prior art) asserting error summary focus, summary-to-field links, field-level messages, preserved values, accessible labels, and native constraints; Bun tests for the one-time validation-state lifecycle (stored once, consumed on next GET, never persisted as domain state).

### Acceptance criteria

- [ ] Given an invalid submission, when the step redisplays, then safe submitted values are preserved and the student does not re-enter the entire form.
- [ ] Given an invalid submission, when the page loads, then focus is on the error summary and each summary entry links to its invalid control.
- [ ] Given any etude form control, then it has an accessible label and native HTML constraints reflecting the server rules.
- [ ] Given a failure during validation-state handling, then no partial or coerced value reaches the persisted aggregate.

### User stories addressed

- User story 28: invalid input redisplayed with safe submitted values preserved
- User story 29: error summary linked to field errors and focused
- User story 30: accessible labels and native HTML constraints

---
