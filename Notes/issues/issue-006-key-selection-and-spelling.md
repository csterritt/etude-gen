## Issue 6: Key selection with key-signature pitch spelling

**Type**: AFK
**Blocked by**: Issue 5

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Add key selection to the setup step, restricted to the exact supported major keys (C, G, D, A, E, F, B-flat, E-flat, A-flat) and natural-minor keys (A, E, B, F-sharp, C-sharp, D, G, C, F) listed in the PRD's "Supported musical domain" section, and derive the seven diatonic pitches of the selected key using conventional key-signature spelling rather than enharmonic duplicates.

The Music Domain owns the key catalog and the pitch-name derivation. The setup step exposes only supported keys, and the server rejects any other submitted key. Display the derived pitch names for the selected key somewhere on the step so the spelling is observable end-to-end.

The key field is a parameter form field, so it inherits the setup pattern from Issue 5, including the hostile shapes: an empty key and a repeated multi-value key field each resolve deterministically rather than falling back to the stored or default key. A committed key change is an upstream change, so it clears dependent downstream state through the Issue 11 invalidation in the same committed transition; resubmitting the identical key is not a change and clears nothing.

### Cross-cutting contract

Inherits `Notes/issues/etude-cross-cutting-contract.md`:

- Section 1: universal route requirements for the setup route.
- Section 2: the parameter-form contract established by Issue 5, including safe redisplay, accessible field errors, and hostile-shape tolerance.
- Section 4: the workflow version increments on a successful commit and the aggregate epoch is verified.
- Section 6: the applicability matrix row for Issue 6, which marks invalidation as inherited.

### How to verify

- **Manual**: select E-flat major and confirm the derived pitch names read B-flat and E-flat rather than A-sharp and D-sharp; select F-sharp minor and confirm F-sharp and C-sharp spelling.
- **Automated**: Bun tests asserting the exact supported key list, rejection of any unsupported or over-four-accidental key, and the exact seven pitch names for every supported key including all sharp keys, all flat keys, and each natural minor. Further tests submit an empty key and a repeated multi-value key field and assert a deterministic reject or stated normalization with no 500. Playwright tests select a flat key and assert the flat spellings appear, commit a key change and assert dependent pitch, duration, split, and derived-review state are cleared, and resubmit the identical key and assert nothing is cleared.

### Acceptance criteria

- [ ] Given the setup step, then exactly the eighteen supported keys are offered and no key with more than four sharps or flats appears.
- [ ] Given a submitted unsupported key, then it is rejected with a field-level error and nothing is persisted.
- [ ] Given a selected key, when its pitches are derived, then all seven names use that key signature's conventional spelling.
- [ ] Given a natural-minor key, then its pitches match the natural minor scale, not harmonic or melodic minor.
- [ ] Given a committed key change, then dependent pitch, duration, split, and derived-review state are cleared through the Issue 11 invalidation in the same committed transition.
- [ ] Given a resubmission of the identical key, then nothing dependent is cleared.
- [ ] Given an empty key field or a repeated multi-value key field, then the submission resolves deterministically to a field-addressable reject or a stated normalization, never a 500 and never a silent fallback to the stored key.

### User stories addressed

- User story 7: Choose a supported major or natural-minor key with at most four accidentals
- User story 8: Pitches spelled according to the selected key signature

---
