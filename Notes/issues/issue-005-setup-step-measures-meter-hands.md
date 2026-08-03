## Issue 5: Setup step for measures, time signature, and hands

**Type**: AFK
**Blocked by**: Issue 4

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Deliver the first editable step end-to-end: `GET /etude/setup` renders a form for measure count, time signature, and hand selection seeded from the saved aggregate, and `POST /etude/setup` validates on the server and persists. Covers the measure range of 4–32, the supported meters 2/4, 3/4, and 4/4, and the left/right/both hand choice from the PRD's "Supported musical domain" and route contract sections.

The POST answers with a 303 redirect to a canonical GET — use the existing `redirectWithMessage` / `redirectWithError` helpers, never `c.redirect`. Authoritative validation lives in the Music Domain module and returns typed, field-addressable failures; the route never trusts submitted values. Native HTML constraints on the controls are added here, with full server-side enforcement behind them.

### How to verify

- **Manual**: change measures to 16, meter to 3/4, and hands to both, submit, and confirm the redirect lands back on the setup step with the new values persisted after a refresh.
- **Automated**: Bun tests over the domain validator for accepted and rejected measure counts at the 4 and 32 boundaries, each supported and unsupported meter, and each hand value including unknown strings. Playwright tests submit valid values and assert persistence after reload, and submit out-of-range and unsupported values (bypassing native constraints) and assert rejection without persistence.

### Acceptance criteria

- [ ] Given the setup step, when a student submits 4 or 32 measures, then the value is accepted and persisted.
- [ ] Given a submission of 3, 33, a decimal, or a non-numeric measure count, then it is rejected and the stored value is unchanged.
- [ ] Given a submission of 2/4, 3/4, or 4/4, then it is accepted; given 6/8 or any other meter, then it is rejected.
- [ ] Given a submission of left, right, or both, then it is accepted; given any other hand value, then it is rejected.
- [ ] Given any handled setup POST, then the response is a 303 redirect to a canonical GET.

### User stories addressed

- User story 5: Choose between 4 and 32 measures
- User story 6: Choose 2/4, 3/4, or 4/4
- User story 12: Choose left hand, right hand, or both hands

---
