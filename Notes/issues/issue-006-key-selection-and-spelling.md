## Issue 6: Key selection with key-signature pitch spelling

**Type**: AFK
**Blocked by**: Issue 5

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Add key selection to the setup step, restricted to the exact supported major keys (C, G, D, A, E, F, B-flat, E-flat, A-flat) and natural-minor keys (A, E, B, F-sharp, C-sharp, D, G, C, F) listed in the PRD's "Supported musical domain" section, and derive the seven diatonic pitches of the selected key using conventional key-signature spelling rather than enharmonic duplicates.

The Music Domain owns the key catalog and the pitch-name derivation. The setup step exposes only supported keys, and the server rejects any other submitted key. Display the derived pitch names for the selected key somewhere on the step so the spelling is observable end-to-end.

### How to verify

- **Manual**: select E-flat major and confirm the derived pitch names read B-flat and E-flat rather than A-sharp and D-sharp; select F-sharp minor and confirm F-sharp and C-sharp spelling.
- **Automated**: Bun tests asserting the exact supported key list, rejection of any unsupported or over-four-accidental key, and the exact seven pitch names for every supported key including all sharp keys, all flat keys, and each natural minor. A Playwright test selects a flat key and asserts the flat spellings appear.

### Acceptance criteria

- [ ] Given the setup step, then exactly the eighteen supported keys are offered and no key with more than four sharps or flats appears.
- [ ] Given a submitted unsupported key, then it is rejected with a field-level error and nothing is persisted.
- [ ] Given a selected key, when its pitches are derived, then all seven names use that key signature's conventional spelling.
- [ ] Given a natural-minor key, then its pitches match the natural minor scale, not harmonic or melodic minor.

### User stories addressed

- User story 7: Choose a supported major or natural-minor key with at most four accidentals
- User story 8: Pitches spelled according to the selected key signature

---
