## Issue 9: Piece generator core — immutable Piece model, fresh-bar rhythm, rests, interval-weighted pitches

**Type**: AFK
**Blocked by**: Issue 6

### Parent PRD

`PRD-etude-generator.md`

### What to build

The Piece Generator module's fresh-generation core, verifiable end-to-end through deterministic Bun tests and a temporary diagnostic output (e.g. JSON dump on a test-only route) until the score page exists. Define the immutable, JSON-serializable, self-contained Piece contract: key, time signature, hand/staff assignment, source parameter version, and ordered measures with right- and left-hand note arrays (empty for unused hands), each event carrying a duration and either a pitch or rest marker. Implement fresh-bar generation per "Piece model and generation": rhythms drawn from eligible catalog patterns; first-position 10% rest chance with otherwise uniform first pitch; later positions 10% rest when the rest rule permits; interval-weighted transitions (weights per the PRD table, normalized over available targets within 12 semitones, zero beyond); uniform pitch after a rest; same-duration consecutive rests forbidden across measure boundaries; current-pitch continuity after completed bars including trailing rests. Randomness is injectable at the module boundary; production uses a non-seeded source.

### How to verify

- **Manual**: invoke generation for a few configurations via the diagnostic route and confirm the JSON is complete, immutable, and musically sane (durations sum to the meter, pitches within the selected set).
- **Automated**: Bun tests with deterministic random sequences at branch boundaries covering every duration token, interval weights and normalization, over-12 exclusion, initial and later rests, consecutive-rest rules, current-pitch continuity after bars with trailing rests, and first/subsequent bars; property/invariant tests for requested measure count, exact measure duration, selected pitches only, complete JSON serialization, empty unused-hand arrays, and no mutation of settings.

### Acceptance criteria

- [ ] Given validated settings and a scripted random source, when a Piece is generated, then every decision matches the PRD probabilities at the scripted boundaries.
- [ ] Given any generated measure, then its durations sum exactly to the selected meter using eligible catalog patterns.
- [ ] Given a pitched event, when the next pitch is chosen, then only targets within 12 semitones receive weight and weights are normalized over available targets.
- [ ] Given a completed bar ending in rests, when the next fresh pitch is chosen, then the transition is interval-weighted from the bar's last pitched event.
- [ ] Given generation completes, then the Piece is JSON-serializable, self-contained, and the input settings are unmutated.

### User stories addressed

- User story 31: Generate creates an immutable Piece (model only; the action lands in Issue 12)
- User story 33: interval-weighted melodic movement
- User story 34: occasional rests without unrestricted identical consecutive rests

---
