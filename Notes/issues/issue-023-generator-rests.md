## Issue 23: Generator rests with the consecutive-rest rule

**Type**: AFK
**Blocked by**: Issue 22

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Add rests to freshly generated material: the first note position of a hand has a 10% rest chance, every later fresh position also has a 10% rest chance when the rest rule permits it, and in freshly generated material a rest may follow a rest only when the durations differ — a constraint that carries across measure boundaries. After a rest, the next pitch is chosen uniformly across the hand's selected pitches rather than interval-weighted.

Covers the rest rules in the PRD's "Piece model and generation" section. Rest positions before a hand's first pitched event do not establish a current pitch.

### How to verify

- **Manual**: generate several etudes and confirm rests appear occasionally in the structured text and that identical consecutive rests of the same duration do not appear in freshly generated material.
- **Automated**: Bun tests with deterministic sequences asserting the rest decision at exactly the 10% threshold for the first and later positions, that a same-duration rest immediately following a rest is suppressed, that a different-duration rest following a rest is allowed, that the rule holds across a measure boundary, that the pitch after a rest is uniform, and that leading rests do not establish a current pitch.

### Acceptance criteria

- [ ] Given a fresh note position, when the random draw falls below the 10% threshold and the rest rule permits, then a rest is produced; at or above the threshold, a pitched event is produced.
- [ ] Given a preceding rest, when the candidate rest has the same duration, then a rest is not produced at that position.
- [ ] Given a preceding rest with a different duration, then a rest may be produced.
- [ ] Given a rest at the end of one measure, then the rule still applies to the first position of the next measure.
- [ ] Given a rest before any pitched event in a hand, then the following pitched event uses the uniform first-pitch rule.

### User stories addressed

- User story 34: Rests occur occasionally without unrestricted identical consecutive rests

---
