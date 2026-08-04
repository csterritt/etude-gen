## Issue 26: Piece-to-LilyPond serialization

**Type**: AFK
**Blocked by**: Issue 20

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Serialize the authoritative Piece to LilyPond source inside the LilyPond Renderer boundary, per the PRD's "LilyPond and artifact contracts" section: a grand staff with fixed treble/right and bass/left mapping, the selected key and time signature, upward right-hand stems, and downward left-hand stems. For a one-hand Piece the unused staff contains no notes or rests but still displays the selected key and time signature. V1 output carries no title, composer, tempo, dynamics, fingering, articulation, or measure numbers.

Serialization is a pure function of the Piece — no network, database, or UI work — and its failures are typed serialization errors rather than thrown strings.

The serializer validates the Piece against its contract invariants before emitting anything: the requested measure count is present, each measure's durations sum exactly to the meter's measure length for both hands, every pitch lies inside the declared key and its hand's range, a one-hand Piece has an empty array for the unused hand, and every duration token is one of the supported set. Any violation is a typed serialization/invariant failure that emits no output at all — not a partial document, not a best-effort document. The serializer never repairs, truncates, or pads a malformed Piece.

Validation responsibility is shared but not duplicated in effect: the Piece Generator asserts the same invariants on construction (Issue 20), so a malformed Piece should never be persisted, and the Score Presenter surfaces a stored-Piece invariant violation as the generic safe error (Issue 21). The serializer's check is the last line of defence for a Piece that was stored before a contract change or corrupted in storage.

No field of the Piece is interpolated into LilyPond source directly. Every emitted key name, meter, duration token, pitch name, accidental, octave mark, and rest marker is mapped through a closed set of known-safe tokens, and an unmapped value is a typed failure. A stored Piece can therefore never inject arbitrary LilyPond syntax, commands, or Scheme into the generated source.

### How to verify

- **Manual**: generate a Piece, capture the serialized source, and render it once by hand against the LilyPond service or a local install to confirm it engraves cleanly.
- **Automated**: Bun tests asserting a grand staff with treble and bass staves, right-hand notes on treble with upward stems and left-hand notes on bass with downward stems, the correct key and time signature for several keys including flat and sharp keys, every supported duration token and rest serialized correctly, key-signature-conventional pitch spelling, an unused staff containing signatures but no notes or rests, the absence of title/composer/tempo/dynamics/fingering/measure-number markup, and a typed failure with no emitted output for each invariant violation category: a wrong measure count, measure durations that do not sum to the meter's measure length, an unsupported duration token, a pitch outside the declared key or hand range, and a one-hand Piece with a non-empty unused hand. Further tests assert that a Piece field carrying LilyPond-like syntax is rejected as an unmapped token rather than appearing in the output.

### Acceptance criteria

- [ ] Given any Piece, when it is serialized, then the output is a grand staff with treble mapped to the right hand and bass to the left.
- [ ] Given a two-hand Piece, then right-hand stems point up and left-hand stems point down.
- [ ] Given a one-hand Piece, then the unused staff shows the key and time signature and contains no notes or rests.
- [ ] Given any supported key and meter, then the serialized source declares them correctly and spells pitches conventionally.
- [ ] Given the serialized source, then it contains no title, composer, tempo, dynamics, fingering, articulation, or measure-number markup.
- [ ] Given a Piece whose measure durations do not sum exactly to the meter's measure length, then serialization produces a typed invariant failure and no output.
- [ ] Given a Piece containing an unsupported duration token, then serialization produces a typed invariant failure and no output.
- [ ] Given a Piece containing a pitch outside its declared key or its hand's range, then serialization produces a typed invariant failure and no output.
- [ ] Given a one-hand Piece whose unused hand array is non-empty, then serialization produces a typed invariant failure and no output.
- [ ] Given any Piece field, then it reaches the output only through a closed set of known-safe tokens, an unmapped value is a typed failure, and no stored value can inject arbitrary LilyPond syntax.
- [ ] Given a malformed Piece, then the serializer never repairs, truncates, or pads it; the Piece Generator asserts the same invariants on construction and the Score Presenter reports a stored-Piece violation as the generic safe error.

### User stories addressed

- User story 36: Right hand on treble with upward stems, left hand on bass with downward stems
- User story 37: One-hand scores remain on a grand staff with an empty unused staff
- User story 38: The score shows the selected key and time signature

---
