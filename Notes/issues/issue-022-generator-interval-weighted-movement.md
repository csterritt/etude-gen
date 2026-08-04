## Issue 22: Generator melodic movement with interval weights

**Type**: AFK
**Blocked by**: Issue 20

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Replace the minimal uniform pitch choice with the PRD's interval-weighted transition rule. After a pitched event, every available target pitch no more than 12 semitones away receives the supplied weight for its absolute interval; those weights are normalized over the available targets and sampled. Targets more than 12 semitones away have zero transition weight. The first pitched event of a hand is uniform across that hand's selected pitches.

The PRD's "Piece model and generation" section is the single normative source for the interval weights for absolute intervals 0 through 12. Do not restate them here and do not restate them anywhere in the implementation: the values live in exactly one location, and a test asserts that location's contents match the PRD table entry for entry.

Selection is deterministic given a draw. Build the ordered candidate target list, assign each candidate the weight for its absolute interval, normalize over the available targets after filtering — the PRD's supplied values sum to approximately one _before_ filtering, so post-filter normalization is mandatory — and lay the normalized weights out as cumulative bucket boundaries in candidate order. A draw `r` selects the candidate whose half-open bucket `[lower, upper)` contains `r`. The normalized weights sum to exactly 1 within representable floating-point precision, and the final bucket's upper boundary is 1.

The injected random source returns a number in the half-open interval `[0, 1)`. A returned value of exactly 1, a negative value, `NaN`, or an infinity is a typed generator invariant failure — never an out-of-range index, never a silently clamped selection, and never a fallback to the last candidate. Randomness stays injectable at the generator boundary; production uses a non-seeded source.

### How to verify

- **Manual**: generate several etudes with a wide range and confirm the melodic line moves by small and moderate steps rather than leaping across the whole range.
- **Automated**: Bun tests with an injected draw for each normalized bucket — its lower boundary, a value just below its upper boundary, and 0 — asserting the exact chosen target for each; that the normalized weights sum to exactly 1 within representable precision; that weights are normalized over available targets only; that a target exactly 12 semitones away is reachable while 13 is never chosen; that unison is possible with its listed weight; that a draw of exactly 1, a negative draw, `NaN`, and an infinity each raise the typed invariant failure; that the weight table exists in exactly one location and matches the PRD table entry for entry; and that the first pitched event is uniform rather than interval-weighted.

### Acceptance criteria

- [ ] Given an ordered candidate target list and its normalized cumulative bucket boundaries, when a specified draw is injected, then exactly the expected target is selected; draws at each bucket's lower boundary, just below its upper boundary, and at 0 each select the expected target.
- [ ] Given the available targets after filtering, then their normalized weights sum to exactly 1 within representable precision and the final bucket's upper boundary is 1.
- [ ] Given the injected random source, then it returns a value in `[0, 1)`; a returned value of exactly 1, a negative value, or a non-finite value produces a typed generator invariant failure rather than an out-of-range index or a silent clamp.
- [ ] Given the interval weights for intervals 0 through 12, then the PRD's "Piece model and generation" table is the single normative source, the implementation holds those values in exactly one location, and a test asserts that location against the table.
- [ ] Given a target more than 12 semitones from the current pitch, then it is never selected.
- [ ] Given only one available target within 12 semitones, then it is selected with probability 1.
- [ ] Given a hand's first pitched event, then it is chosen uniformly across that hand's selected pitches.
- [ ] Given a fixed injected random sequence, then generation is fully reproducible in tests.

### User stories addressed

- User story 33: Melodic movement selected with the specified interval weights

---
