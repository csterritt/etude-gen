## Issue 5: Setup step for measures, time signature, and hands

**Type**: AFK
**Blocked by**: Issue 4

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Deliver the first editable step end-to-end: `GET /etude/setup` renders a form for measure count, time signature, and hand selection seeded from the saved aggregate, and `POST /etude/setup` validates on the server and persists. Covers the measure range of 4–32, the supported meters 2/4, 3/4, and 4/4, and the left/right/both hand choice from the PRD's "Supported musical domain" and route contract sections.

The POST answers with a 303 redirect to a canonical GET — use the existing `redirectWithMessage` / `redirectWithError` helpers, never `c.redirect`. Authoritative validation lives in the Music Domain module and returns typed, field-addressable failures; the route never trusts submitted values. Native HTML constraints on the controls are added here, with full server-side enforcement behind them. A successful setup POST marks the setup step confirmed and increments the workflow version.

Hostile form shapes are in scope, not an edge case for later. An empty value, an absent field, a repeated field submitted with multiple values, an unexpected extra field, and fields arriving in an arbitrary order each resolve to a deterministic accept or a field-addressable reject. None of them produces a 500, and none of them is silently coerced into a plausible value: an empty measure count is not read as the default, a repeated meter is not resolved by taking the first or last value unless that rule is stated and tested, and an unexpected extra field is ignored without affecting the outcome for the expected fields.

### Cross-cutting contract

Inherits `Notes/issues/etude-cross-cutting-contract.md`, and establishes the parameter-form pattern that Issues 6, 7, 13, 14 and 16 inherit:

- Section 1: universal route requirements for `GET` and `POST /etude/setup`.
- Section 2: the parameter-form contract — this slice builds the PRG 303 shape, native constraints with independent server enforcement, and the hostile-shape tolerance of rule 5.
- Section 4: the workflow version increments on a successful commit and the aggregate epoch is verified.
- Section 6: the applicability matrix row for Issue 5.

### How to verify

- **Manual**: change measures to 16, meter to 3/4, and hands to both, submit, and confirm the redirect lands back on the setup step with the new values persisted after a refresh.
- **Automated**: Bun tests over the domain validator for accepted and rejected measure counts at the 4 and 32 boundaries, each supported and unsupported meter, and each hand value including unknown strings. Further tests submit each hostile shape — empty value, absent field, repeated field with two values, extra unexpected field, and reordered fields — and assert a deterministic accept or field-addressable reject with no thrown error and no coercion. Playwright tests submit valid values and assert persistence after reload, assert the workflow version increases and the setup step becomes confirmed, and submit out-of-range, unsupported, and hostile-shape bodies (bypassing native constraints) and assert rejection with a field error, no persistence, and no 500.

### Acceptance criteria

- [ ] Given the setup step, when a student submits 4 or 32 measures, then the value is accepted and persisted.
- [ ] Given a submission of 3, 33, a decimal, or a non-numeric measure count, then it is rejected and the stored value is unchanged.
- [ ] Given a submission of 2/4, 3/4, or 4/4, then it is accepted; given 6/8 or any other meter, then it is rejected.
- [ ] Given a submission of left, right, or both, then it is accepted; given any other hand value, then it is rejected.
- [ ] Given any handled setup POST, then the response is a 303 redirect to a canonical GET.
- [ ] Given a successful setup POST, then the setup step is marked confirmed and the workflow version is incremented.
- [ ] Given a submission with an empty value or an absent field for measures, meter, or hands, then it is rejected with a field-addressable error and is not coerced into a default or stored value.
- [ ] Given a submission repeating a field with multiple values, then the outcome is deterministic — either a stated normalization or a field-addressable reject — and never a 500.
- [ ] Given a submission carrying an unexpected extra field or the expected fields in an arbitrary order, then the expected fields are validated identically and the response is never a 500.

### User stories addressed

- User story 5: Choose between 4 and 32 measures
- User story 6: Choose 2/4, 3/4, or 4/4
- User story 12: Choose left hand, right hand, or both hands

---
