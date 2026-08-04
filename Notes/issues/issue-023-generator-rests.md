## Issue 23: Generator rests with the consecutive-rest rule

**Type**: AFK
**Blocked by**: Issue 22

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Add rests to freshly generated material: the first note position of a hand has a 10% rest chance, every later fresh position also has a 10% rest chance when the rest rule permits it, and in freshly generated material a rest may follow a rest only when the durations differ — a constraint that carries across measure boundaries. After a rest, the next pitch is chosen uniformly across the hand's selected pitches rather than interval-weighted.

Covers the rest rules in the PRD's "Piece model and generation" section. Rest positions before a hand's first pitched event do not establish a current pitch.

_Freshly generated material_ means a note position produced by the generator's own rest and pitch draws for that position. A position produced by copying an exactly repeated bar (Issue 24), or by copying a mirrored right-hand rhythm's rest positions (Issue 25), is not fresh. The same-duration consecutive-rest rule is therefore not applied to copied positions and may be overridden by them at a measure boundary.

The cross-boundary interaction is asymmetric. When the preceding bar was a copy — repeat or mirror — and the current bar is fresh, the fresh bar's first position does apply the consecutive-rest rule against the copied bar's trailing rest: the copy's exemption covers only the copied positions, not the fresh positions that follow it.

The rule is evaluated against the immediately preceding rest's duration only. It never considers any earlier rest, so a run of rests is constrained pairwise rather than requiring all durations in the run to differ.

### How to verify

- **Manual**: generate several etudes and confirm rests appear occasionally in the structured text and that identical consecutive rests of the same duration do not appear in freshly generated material.
- **Automated**: Bun tests with deterministic sequences asserting the rest decision at exactly the 10% threshold for the first and later positions, that a same-duration rest immediately following a rest is suppressed, that a different-duration rest following a rest is allowed, that the rule holds across a measure boundary, that a copied repeated or mirrored bar is exempt from the rule, that a fresh bar following a copied bar applies the rule against the copied bar's trailing rest, that only the immediately preceding rest's duration is consulted, that the pitch after a rest is uniform, and that leading rests do not establish a current pitch.

### Acceptance criteria

- [ ] Given a fresh note position, when the random draw falls below the 10% threshold and the rest rule permits, then a rest is produced; at or above the threshold, a pitched event is produced.
- [ ] Given a preceding rest, when the candidate rest has the same duration, then a rest is not produced at that position.
- [ ] Given a preceding rest with a different duration, then a rest may be produced.
- [ ] Given a rest at the end of one measure, then the rule still applies to the first position of the next measure.
- [ ] Given a position produced by copying an exactly repeated or mirrored bar, then it is not freshly generated material and the rule is not applied to it, so it may override the rule at a measure boundary.
- [ ] Given the preceding bar was a copy ending in a rest and the current bar is fresh, then the fresh bar's first position applies the consecutive-rest rule against that copied trailing rest.
- [ ] Given a run of rests, then the rule is evaluated against the immediately preceding rest's duration only and never against any earlier rest.
- [ ] Given a rest before any pitched event in a hand, then the following pitched event uses the uniform first-pitch rule.

### User stories addressed

- User story 34: Rests occur occasionally without unrestricted identical consecutive rests

---
