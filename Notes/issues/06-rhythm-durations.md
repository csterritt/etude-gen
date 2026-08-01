## Issue 6: Rhythm durations — catalog, eligibility, defaults, impossible-set prevention

**Type**: AFK
**Blocked by**: Issue 5

### Parent PRD

`PRD-etude-generator.md`

### What to build

The duration half of `GET/POST /etude/notes`, end-to-end. Parse the curated text catalog at `Notes/all-rhythms.txt` (time-signature headings followed by one token sequence per line) as the authoritative build-time input; validate it for syntax, supported tokens (W, H, D, Q, R, E), and exact measure lengths, failing startup health validation on a malformed catalog. The Music Domain computes eligible rhythms: a rhythm is eligible only when every token it contains is selected, and a submitted duration set is valid only if at least one eligible complete-measure pattern exists for the selected meter. Only durations that can fit the selected meter are offered; individually compatible durations are selected by default on first derivation. The form prevents a selection that cannot form any complete measure — via the PRD-approved minimal client enhancement that disables such toggles, and authoritatively via server rejection with corrective guidance when scripting is absent.

### How to verify

- **Manual**: with 2/4 selected, confirm whole and dotted-half notes are not offered; deselect durations toward an impossible set and confirm toggles are disabled before the set becomes impossible; disable scripting, force-submit an impossible set, and confirm the server rejects with corrective guidance on the same step.
- **Automated**: Bun tests for catalog parsing (every pattern's exact meter length, malformed catalogs, unsupported tokens), eligibility calculation, and compatible defaults per meter; Playwright tests for duration prevention with and without scripting and the server fallback message.

### Acceptance criteria

- [ ] Given the catalog, when the application starts, then a malformed catalog fails health validation and valid catalogs expose patterns grouped by meter.
- [ ] Given a selected meter, when the notes step renders, then only durations that can fit that meter are offered and compatible ones are pre-selected on first derivation.
- [ ] Given a duration toggle that would leave no eligible complete-measure pattern, when scripting is active, then the toggle is disabled; when scripting is absent and such a set is submitted, then the server rejects it with corrective guidance and no state change.

### User stories addressed

- User story 17: compatible durations selected by default
- User story 18: choose among the six duration types when they fit the meter
- User story 19: duration controls prevent impossible sets
- User story 20: server rejects impossible rhythm sets with corrective guidance

---
