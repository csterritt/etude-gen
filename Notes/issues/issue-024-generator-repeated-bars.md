## Issue 24: Generator repeated bars with recency weighting and pitch continuity

**Type**: AFK
**Blocked by**: Issue 23

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Add exact one-measure repetitions so etudes contain recognizable phrases. For a single-hand Piece, and for the right hand of a two-hand Piece, each bar after the first has a 20% repeated-bar event. The source is chosen among prior bars with linear recency weights from oldest weight 1 through newest weight N. A source whose opening pitched event would require a transition over 12 semitones is ineligible, and if no prior source is eligible a fresh bar is generated. An accepted repeat copies rhythm, pitches, and rests exactly, and exact repeated rest structure may override the same-duration consecutive-rest rule at a measure boundary.

Also implement current-pitch continuity: after every completed bar, including a repeated one, the hand's current pitch becomes the last pitched event in that bar; trailing rests do not clear it, and a hand with no pitched event yet uses the uniform first-pitch rule.

### How to verify

- **Manual**: generate a 16-measure etude a few times and confirm exactly repeated measures appear in the structured text.
- **Automated**: Bun tests with deterministic sequences asserting the 20% repeat decision at its threshold, the linear recency weighting selection for a given draw, that the first bar is never a repeat, that an ineligible source is skipped and a fresh bar is generated when none qualifies, that an accepted repeat copies rhythm, pitches, and rests exactly, that the exact-repeat rest exception applies at a boundary, and that the current pitch after a bar with trailing rests is the last pitched event of that bar.

### Acceptance criteria

- [ ] Given any bar after the first, when the draw falls below the 20% threshold and an eligible source exists, then that bar is an exact copy of the chosen prior bar.
- [ ] Given multiple prior bars, then source selection follows linear recency weights from 1 for the oldest to N for the newest.
- [ ] Given a candidate source whose opening pitched event is more than 12 semitones from the current pitch, then it is ineligible.
- [ ] Given no eligible source, then a fresh bar is generated instead.
- [ ] Given a completed bar ending in rests, then the hand's current pitch remains that bar's last pitched event.

### User stories addressed

- User story 32: Occasional exact one-measure repetitions

---
