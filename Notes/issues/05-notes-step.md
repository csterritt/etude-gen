## Issue 5: Notes step — key-spelled pitches, C7 exception, defaults, cardinality, Select all

**Type**: AFK
**Blocked by**: Issue 4

### Parent PRD

`PRD-etude-generator.md`

### What to build

The notes half of `GET/POST /etude/notes`, end-to-end. The Music Domain derives available pitches: the seven diatonic notes of the selected key with conventional key-signature spelling, across the expanded octave range from Issue 4, excluding every octave-7 note except C7 — which appears only when C natural belongs to the key and falls within the expanded range. On first derivation all available pitches are selected by default. The form enforces at least one selected pitch in one-hand mode and at least two in two-hand mode, rejecting a smaller selection with the exact field-level message "Select at least two pitches when using both hands." A Select all control restores the full pitch set and works through plain server requests without scripting; the PRD-approved minimal client TypeScript may enhance it but is not required. Duration controls are added in Issue 6.

### How to verify

- **Manual**: reach the notes step with defaults and confirm the full key's pitches are pre-selected; pick E-flat major and confirm conventional spelling (no enharmonic duplicates); pick a range topping out at octave 6 in a C-containing key and confirm C7 appears; deselect down to one pitch in both-hands mode and confirm the exact rejection message; use Select all with scripting disabled.
- **Automated**: Bun tests for spelling per key, C7 inclusion/exclusion conditions, default selection, and both cardinality rules with the exact message; Playwright tests for the defaults, Select all with and without enhancement, and one-hand vs two-hand cardinality errors.

### Acceptance criteria

- [ ] Given any supported key, when pitches are derived, then all seven diatonic pitches use conventional key-signature spelling.
- [ ] Given a key containing C natural and an expanded range reaching it, when pitches are derived, then C7 is available and no other octave-7 pitch is.
- [ ] Given a first visit to the notes step, then all available pitches are selected by default.
- [ ] Given both-hands mode with fewer than two selected pitches, when submitted, then the server rejects with "Select at least two pitches when using both hands."
- [ ] Given Select all used without client scripting, when submitted, then the full pitch set is restored server-side.

### User stories addressed

- User story 8: pitches spelled per the key signature
- User story 11: C7 as the only possible octave-7 pitch
- User story 13: all available pitches selected by default
- User story 14: pitch-count minimums per hand mode
- User story 15: Select all control

---
