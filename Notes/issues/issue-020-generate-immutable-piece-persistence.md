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

### Deployability

This slice, and Issues 21 and 30 which build on it, are **non-deployable scaffolding**.
Generation is reachable in development and in the test suite, but the etude generation and
score routes must not be enabled for production traffic until Issues 31 (render recovery),
33 (in-flight locks), 34 (success cooldown) and 40 (partial-failure coherence) are
complete. Enforce that with a single server-side capability check — an environment-driven
flag resolved in the same configuration validator as Issue 1 — that makes
`POST /etude/generate` and `GET /etude/score` behave as unknown routes when generation is
not yet released. The flag is removed once Issue 40 lands; it never becomes a runtime
feature-management surface, and it is never client-controllable.

Without this, a merged Issue 20 lets a student publish work with no concurrency
protection, no cooldown, and no defined recovery, which the PRD treats as required
invariants rather than later additions.

### Contract ownership

To stop later slices from re-litigating the boundary, this issue fixes ownership:

| Concern                                                      | Owner                                |
| ------------------------------------------------------------ | ------------------------------------ |
| Stable Piece JSON contract and its invariants                | Issue 20                             |
| The two companion D1 records and their encapsulation         | Issue 20                             |
| Piece identity (`pieceId` UUID) and `sourceParameterVersion` | Issue 20                             |
| Minimal uniform-pitch generation                             | Issue 20, superseded by Issues 22–25 |
| Score page presentation, structured text, focus              | Issue 21                             |
| LilyPond serialization                                       | Issue 26                             |
| Render, storage, and embedding                               | Issue 30                             |
| Render failure and retry                                     | Issue 31                             |
| Staleness and supersession                                   | Issue 32                             |
| Locks, cooldowns, grants stored in the operation record      | Issues 33–37                         |

### Cross-cutting contract

`Notes/issues/etude-cross-cutting-contract.md` applies:

- Section 1 — authentication, no-cache, owner scoping, safe messages.
- Section 3 — `POST /etude/generate` is an operation POST: the submitted workflow version
  is a precondition that is checked and never incremented, the aggregate epoch is verified
  at acquisition and again at every commit, and the derived review predicate from Issue 19
  must hold.
- Section 5 — the redirect target for every outcome comes from the canonical
  state-to-route resolver in Issue 18.

### Failure redirects

| Outcome                                                      | Response                                                                                                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Success                                                      | 303 to `GET /etude/score`                                                                                                                                  |
| Stale, missing, or tampered workflow version                 | 303 to the canonical route for the current state with an explanatory error; no Piece created                                                               |
| Prerequisites not satisfied (derived review predicate false) | 303 to the earliest incomplete step with a safe message; no Piece created                                                                                  |
| Stored values no longer validate                             | 303 to the earliest step whose values are invalid, treated as unconfirmed                                                                                  |
| Typed generator invariant failure                            | 303 back to `GET /etude/review` with the generic safe message and correlation identifier; no Piece created                                                 |
| D1 persistence failure                                       | 303 back to `GET /etude/review` with the generic retry message and correlation identifier; the prior committed aggregate and any prior Piece are unchanged |
| Stale aggregate epoch at commit                              | the commit is rejected, nothing is published, and the response redirects to the canonical route for the current state                                      |

### How to verify

- **Manual**: approve a configuration, press Generate, and confirm you are redirected to the score; refresh several times and confirm the same music every time.
- **Automated**: Bun tests over the generator asserting the requested measure count, exact measure duration for every measure, only selected pitches, correct hand ranges, an empty array for the unused hand, complete JSON round-tripping, and no mutation of the input settings. Repository tests cover one Piece record per user, replacement semantics, owner-scoped reads, and cascade deletion. A repository/schema-level contract test asserts the persisted Piece record exposes no seed, no RNG state, and no field from which the music could be regenerated — expressed against the repository's stable interface and the migration's declared shape rather than against physical column names, so route tests never couple to columns. Playwright tests generate and reload asserting identical rendered content, and cover each row of the failure-redirect table. A further test asserts the routes behave as unknown routes while the generation capability flag is off.

### Acceptance criteria

- [ ] Given an approved configuration, when Generate is submitted, then a new Piece is created that matches the requested measure count, meter, key, and hand selection and is persisted.
- [ ] Given a generated Piece, then every measure's durations sum exactly to the meter's measure length and every pitch is from the selected set.
- [ ] Given a one-hand configuration, then the unused hand's note array is empty in every measure.
- [ ] Given a generated Piece, when the score page is refreshed, then the same stored Piece is displayed and no new music is generated.
- [ ] Given the persisted Piece record's contract, then it contains no seed or random-generator state and the stored Piece is the only authority for its content.
- [ ] Given a request from another user, then that user's score never returns this Piece.
- [ ] Given a generated Piece, then it carries a server-generated `pieceId` UUID and the `sourceParameterVersion` equal to the workflow version it was generated from.
- [ ] Given each row of the failure-redirect table, then the stated response occurs, no Piece is created, and the prior committed aggregate is unchanged.
- [ ] Given the generation capability flag is off, then `POST /etude/generate` and `GET /etude/score` are not reachable by a student.

### User stories addressed

- User story 31: Generate creates a new immutable Piece from approved settings
- User story 42: Refresh shows the same stored Piece rather than different music

---
