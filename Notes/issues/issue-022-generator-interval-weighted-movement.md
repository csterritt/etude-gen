## Issue 22: Generator melodic movement with interval weights

**Type**: AFK
**Blocked by**: Issue 20

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Replace the minimal uniform pitch choice with the PRD's interval-weighted transition rule. After a pitched event, every available target pitch no more than 12 semitones away receives the supplied weight for its absolute interval; those weights are normalized over the available targets and sampled. Targets more than 12 semitones away have zero transition weight. The first pitched event of a hand is uniform across that hand's selected pitches.

Use the exact interval weights listed in the PRD's "Piece model and generation" section as relative weights that are normalized after availability filtering. Randomness stays injectable at the generator boundary; production uses a non-seeded source.

### How to verify

- **Manual**: generate several etudes with a wide range and confirm the melodic line moves by small and moderate steps rather than leaping across the whole range.
- **Automated**: Bun tests with deterministic random sequences targeting the boundaries of each normalized interval bucket, asserting the exact chosen target for a given draw, that weights are normalized over available targets only, that a target exactly 12 semitones away is reachable while 13 is never chosen, that unison is possible with its listed weight, and that the first pitched event is uniform rather than interval-weighted.

### Acceptance criteria

- [ ] Given a current pitch and a set of available targets, when the next pitch is chosen, then the sampling distribution matches the listed weights normalized over targets within 12 semitones.
- [ ] Given a target more than 12 semitones from the current pitch, then it is never selected.
- [ ] Given only one available target within 12 semitones, then it is selected with probability 1.
- [ ] Given a hand's first pitched event, then it is chosen uniformly across that hand's selected pitches.
- [ ] Given a fixed injected random sequence, then generation is fully reproducible in tests.

### User stories addressed

- User story 33: Melodic movement selected with the specified interval weights

---
