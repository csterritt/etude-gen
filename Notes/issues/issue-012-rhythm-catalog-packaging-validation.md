## Issue 12: Rhythm catalog packaging, health validation, and eligible-rhythm calculation

**Type**: AFK
**Blocked by**: Issue 1

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Turn the curated catalog at `Notes/all-rhythms.txt` into the authoritative, build-time-packaged source of complete-measure rhythm patterns and add the Music Domain functions that parse it and compute eligible rhythms. Covers the PRD's rhythm-catalog decisions: each time-signature heading is followed by one token sequence per line over the tokens `W`, `H`, `D`, `Q`, `R`, and `E`; a rhythm is eligible only when every token it contains is selected.

Token durations are fixed by this issue, in quarter-note beats: `W` = 4, `H` = 2, `D` = 3, `Q` = 1, `R` = 1.5, `E` = 0.5. Measure length per supported heading is likewise fixed: 2/4 = 2, 3/4 = 3, and 4/4 = 4 quarter-note beats. Length validation uses exact arithmetic — integer or rational comparison, for instance by counting in eighth-note units or comparing numerator/denominator pairs — never accumulated floating-point sums with a tolerance, so a pattern of eighths and dotted quarters is judged exactly.

Duplicate identical patterns under the same heading are deliberately allowed in the curated file, because the file is maintained by hand and an accidental repeat must not break the build. Packaging de-duplicates them, so each distinct pattern appears exactly once in the packaged eligible set and the recency-weighted repeat selection in Issue 24 is not skewed by a curation accident.

Catalog validation is part of the health check from Issue 1: syntax, supported tokens only, supported headings only, exact measure length for every pattern under its heading, and at least one pattern for each supported time signature. A malformed catalog must fail health validation rather than fail at generation time, and the failure message names the offending meter and line.

### How to verify

- **Manual**: run the health check with the real catalog and confirm it passes and reports pattern counts per meter; temporarily corrupt a pattern's length and confirm the health check fails naming the meter and line.
- **Automated**: Bun tests parsing the real catalog and asserting every pattern's token durations sum exactly to its heading's measure length, that all three supported meters have at least one pattern, and that unknown tokens, missing headings, an unsupported heading, and a wrong-length pattern each fail with a message naming the meter and line. Further tests assert the exact numeric duration of each token, that a fractional pattern of eighths and dotted quarters validates exactly under the integer or rational comparison, that a duplicate identical pattern passes validation and appears once in the packaged set, that eligible-rhythm calculation returns only patterns whose tokens are all selected, and that an unqualifying selection yields an empty result.

### Acceptance criteria

- [ ] Given the packaged catalog, when it is validated, then every pattern's duration sums exactly to its time signature's measure length.
- [ ] Given a catalog missing patterns for a supported time signature, then health validation fails.
- [ ] Given a catalog containing an unsupported token or malformed heading, then health validation fails with a message identifying the defect.
- [ ] Given a set of selected duration tokens, when eligible rhythms are computed for a meter, then only patterns whose tokens are all selected are returned.
- [ ] Given a selection with no qualifying pattern, then the eligible-rhythm result is empty rather than an error.
- [ ] Given the token set, then durations in quarter-note beats are `W` = 4, `H` = 2, `D` = 3, `Q` = 1, `R` = 1.5, `E` = 0.5, and measure lengths are 2 for 2/4, 3 for 3/4, and 4 for 4/4.
- [ ] Given a pattern built only from eighths and dotted quarters, when its length is validated, then exact integer or rational arithmetic accepts it at the measure length and rejects it one eighth short or long, with no floating-point tolerance.
- [ ] Given two identical patterns under the same heading, then health validation still passes and the packaged eligible set contains that pattern exactly once.
- [ ] Given a token sequence under an unsupported heading, then health validation fails and the message names the heading.
- [ ] Given a wrong-length pattern, then health validation fails and the message names the offending meter and line.

### User stories addressed

- User story 66: Curated rhythm catalog validated before the application is considered healthy

---
