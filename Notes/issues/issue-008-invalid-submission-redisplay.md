## Issue 8: Invalid submissions redisplayed on the same step with safe values preserved

**Type**: AFK
**Blocked by**: Issue 5

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Make invalid etude form submissions redirect back to the same step and redisplay the student's safe submitted values together with field-level errors, so correction never requires re-entering the whole form. Covers the PRD decision that invalid submissions use one-time server-managed validation state and that persisted domain state changes only after authoritative validation succeeds.

Extend the existing one-time cookie flash pattern used by `redirectWithError` and `useLayout` into a structured, single-use validation state that carries field errors and safe redisplay values. Only values that pass basic shape checks are echoed back; invalid values are never silently coerced or persisted.

### How to verify

- **Manual**: on the setup step change several fields, make one of them invalid, submit, and confirm you return to the same step with the other changes still shown, an error on the offending field, and no change to stored settings.
- **Automated**: Bun tests over the validation-state encoding and single-use consumption. Playwright tests submit an invalid field alongside valid changes, assert the error and the preserved values, assert the stored state is unchanged, and assert that reloading the step a second time no longer shows the stale error.

### Acceptance criteria

- [ ] Given an invalid submission, when the response is returned, then it is a 303 redirect to the same step showing field-level errors.
- [ ] Given an invalid submission with other valid edits, then those edits are redisplayed in the form.
- [ ] Given an invalid submission, then no domain state is persisted.
- [ ] Given a redisplayed error, when the step is loaded again, then the validation state has been consumed and the error is gone.
- [ ] Given a value that fails validation, then it is never coerced into a valid neighbouring value.

### User stories addressed

- User story 28: Invalid input redisplayed on the same step with safe submitted values preserved

---
