## Issue 25: Generator two-hand rhythm coordination

**Type**: AFK
**Blocked by**: Issue 24

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Implement the two-hand generation rules so hands sometimes coordinate rhythmically without always moving identically. The right hand is generated first. The first left-hand bar has a 25% chance of using the corresponding right-hand rhythm with copied rest positions and a 75% chance of an independently selected rhythm. Each later left-hand bar first takes a 25% mirrored-rhythm outcome; the remaining 75% applies a 20% duplicate roll, giving 15% overall for an exact prior left-hand bar and 60% overall for an independent rhythm.

A mirrored left-hand bar copies rest positions and durations from the right hand but generates its own pitched events from the left-hand range, and exact mirrored rests may override the same-duration consecutive-rest rule at a boundary. The left hand's first pitched event uses the uniform first-pitch rule whether its first rhythm is mirrored or independent.

### How to verify

- **Manual**: generate a both-hands etude and confirm from the structured text that some bars share rhythm across hands while the pitches differ, and that other bars are rhythmically independent.
- **Automated**: Bun tests with deterministic sequences asserting the 25% first-bar mirror decision, the 25%/15%/60% split for later bars, that a mirrored bar copies durations and rest positions exactly but selects different pitched events from the left-hand range, that the left hand's first pitched event is uniform in both mirrored and independent cases, that the mirrored rest exception applies at a boundary, and that the right hand's own generation is unaffected by left-hand outcomes.

### Acceptance criteria

- [ ] Given a two-hand Piece, then the right hand is generated first and its content does not depend on the left hand.
- [ ] Given the first left-hand bar, then the mirrored outcome occurs at the 25% threshold and an independent rhythm otherwise.
- [ ] Given a later left-hand bar, then the outcomes are 25% mirrored, 15% exact prior left-hand bar, and 60% independent, resolved in that order.
- [ ] Given a mirrored bar, then its durations and rest positions match the right-hand bar and its pitched events come from the left-hand range.
- [ ] Given the left hand's first pitched event, then it is chosen uniformly across the left hand's pitches regardless of the rhythm outcome.

### User stories addressed

- User story 35: Two-hand etudes sometimes share rhythmic structure with independently selected pitches

---
