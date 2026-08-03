## Issue 20: Generate an immutable Piece, persist it, and redirect to a stable score

**Type**: AFK
**Blocked by**: Issue 19

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

The core tracer bullet for generation: `POST /etude/generate` validates the approved configuration, creates one immutable Piece through the Piece Generator, persists it, and redirects to `GET /etude/score`, which renders the stored Piece. A refresh shows the same music rather than generating different music.

Add the two companion D1 records described in the PRD's "Data and concurrency" section — the current-Piece record for immutable Piece JSON and render metadata, and the operation record for locks, cooldowns, and PDF grants — both user-owned, one-to-one, with cascade deletion. Their physical columns and table names stay encapsulated behind the Etude Repository. Later slices use the operation record; creating it here avoids a second migration.

The Piece contract is immutable, JSON-serializable, and self-contained: key, time signature, hand/staff assignment, source parameter version, and an ordered array of measures whose right- and left-hand arrays hold duration-plus-pitch-or-rest events, with the unused hand's array empty. No random seed is persisted. The generator accepts an injectable random source and validated settings only, and performs no database, HTTP, SVG, or UI work.

The generator in this slice is deliberately minimal — measure count, meter-correct rhythms drawn from eligible catalog patterns, and uniformly chosen pitches from the hand's selected set. Rests, interval weighting, repeats, and two-hand coordination arrive in Issues 22–25. Score rendering is a plain listing until Issue 21.

### How to verify

- **Manual**: approve a configuration, press Generate, and confirm you are redirected to the score; refresh several times and confirm the same music every time.
- **Automated**: Bun tests over the generator asserting the requested measure count, exact measure duration for every measure, only selected pitches, correct hand ranges, an empty array for the unused hand, complete JSON round-tripping, and no mutation of the input settings. Repository tests cover one Piece record per user, replacement semantics, owner-scoped reads, and cascade deletion. A Playwright test generates and then reloads, asserting identical rendered content.

### Acceptance criteria

- [ ] Given an approved configuration, when Generate is submitted, then a new Piece is created that matches the requested measure count, meter, key, and hand selection and is persisted.
- [ ] Given a generated Piece, then every measure's durations sum exactly to the meter's measure length and every pitch is from the selected set.
- [ ] Given a one-hand configuration, then the unused hand's note array is empty in every measure.
- [ ] Given a generated Piece, when the score page is refreshed, then the same stored Piece is displayed and no new music is generated.
- [ ] Given a Piece, then no random seed is persisted and the stored Piece is the only authority for its content.
- [ ] Given a request from another user, then that user's score never returns this Piece.

### User stories addressed

- User story 31: Generate creates a new immutable Piece from approved settings
- User story 42: Refresh shows the same stored Piece rather than different music

---
