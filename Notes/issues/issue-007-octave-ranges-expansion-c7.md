## Issue 7: Octave scale-range selection, contiguous expansion, and the C7 rule

**Type**: AFK
**Blocked by**: Issue 6

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Add keyboard scale-range selection to the setup step for octaves 2 through 6 and derive the available pitch set from it, following the PRD's range rules exactly: the lowest and highest selections establish one continuous expanded range that includes every intervening scale range, each range is derived tonic-to-tonic before the global upper cap is applied, every scientific-pitch octave-7 note is excluded except C7, and C7 is available only when C natural belongs to the selected key and occurs in the expanded range.

The Music Domain owns range expansion and the capped available-pitch derivation. Show the resulting lowest and highest available pitch on the step so the expansion and the cap are observable without generating music.

The C7 rule is tested at its exact boundary, not approximately: C natural in the key with C7 exactly at the top of the expanded range makes C7 available; C natural in the key with C7 one step outside the expanded range leaves C7 absent; C natural absent from the key leaves C7 absent even when the range reaches octave 7; and every other octave-7 pitch is excluded even when it would otherwise fall inside the expanded range.

The octave selection form field is inherently multi-value, so its shapes are part of this slice: submissions with the octaves in an arbitrary order, with duplicate values, with a single value, with an empty selection, and with an octave outside 2–6 each resolve deterministically. An empty selection and an out-of-range octave are rejected with a field-addressable error; duplicates and arbitrary order are normalized to one ascending set. A committed octave-range change clears dependent downstream state through the Issue 11 invalidation in the same committed transition.

### Cross-cutting contract

Inherits `Notes/issues/etude-cross-cutting-contract.md`:

- Section 1: universal route requirements for the setup route.
- Section 2: the parameter-form contract established by Issue 5, including safe redisplay, accessible field errors, and multi-value hostile-shape tolerance.
- Section 4: the workflow version increments on a successful commit and the aggregate epoch is verified.
- Section 6: the applicability matrix row for Issue 7, which marks invalidation as inherited.

### How to verify

- **Manual**: select octaves 2 and 5 only and confirm the shown range covers 2 through 5 continuously; in C major select octave 6 and confirm C7 appears as the top pitch; switch to D major and confirm the top pitch is not C7.
- **Automated**: Bun tests covering single-range selection, adjacent selections, non-adjacent selections expanding to a continuous range, tonic-to-tonic derivation for keys whose tonic is not C, the exclusion of every octave-7 pitch other than C7, and the four exact-boundary C7 cases (C in key with C7 exactly at the top of the range, C in key with C7 just outside it, C not in key with the range reaching octave 7, and every other octave-7 pitch excluded). Further tests submit the octave field in arbitrary order, with duplicates, with one value, empty, and with an out-of-range octave, asserting normalization for order and duplicates and field-addressable rejection for empty and out-of-range. A Playwright test commits an octave-range change and asserts dependent downstream state is cleared.

### Acceptance criteria

- [ ] Given octaves 2 and 5 selected and 3 and 4 unselected, when available pitches are derived, then the range is continuous from the octave-2 tonic through the octave-5 range.
- [ ] Given a key whose tonic is not C, when a scale range is derived, then it runs tonic-to-tonic before the upper cap is applied.
- [ ] Given an expanded range that would reach into octave 7, then only C7 may remain and every other octave-7 pitch is excluded.
- [ ] Given a key that does not contain C natural, then C7 is never available regardless of range.
- [ ] Given a submitted octave outside 2–6 or an empty octave selection, then the submission is rejected with a field-addressable error and nothing is persisted.
- [ ] Given C natural in the selected key and C7 exactly at the top of the expanded range, then C7 is available.
- [ ] Given C natural in the selected key and C7 one step outside the expanded range, then C7 is absent.
- [ ] Given a key without C natural and an expanded range reaching octave 7, then C7 is absent.
- [ ] Given any octave-7 pitch other than C7 that would otherwise fall inside the expanded range, then it is excluded.
- [ ] Given an octave selection submitted in arbitrary order or with duplicate values, then it is normalized to one ascending set and the derived pitches are identical to the canonical submission.
- [ ] Given a committed octave-range change, then dependent downstream state is cleared through the Issue 11 invalidation in the same committed transition.

### User stories addressed

- User story 9: Select one or more keyboard scale ranges identified by octaves 2 through 6
- User story 10: Non-adjacent octave selections interpreted as one continuous range
- User story 11: C7 as the only octave-7 pitch, and only when it belongs to the key and range

---
