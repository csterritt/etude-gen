## Issue 25: Generator two-hand rhythm coordination

**Type**: AFK
**Blocked by**: Issue 24

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Implement the two-hand generation rules so hands sometimes coordinate rhythmically without always moving identically. The right hand is generated first. The first left-hand bar has a 25% chance of using the corresponding right-hand rhythm with copied rest positions and a 75% chance of an independently selected rhythm. Each later left-hand bar first takes a 25% mirrored-rhythm outcome; the remaining 75% applies a 20% duplicate roll, giving 15% overall for an exact prior left-hand bar and 60% overall for an independent rhythm.

A mirrored left-hand bar copies rest positions and durations from the right hand but generates its own pitched events from the left-hand range, and exact mirrored rests may override the same-duration consecutive-rest rule at a boundary. The left hand's first pitched event uses the uniform first-pitch rule whether its first rhythm is mirrored or independent.

### The 15% exact prior left-hand bar

The PRD gives the probability but not the selection rule, so this issue fixes it. The
duplicate outcome adopts **the same source-selection and eligibility rules as Issue 24**,
applied to prior **left-hand** bars only:

- Eligible sources are the left hand's own previously completed bars. Right-hand bars are
  never duplicate sources; mirroring is the only cross-hand mechanism.
- Selection uses linear recency weights over those eligible left-hand bars: oldest weight
  1 through newest weight N.
- A candidate whose first pitched event is more than 12 semitones from the left hand's
  current pitch is ineligible; exactly 12 semitones is eligible. An all-rest candidate is
  always eligible. A candidate with leading rests is judged on its first pitched event. A
  left hand with no pitched event yet has every prior bar eligible. These are the same
  rows as Issue 24's eligibility table.
- A duplicated bar copies rhythm, pitches, and rests exactly and may override the
  same-duration consecutive-rest rule at the measure boundary.
- A mirrored bar is a completed left-hand bar and is therefore itself eligible as a later
  duplicate source.

Reusing Issue 24's rule rather than inventing a second one keeps the two repetition
mechanisms testable with one set of boundary fixtures.

### Fallback and random-draw order

Draws are consumed in a fixed order so tests are fully deterministic:

1. Mirror roll. Below the 25% threshold, the bar is mirrored and no further rhythm draw is
   made for it.
2. Otherwise, duplicate roll. Below the 20% threshold — 15% overall — attempt a duplicate.
3. If the duplicate outcome was chosen, the source-selection draw is consumed.
4. Otherwise, or if the duplicate outcome was chosen but **no** prior left-hand bar is
   eligible, an independent rhythm is generated. As in Issue 24, the rolls already made are
   consumed either way, so eligibility never shifts the random sequence.

The first left-hand bar has no prior left-hand bar, so it takes only the 25%/75%
mirror-or-independent decision described above and never a duplicate roll.

### How to verify

- **Manual**: generate a both-hands etude and confirm from the structured text that some bars share rhythm across hands while the pitches differ, and that other bars are rhythmically independent.
- **Automated**: Bun tests with deterministic sequences asserting the 25% first-bar mirror decision, the 25%/15%/60% split for later bars at each threshold boundary, that a mirrored bar copies durations and rest positions exactly but selects different pitched events from the left-hand range, that the left hand's first pitched event is uniform in both mirrored and independent cases, that the mirrored rest exception applies at a boundary, and that the right hand's own generation is unaffected by left-hand outcomes. Further tests cover the duplicate outcome: linear-recency source selection over prior left-hand bars at each cumulative bucket boundary, that a right-hand bar is never chosen as a duplicate source, the over-12/exactly-12 eligibility boundary, an all-rest candidate, a candidate with leading rests, a left hand with no pitched event yet, a previously mirrored bar being chosen as a later duplicate source, the fallback to an independent rhythm when no prior left-hand bar is eligible, that the first left-hand bar never consumes a duplicate roll, and that the fixed draw order leaves the random sequence identical whether or not the duplicate attempt succeeds.

### Acceptance criteria

- [ ] Given a two-hand Piece, then the right hand is generated first and its content does not depend on the left hand.
- [ ] Given the first left-hand bar, then the mirrored outcome occurs at the 25% threshold and an independent rhythm otherwise, and no duplicate roll is consumed.
- [ ] Given a later left-hand bar, then the outcomes are 25% mirrored, 15% exact prior left-hand bar, and 60% independent, resolved in the fixed draw order stated in this issue.
- [ ] Given a duplicate outcome, then the source is chosen among prior left-hand bars by linear recency weights, a specified injected draw selects exactly the expected bar, and no right-hand bar can be selected.
- [ ] Given a duplicate candidate, then eligibility follows the same rules as Issue 24: over 12 semitones from the left hand's current pitch is ineligible, exactly 12 is eligible, an all-rest candidate is always eligible, leading rests are ignored in favour of the first pitched event, and a left hand with no pitched event yet finds every prior bar eligible.
- [ ] Given a duplicate outcome with no eligible prior left-hand bar, then an independent rhythm is generated and the rolls already made are still consumed.
- [ ] Given a mirrored bar, then its durations and rest positions match the right-hand bar, its pitched events come from the left-hand range, and it is itself eligible as a later duplicate source.
- [ ] Given the left hand's first pitched event, then it is chosen uniformly across the left hand's pitches regardless of the rhythm outcome.

### User stories addressed

- User story 35: Two-hand etudes sometimes share rhythmic structure with independently selected pitches

---
