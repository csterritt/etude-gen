## Issue 11: Piece generator — two-hand 25%/15%/60% outcomes

**Type**: AFK
**Blocked by**: Issue 10

### Parent PRD

`PRD-etude-generator.md`

### What to build

Extend the Piece Generator to two-hand Pieces so the hands sometimes share rhythmic structure while keeping independently selected pitches. The right hand is generated first using the single-hand rules (including Issue 10 repeats). For the first left-hand bar: 25% mirrors the corresponding right-hand rhythm (copied durations and rest positions, fresh left-hand pitches), 75% uses an independently selected rhythm. For each later left-hand bar: first a 25% mirrored-rhythm roll; in the remaining 75%, a 20% duplicate roll yields 15% overall exact prior left-hand bar and 60% overall independent rhythm. The left hand's first pitched event is uniform across its pitches whether the first rhythm is mirrored or independent; rests before it establish no current pitch. Mirrored rests may override the same-duration consecutive-rest rule at a boundary. Left-hand pitches stay within the left split range and right-hand pitches within the right.

### How to verify

- **Manual**: via the diagnostic route, generate two-hand Pieces and confirm mirrored bars share rhythm/rest positions but differ in pitches, and each hand stays on its side of the split.
- **Automated**: Bun tests with deterministic random sequences covering the 25%/15%/60% branch outcomes, the left hand's first pitched event in mirrored and independent rhythms, rest-position copying with fresh pitches, exact-rest overrides at boundaries, and hand-range conformance; distribution tests at deterministic thresholds.

### Acceptance criteria

- [ ] Given scripted rolls hitting each branch, when a two-hand Piece is generated, then the 25% mirror, 15% duplicate, and 60% independent outcomes each produce the PRD-specified bar content.
- [ ] Given a mirrored bar, when pitches are generated, then durations and rest positions match the right-hand bar but pitched events come from the left-hand range.
- [ ] Given rests before the left hand's first pitched event, when that event is generated, then it is uniform across left-hand pitches regardless of rhythm source.
- [ ] Given any two-hand Piece, then every right-hand event is above the split boundary and every left-hand event below it.

### User stories addressed

- User story 35: two-hand etudes sometimes share rhythmic structure with independent pitches

---
