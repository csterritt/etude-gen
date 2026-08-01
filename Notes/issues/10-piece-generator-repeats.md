## Issue 10: Piece generator — 20% repeated bars with recency weighting

**Type**: AFK
**Blocked by**: Issue 9

### Parent PRD

`PRD-etude-generator.md`

### What to build

Extend the Piece Generator with exact one-measure repetitions so the etude contains recognizable phrases. For a single-hand Piece (and, later, the right hand of a two-hand Piece), each bar after the first has a 20% repeated-bar event. The source is selected among prior bars with linear recency weights (oldest weight 1 through newest weight N). A source whose opening pitched event would require a transition over 12 semitones from the hand's current pitch is ineligible; if no source is eligible, a fresh bar is generated. An accepted repeat copies rhythm, pitches, and rests exactly, and its exact rest structure may override the same-duration consecutive-rest rule at the measure boundary. After a repeated bar, the hand's current pitch becomes the bar's last pitched event.

### How to verify

- **Manual**: via the diagnostic route, generate longer etudes (e.g. 32 measures) and spot visible exact repeated measures in the JSON.
- **Automated**: Bun tests with deterministic random sequences covering the 20% repeat decision, linear recency weighting across multiple sources, over-12 source ineligibility, ineligible-repeat fallback to fresh generation, exact-repeat exceptions to the consecutive-rest rule, and current-pitch continuity after repeated bars; distribution tests asserting deterministic decision thresholds, not aggregate randomness.

### Acceptance criteria

- [ ] Given a scripted 20% repeat roll that passes, when sources exist, then the source is sampled with linear recency weights and copied exactly.
- [ ] Given a candidate source requiring an over-12-semitone opening transition, when repeat eligibility is computed, then that source is excluded.
- [ ] Given no eligible source, when a repeat roll passes, then a fresh bar is generated instead.
- [ ] Given an accepted repeat whose boundary rests share a duration, then the exact rest structure is preserved despite the consecutive-rest rule.

### User stories addressed

- User story 32: occasional exact one-measure repetitions

---
