## Issue 12: Rhythm catalog packaging, health validation, and eligible-rhythm calculation

**Type**: AFK
**Blocked by**: Issue 1

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Turn the curated catalog at `Notes/all-rhythms.txt` into the authoritative, build-time-packaged source of complete-measure rhythm patterns and add the Music Domain functions that parse it and compute eligible rhythms. Covers the PRD's rhythm-catalog decisions: each time-signature heading is followed by one token sequence per line over the tokens `W`, `H`, `D`, `Q`, `R`, and `E`; a rhythm is eligible only when every token it contains is selected.

Catalog validation is part of the health check from Issue 1: syntax, supported tokens only, exact measure length for every pattern under its heading, and at least one pattern for each supported time signature. A malformed catalog must fail health validation rather than fail at generation time.

### How to verify

- **Manual**: run the health check with the real catalog and confirm it passes and reports pattern counts per meter; temporarily corrupt a pattern's length and confirm the health check fails naming the meter and line.
- **Automated**: Bun tests parsing the real catalog and asserting every pattern's token durations sum exactly to its heading's measure length, that all three supported meters have at least one pattern, and that unknown tokens, missing headings, an unsupported heading, and a wrong-length pattern each fail. Further tests assert eligible-rhythm calculation returns only patterns whose tokens are all selected, and an empty result when no pattern qualifies.

### Acceptance criteria

- [ ] Given the packaged catalog, when it is validated, then every pattern's duration sums exactly to its time signature's measure length.
- [ ] Given a catalog missing patterns for a supported time signature, then health validation fails.
- [ ] Given a catalog containing an unsupported token or malformed heading, then health validation fails with a message identifying the defect.
- [ ] Given a set of selected duration tokens, when eligible rhythms are computed for a meter, then only patterns whose tokens are all selected are returned.
- [ ] Given a selection with no qualifying pattern, then the eligible-rhythm result is empty rather than an error.

### User stories addressed

- User story 66: Curated rhythm catalog validated before the application is considered healthy

---
