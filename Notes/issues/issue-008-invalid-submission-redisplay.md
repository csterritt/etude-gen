## Issue 8: Invalid submissions redisplayed on the same step with safe values preserved

**Type**: AFK
**Blocked by**: Issue 5

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Make invalid etude form submissions redirect back to the same step and redisplay the student's safe submitted values together with field-level errors, so correction never requires re-entering the whole form. Covers the PRD decision that invalid submissions use one-time server-managed validation state and that persisted domain state changes only after authoritative validation succeeds.

Extend the existing one-time cookie flash pattern used by `redirectWithError` and `useLayout` into a structured, single-use validation state that carries field errors and safe redisplay values. Only values that pass basic shape checks are echoed back; invalid values are never silently coerced or persisted.

### Cross-cutting contract

This issue **builds** the safe-redisplay half of the shared contract in
`Notes/issues/etude-cross-cutting-contract.md`. Sections 1 (universal route
requirements) and 2 (parameter-form contract) apply. Every later parameter-form issue
(6, 7, 13, 14, 16) inherits this behaviour and must test it, per the applicability
matrix in section 6.

### Storage, integrity, and bounds

"Server-managed" is ambiguous if the payload lives in a client cookie, so this issue
must resolve it explicitly. The chosen design is:

- The cookie carries **only an opaque, unguessable, single-use nonce**. The validation
  payload itself is held server-side, keyed by that nonce and scoped to the
  authenticated user, so nothing a student submitted is ever handed back to the browser
  in a readable or forgeable form.
- The nonce cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, path-scoped to the etude
  routes, and expires after 5 minutes. Consumption deletes both the cookie and the
  server-side record; the record is also unusable after expiry.
- A nonce presented by a different user, an unknown nonce, and an expired nonce are all
  treated identically: the step renders with no errors and no redisplayed values.
- The payload is bounded: at most 32 field entries, at most 64 values per multi-value
  field, at most 128 bytes per stored value, at most 256 bytes per error message, and
  at most 16 KB total. Anything exceeding a bound is dropped from redisplay rather than
  truncated into a different value, and the field is redisplayed from the committed
  aggregate instead.
- If the validation state cannot be stored at all, the step still redirects and still
  renders the error summary from Issue 9 with a generic corrective message and the
  saved values. Losing redisplay never turns into a 500 or a silent success.
- Redisplayed values are escaped by the template's contextual output encoding. Stripping
  or sanitizing markup is **not** the defence and must not be described as one; the
  shape checks exist to avoid echoing nonsense, not to make unsafe values safe.

### How to verify

- **Manual**: on the setup step change several fields, make one of them invalid, submit, and confirm you return to the same step with the other changes still shown, an error on the offending field, and no change to stored settings.
- **Automated**: Bun tests over the validation-state store covering single-use consumption, expiry, owner scoping, each size bound, the drop-not-truncate rule, and the storage-failure fallback. Playwright tests submit an invalid field alongside valid changes, assert the error and the preserved values, assert the stored state is unchanged, assert that reloading the step a second time no longer shows the stale error, assert that a forged or foreign nonce yields a clean step, and assert that a submitted value containing HTML and quote characters is rendered escaped rather than interpreted.

### Acceptance criteria

- [ ] Given an invalid submission, when the response is returned, then it is a 303 redirect to the same step showing field-level errors.
- [ ] Given an invalid submission with other valid edits, then those edits are redisplayed in the form.
- [ ] Given an invalid submission, then no domain state is persisted.
- [ ] Given a redisplayed error, when the step is loaded again, then the validation state has been consumed and the error is gone.
- [ ] Given a value that fails validation, then it is never coerced into a valid neighbouring value.
- [ ] Given the client-side cookie, then it contains only an opaque single-use nonce and no submitted value, field name, or error text.
- [ ] Given a nonce that is unknown, expired, already consumed, or owned by another user, then the step renders with no errors and no redisplayed values and reveals nothing about the other case.
- [ ] Given a payload that exceeds any documented bound, then the offending field is redisplayed from the committed aggregate rather than truncated, and the remaining fields still redisplay.
- [ ] Given validation state that cannot be stored, then the redirect and the error summary still occur with a corrective message and the saved values, and the response is not a 500.
- [ ] Given a submitted value containing markup, quotes, or control characters, then it is rendered through contextual output escaping and is never interpreted as markup.

### User stories addressed

- User story 28: Invalid input redisplayed on the same step with safe submitted values preserved

---
