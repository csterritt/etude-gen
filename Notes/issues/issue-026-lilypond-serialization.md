## Issue 26: Piece-to-LilyPond serialization

**Type**: AFK
**Blocked by**: Issue 20

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Serialize the authoritative Piece to LilyPond source inside the LilyPond Renderer boundary, per the PRD's "LilyPond and artifact contracts" section: a grand staff with fixed treble/right and bass/left mapping, the selected key and time signature, upward right-hand stems, and downward left-hand stems. For a one-hand Piece the unused staff contains no notes or rests but still displays the selected key and time signature. V1 output carries no title, composer, tempo, dynamics, fingering, articulation, or measure numbers.

Serialization is a pure function of the Piece — no network, database, or UI work — and its failures are typed serialization errors rather than thrown strings.

### How to verify

- **Manual**: generate a Piece, capture the serialized source, and render it once by hand against the LilyPond service or a local install to confirm it engraves cleanly.
- **Automated**: Bun tests asserting a grand staff with treble and bass staves, right-hand notes on treble with upward stems and left-hand notes on bass with downward stems, the correct key and time signature for several keys including flat and sharp keys, every supported duration token and rest serialized correctly, key-signature-conventional pitch spelling, an unused staff containing signatures but no notes or rests, the absence of title/composer/tempo/dynamics/fingering/measure-number markup, and a typed failure for a Piece that violates its invariants.

### Acceptance criteria

- [ ] Given any Piece, when it is serialized, then the output is a grand staff with treble mapped to the right hand and bass to the left.
- [ ] Given a two-hand Piece, then right-hand stems point up and left-hand stems point down.
- [ ] Given a one-hand Piece, then the unused staff shows the key and time signature and contains no notes or rests.
- [ ] Given any supported key and meter, then the serialized source declares them correctly and spells pitches conventionally.
- [ ] Given the serialized source, then it contains no title, composer, tempo, dynamics, fingering, articulation, or measure-number markup.

### User stories addressed

- User story 36: Right hand on treble with upward stems, left hand on bass with downward stems
- User story 37: One-hand scores remain on a grand staff with an empty unused staff
- User story 38: The score shows the selected key and time signature

---
