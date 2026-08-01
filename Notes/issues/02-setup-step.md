## Issue 2: Setup step — measures, meter, key, and hands

**Type**: AFK
**Blocked by**: Issue 1

### Parent PRD

`PRD-etude-generator.md`

### What to build

The first workflow page end-to-end: `GET /etude/setup` renders a server-rendered form with measure count (4–32), time signature (2/4, 3/4, 4/4), key (the supported major and natural-minor keys from "Supported musical domain"), and hand selection (left, right, both), initialized from the saved aggregate (PRD defaults for a new workflow). `POST /etude/setup` validates every value authoritatively on the server via the Music Domain module, persists the aggregate with a compare-and-set workflow version, and 303-redirects to the next canonical step (notes). Native HTML constraints mirror the server rules. This slice includes the Music Domain's supported-key and meter definitions and the parameter-validation boundary; octave-range fields are added in Issue 4 and validation UX polish (error summary, focus) in Issue 3.

### How to verify

- **Manual**: from a fresh workflow, submit the setup form untouched and land on the notes step; change each field, submit, and confirm the saved values render on return; confirm the form works with client scripting disabled.
- **Automated**: Bun tests for Music Domain setup validation (exact supported key list, measure bounds, meter set, hand set; invalid values rejected without coercion); Playwright tests for defaults, valid submission, redirect, and persistence across reload.

### Acceptance criteria

- [ ] Given a new workflow, when the student opens the setup step, then the form shows 8 measures, 4/4, C major, and right hand.
- [ ] Given valid non-default selections, when the student submits, then the aggregate version increments, the values persist, and a 303 redirect lands on the notes step.
- [ ] Given an out-of-range or unsupported submitted value, when the server validates it, then the submission is rejected and no persisted state changes.
- [ ] Given the POST, when it succeeds or fails, then the response follows the PRG contract (303 to a canonical GET).

### User stories addressed

- User story 4: sensible initial settings
- User story 5: choose between 4 and 32 measures
- User story 6: choose 2/4, 3/4, or 4/4
- User story 7: supported keys with no more than four sharps or flats
- User story 12: choose left hand, right hand, or both

---
