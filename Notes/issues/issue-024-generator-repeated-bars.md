## Issue 24: Generator repeated bars with recency weighting and pitch continuity

**Type**: AFK
**Blocked by**: Issue 23

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Add exact one-measure repetitions so etudes contain recognizable phrases. For a single-hand Piece, and for the right hand of a two-hand Piece, each bar after the first has a 20% repeated-bar event. The source is chosen among prior bars with linear recency weights from oldest weight 1 through newest weight N. A source whose opening pitched event would require a transition over 12 semitones is ineligible, and if no prior source is eligible a fresh bar is generated. An accepted repeat copies rhythm, pitches, and rests exactly, and exact repeated rest structure may override the same-duration consecutive-rest rule at a measure boundary.

Also implement current-pitch continuity: after every completed bar, including a repeated one, the hand's current pitch becomes the last pitched event in that bar; trailing rests do not clear it, and a hand with no pitched event yet uses the uniform first-pitch rule.

### Scope: right hand and single hand only

This issue implements repetition for a single-hand Piece and for the **right hand** of a
two-hand Piece. The left hand's independent repetition is a different rule with a different
probability and is owned entirely by Issue 25; nothing here applies to it. A left-hand bar
never consults this 20% roll.

### Eligibility when there is no pitched event

The over-12-semitone exclusion is defined in terms of pitches that may not exist. Resolve
every case explicitly:

| Case                                                                               | Eligibility                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Candidate source bar contains at least one pitched event; hand has a current pitch | Eligible only when the interval from the current pitch to the source's **first** pitched event is 12 semitones or fewer                                                                                                                      |
| Candidate source bar contains **no** pitched event (all rests)                     | Always eligible. There is no transition to constrain, and copying it cannot create an unplayable leap. The hand's current pitch is unchanged by the copy, exactly as trailing rests leave it unchanged                                       |
| Candidate source bar begins with rests before its first pitched event              | Eligible on the same rule as the first row: the constraint is measured against its first _pitched_ event, not its first position. The leading rests are irrelevant                                                                           |
| Hand has produced no pitched event yet (so there is no current pitch)              | Every prior bar is eligible; there is no transition to measure. If the copied bar contains a pitched event, that event's pitch was already drawn by the uniform first-pitch rule when the source bar was generated, and the copy inherits it |
| No prior bars exist (first bar)                                                    | No repeat roll happens at all                                                                                                                                                                                                                |
| Prior bars exist but none is eligible                                              | A fresh bar is generated; the 20% roll is consumed either way, so the random sequence stays deterministic                                                                                                                                    |

An all-rest source bar copied as a repeat may override the same-duration consecutive-rest
rule at the measure boundary, like any other exact repeat.

### How to verify

- **Manual**: generate a 16-measure etude a few times and confirm exactly repeated measures appear in the structured text.
- **Automated**: Bun tests with deterministic sequences asserting the 20% repeat decision at its threshold, the linear recency weighting selection for a given draw at each cumulative bucket boundary, that the first bar is never a repeat, that an ineligible source is skipped and a fresh bar is generated when none qualifies, that an accepted repeat copies rhythm, pitches, and rests exactly, that the exact-repeat rest exception applies at a boundary, and that the current pitch after a bar with trailing rests is the last pitched event of that bar. Further tests cover every row of the eligibility table: an all-rest source bar, a source bar with leading rests before its first pitched event, a hand with no pitched event yet, a source exactly 12 semitones away, a source exactly 13 semitones away, and the case where all prior bars are ineligible. A test asserts the 20% roll is consumed even when the outcome falls back to a fresh bar, so the random sequence is unaffected by eligibility.

### Acceptance criteria

- [ ] Given any bar after the first, when the draw falls below the 20% threshold and an eligible source exists, then that bar is an exact copy of the chosen prior bar.
- [ ] Given multiple prior bars, then source selection follows linear recency weights from 1 for the oldest to N for the newest, and a specified injected draw selects exactly the expected bar at each cumulative bucket boundary.
- [ ] Given a candidate source whose first pitched event is more than 12 semitones from the current pitch, then it is ineligible; at exactly 12 semitones it is eligible.
- [ ] Given a candidate source containing no pitched event, then it is eligible regardless of the current pitch, and copying it leaves the current pitch unchanged.
- [ ] Given a candidate source that begins with rests, then eligibility is measured against its first pitched event rather than its first position.
- [ ] Given a hand that has produced no pitched event yet, then every prior bar is eligible.
- [ ] Given no eligible source, then a fresh bar is generated instead and the repeat roll has still been consumed.
- [ ] Given a completed bar ending in rests, then the hand's current pitch remains that bar's last pitched event.
- [ ] Given a left-hand bar of a two-hand Piece, then this issue's 20% roll is not applied to it at all.

### User stories addressed

- User story 32: Occasional exact one-measure repetitions

---
