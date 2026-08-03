## Issue 7: Octave scale-range selection, contiguous expansion, and the C7 rule

**Type**: AFK
**Blocked by**: Issue 6

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Add keyboard scale-range selection to the setup step for octaves 2 through 6 and derive the available pitch set from it, following the PRD's range rules exactly: the lowest and highest selections establish one continuous expanded range that includes every intervening scale range, each range is derived tonic-to-tonic before the global upper cap is applied, every scientific-pitch octave-7 note is excluded except C7, and C7 is available only when C natural belongs to the selected key and occurs in the expanded range.

The Music Domain owns range expansion and the capped available-pitch derivation. Show the resulting lowest and highest available pitch on the step so the expansion and the cap are observable without generating music.

### How to verify

- **Manual**: select octaves 2 and 5 only and confirm the shown range covers 2 through 5 continuously; in C major select octave 6 and confirm C7 appears as the top pitch; switch to D major and confirm the top pitch is not C7.
- **Automated**: Bun tests covering single-range selection, adjacent selections, non-adjacent selections expanding to a continuous range, tonic-to-tonic derivation for keys whose tonic is not C, the exclusion of every octave-7 pitch other than C7, C7 present only when C natural is in the key and in range, rejection of octaves outside 2–6, and rejection of an empty selection.

### Acceptance criteria

- [ ] Given octaves 2 and 5 selected and 3 and 4 unselected, when available pitches are derived, then the range is continuous from the octave-2 tonic through the octave-5 range.
- [ ] Given a key whose tonic is not C, when a scale range is derived, then it runs tonic-to-tonic before the upper cap is applied.
- [ ] Given an expanded range that would reach into octave 7, then only C7 may remain and every other octave-7 pitch is excluded.
- [ ] Given a key that does not contain C natural, then C7 is never available regardless of range.
- [ ] Given a submitted octave outside 2–6 or an empty octave selection, then the submission is rejected and nothing is persisted.

### User stories addressed

- User story 9: Select one or more keyboard scale ranges identified by octaves 2 through 6
- User story 10: Non-adjacent octave selections interpreted as one continuous range
- User story 11: C7 as the only octave-7 pitch, and only when it belongs to the key and range

---
