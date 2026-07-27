# PRD: Etude Generator

## Problem Statement

A piano student wants to practice specific skills — particular notes, particular rhythms, particular octaves, particular hands — but has no easy way to generate targeted practice material. Existing etude books are fixed and don't adapt to what the student needs to work on right now. The student needs a tool that produces random but musical etudes constrained to exactly the parameters they want to practice, with both visual sheet music and audio playback so they can hear what they're trying to play.

## Solution

A signed-in student visits a single page with a form of generation parameters at the top. They select the notes, durations, octaves, time signature, number of measures, and which hand(s) to use, then click Generate. The page displays the generated sheet music as an SVG image, audio controls for browser-based playback via Tone.js, and a button to download a PDF version of the sheet music. The form retains the values used for the last generation so the student can tweak and regenerate quickly. The generation algorithm produces musically coherent results with repeated phrases, interval-probability-driven melodic motion, and proper two-hand coordination.

## User Stories

1. As a `student`, I want to sign in to the etude generator, so that I can access the generation page.
2. As a `student`, I want to select a time signature (4/4, 3/4, 2/4, 6/8), so that the generated etude matches the meter I'm practicing.
3. As a `student`, I want to select the number of measures (1–32), so that the etude is the right length for my practice session.
4. As a `student`, I want to select which notes to use from a list of all 12 pitch classes plus Rest, so that I can practice specific pitches.
5. As a `student`, I want to select which durations to use (whole, half, quarter, eighth, dotted half, dotted quarter), so that I can practice specific rhythms.
6. As a `student`, I want to select one or more octaves (e.g., 4, 5, 6), so that I can practice in the register I'm working on.
7. As a `student`, I want to choose which hand(s) to generate for (left, right, both), so that I can practice left hand, right hand, or both hands together.
8. As a `student`, I want to click a Generate button, so that the etude is created and displayed below the form.
9. As a `student`, I want the form to retain the values I used after generation, so that I can quickly tweak and regenerate.
10. As a `student`, I want to see the generated etude as sheet music (SVG), so that I can read and play it.
11. As a `student`, I want right-hand notes to have stems pointing up and left-hand notes to have stems pointing down, so that I can easily distinguish hands in the sheet music.
12. As a `student`, I want to see audio controls (play, stop, BPM slider 40–200) after generation, so that I can hear the etude at a tempo I choose.
13. As a `student`, I want to click a button to download a PDF of the generated sheet music, so that I can print it or view it offline.
14. As a `student`, I want the generated etude to have repeated phrases, so that it feels musical rather than totally random.
15. As a `student`, I want the generated etude to have interval-probability-driven melodic motion, so that the melodies sound natural.
16. As a `student`, I want the generated etude to stay within my selected octaves, so that I'm practicing in the register I chose.
17. As a `student`, I want consecutive notes to not jump more than an octave, so that the etude is physically playable.
18. As a `student`, I want note durations in each bar to sum correctly to the time signature, so that the music is rhythmically valid.
19. As a `student`, I want rests to appear occasionally (10% probability per note), so that the etude has musical breathing room.
20. As a `student`, when both hands are selected, I want the left hand to play lower notes and the right hand to play higher notes, so that the hands don't collide.
21. As a `student`, when both hands are selected, I want the two hands to sometimes share the same rhythm and sometimes have independent rhythms, so that the etude has variety.
22. As a `student`, I want the default hand selection to be "right," so that I can quickly generate a one-hand etude without extra clicks.
23. As a `student`, I want the default number of measures to be 8, so that I get a reasonably sized etude without configuring it.
24. As a `student`, I want the default BPM to be 80, so that playback starts at a moderate practice tempo.
25. As a `student`, if I submit the form without selecting any notes, I want to see an error message, so that I know I need to select at least one.
26. As a `student`, if I submit the form without selecting any durations, I want to see an error message, so that I know I need to select at least one.
27. As a `student`, if I submit the form without selecting any octaves, I want to see an error message, so that I know I need to select at least one.
28. As a `student`, if the LilyPond rendering service is unavailable or times out, I want to see an error message on the page, so that I know something went wrong.
29. As a `student`, if the LilyPond rendering service returns an error, I want to see an error message on the page, so that I can try again.
30. As a `student`, if I navigate to `/etude` without being signed in, I want to be redirected to the sign-in page with an error, so that the app is protected.
31. As a `student`, if I visit `/private` (the old route), I want it to not exist, so that there's no stale or broken page.
32. As a `student`, I want the generated etude to have between 60% and 100% unique bars, so that there's a balance of repetition and variety.
33. As a `student`, I want repeated bars to sometimes be consecutive and sometimes non-adjacent, so that the repetition feels natural.
34. As a `student`, I want repeated bars to sometimes be exact copies, sometimes same rhythm with new pitches, and sometimes same pitches with different rhythm, so that the repetition has variety.
35. As a `student`, I want the first note of the etude to be randomly chosen from my selected notes and octaves, so that each generation is different.
36. As a `student`, when both hands are generated with the same rhythm, I want the second hand's pitches to differ from the first hand at every point in time, so that the hands aren't playing unison.
37. As a `student`, when both hands are generated with independent rhythms, I want the second hand's pitches to differ from the first hand at every overlapping point in time, so that the hands aren't colliding.
38. As a `student`, I want the BPM slider to range from 40 to 200, so that I can practice at slow and fast tempos.
39. As a `student`, I want audio controls to only appear after music is generated, so that the page isn't cluttered before generation.
40. As a `student`, I want Tone.js to use the Salamander piano samples, so that playback sounds like a real piano.
41. As a `student`, I want the etude page to allow scripts in the CSP sandbox, so that Tone.js playback works in the browser.
42. As a `student`, I want Tone.js to be served locally from the app's public directory, so that there are no external CDN dependencies.
43. As a `developer`, I want the music generation to run server-side in the Worker, so that the generation algorithm is consistent and the client doesn't need to download the generator.
44. As a `developer`, I want the LilyPond rendering to be delegated to an external service, so that the Worker doesn't need to run LilyPond itself.
45. As a `developer`, I want the generated piece to be stored in a JSON-serializable hierarchical structure (Piece → Measures → Notes), so that it can be converted to multiple output formats.
46. As a `developer`, I want the global body limit to be 8KB, so that the etude form with many checkboxes can be submitted.
47. As a `developer`, I want the `/private` route and its tests removed entirely, so that the codebase is clean.
48. As a `developer`, I want the etude page to use a page-specific CSP configuration, so that scripts are allowed only where needed.
49. As a `developer`, I want the PDF regeneration to be proxied through the etude Worker, so that the LilyPond API key is never exposed to the browser.
50. As a `developer`, I want the LilyPond service to be documented as an external dependency with an API contract, so that it can be built as a separate project.

## Implementation Decisions

### Architecture

- The etude generation algorithm runs server-side in the Cloudflare Worker on POST `/etude`.
- The Worker converts the generated `Piece` to LilyPond notation, then POSTs to the external LilyPond service for rendering (SVG + MIDI).
- The Worker converts the returned MIDI event array into a self-contained `<script>` block that initializes Tone.js with Salamander samples.
- The Worker renders the page with the SVG, embedded Tone.js script, audio controls, and the form (with previous values preserved).
- PDF regeneration is proxied through the etude Worker to keep the LilyPond API key server-side.

### Routes

- `/etude` GET — main etude generation page (requires authentication via `signedInAccess` middleware).
- `/etude` POST — generate etude (requires authentication, validates form, runs generation pipeline).
- `/etude/pdf` POST — proxy PDF generation request to LilyPond service (requires authentication).
- `/private` route and its tests are removed entirely.
- The `redirectTo` in better-auth config changes from `/private` to `/etude`.

### Body Limit

- The global body limit is changed from 1KB (test) / 4KB (prod) to 8KB to accommodate the etude form with many checkboxes.

### Content Security Policy

- A new etude-page-specific CSP configuration is created (not reusing `ALLOW_SCRIPTS_SECURE_HEADERS`).
- CSP sandbox allows `allow-same-origin`, `allow-scripts`, `allow-forms`.
- `scriptSrc` includes `'self'` only.
- Tone.js is downloaded and served from the `public/` directory. No CDN dependencies.

### Environment Variables

- `LILYPOND_SERVICE_URL` (secret) — base URL of the external LilyPond service.
- `LILYPOND_API_KEY` (secret) — bearer token for the external service.
- `LILYPOND_TIMEOUT_MS` (var, default 30000) — timeout for external service calls.

### External Dependency: LilyPond Service API Contract

The LilyPond service is a separate web application, not built as part of this PRD. Its API contract:

**Render endpoint** — `POST {LILYPOND_SERVICE_URL}/render`
- Request: `Authorization: Bearer {LILYPOND_API_KEY}`, body: `{ "lilypondCode": "<string>" }`
- Response 200: `{ "svg": "<string>", "midi": [<MidiEvent>] }`
- Response error: appropriate HTTP status code

**PDF endpoint** — `POST {LILYPOND_SERVICE_URL}/pdf`
- Request: `Authorization: Bearer {LILYPOND_API_KEY}`, body: `{ "lilypondCode": "<string>" }`
- Response 200: PDF binary (content-type `application/pdf`)
- Response error: appropriate HTTP status code

**MIDI event format**: `{ "note": <number>, "duration": <number>, "time": <number>, "velocity": <number> }`

### Generation Algorithm

**Parameters**: notes (array of pitch class names + optionally "Rest"), durations (array of allowed duration values), octaves (array of octave numbers), timeSignature (one of 4/4, 3/4, 2/4, 6/8), measures (1–32), hand (left, right, both).

**Interval probabilities** (half-steps → probability):
- 0: 0.0932197441181743
- 1: 0.0755079927357212
- 2: 0.121143267210103
- 3: 0.109028940489093
- 4: 0.0981260464401835
- 5: 0.0883134417961651
- 6: 0.0794820976165486
- 7: 0.0715338878548937
- 8: 0.0643804990694044
- 9: 0.0579424491624639
- 10: 0.0521482042462175
- 11: 0.0469333838215958
- 12: 0.0422400454394362

**Pitch selection**: The interval probability determines the jump in half-steps from the previous note. The resulting pitch must be in the user's selected note list and within the selected octaves. If a jump would land outside the valid set, a different valid candidate is chosen. Consecutive notes cannot span more than 12 half-steps. The entire piece stays within the selected octaves.

**Bar generation** (per hand):
1. Start with a single note from the user's range that fills the entire bar (e.g., whole note for 4/4), in one of the user's selected octaves. The first note of the piece is randomly chosen from the user's selected notes and octaves.
2. Loop: randomly pick a note in the bar and split it into smaller notes, with the constraint that the sum of the durations of the smaller notes equals the duration of the original note. Split into randomly chosen valid durations from the user's selected durations.
3. With a probability of 0.1, make a note a rest. Rest is always an option regardless of the user's note selection.
4. Continue the loop until: the bar only contains note durations allowed by the user. When there are only allowed durations but notes could still be split to shorter allowed durations, randomly decide whether to continue splitting or stop.

**Two-hand generation**:
- 50% probability per bar: same rhythm or independent rhythm.
- Same rhythm: the second hand uses the same durations as the first hand. Pitches for the second hand start from their own random octave/note, then follow interval probabilities, with the additional requirement of not generating the exact same pitch as the first hand at any point in time.
- Independent rhythm: redo the splitting algorithm for the second hand. Ensure the second hand's notes differ from the first hand at overlapping points in time.
- Lower note = left hand, higher note = right hand, applied on every note.

**Bar reuse**:
- Generate unique bars first, then randomly assign to measures with repeats.
- 60%–100% of bars are unique.
- A bar can repeat more than once.
- 60% of repeats are consecutive, 40% are non-adjacent.
- Reuse variants: 60% exact copy, 20% same rhythm with new pitches (generated via interval probabilities), 20% same pitches with different rhythm (rearranged durations among the same pitches, if possible; fall back to exact copy if not possible).
- Interval probabilities are applied across bar boundaries when generating a new bar. When copying an existing bar, the interval is ignored.

### Data Structure

The internal music representation is a JSON-serializable hierarchical structure: Piece → Measures → Notes.

- Piece contains: time signature, number of measures, and an array of measures.
- Each measure contains one or two arrays of notes (one for right hand, one for left hand). If only one hand is generated, the right hand array has notes and the left hand array is empty.
- Each note has: pitch (pitch class name + octave, or null for rest) and duration (a duration value from the allowed set).

### Form Parameters

- Measures: number input, 1–32, default 8.
- Time signature: select/radio, options 4/4, 3/4, 2/4, 6/8, default 4/4.
- Notes: checkboxes, all 12 pitch classes (with enharmonic equivalents as single entries: C, C#/Db, D, D#/Eb, E, F, F#/Gb, G, G#/Ab, A, A#/Bb, B) plus Rest. At least one required. Rest is always available for generation regardless of selection.
- Durations: checkboxes, options: whole (1), half (1/2), quarter (1/4), eighth (1/8), dotted half, dotted quarter. At least one required.
- Octaves: checkboxes, options: 2, 3, 4, 5, 6. At least one required.
- Hand: radio buttons, options: left, right, both. Default: right.
- BPM: slider, 40–200, default 80.
- Form validation failures redirect with an error message (following existing `redirectWithError` pattern).

### Audio Playback

- Tone.js is downloaded and served from the `public/` directory.
- The Worker converts MIDI events to a self-contained `<script>` block that:
  - Initializes a `Tone.Sampler` with Salamander piano samples.
  - Defines the note sequence from the MIDI events.
  - Exposes play, stop, and setBPM functions.
- Audio controls (play button, stop button, BPM slider) appear only after music is generated.

## Module Design

### Music Generator

- **Responsibility**: Takes generation parameters and produces a `Piece`. Encapsulates all generation logic: bar creation via note splitting, interval-probability-driven pitch selection, bar reuse (exact/rhythm-only/notes-only), two-hand coordination (same/independent rhythm, lower=left constraint).
- **Interface**: `generatePiece(params: GenerationParams): Piece`
- **Tested**: Yes

### LilyPond Converter

- **Responsibility**: Converts a `Piece` into LilyPond notation text, with correct stem directions (right = up, left = down), time signature, and note spelling.
- **Interface**: `pieceToLilypond(piece: Piece): string`
- **Tested**: Yes

### LilyPond Service Client

- **Responsibility**: Communicates with the external LilyPond service. Sends LilyPond code to `/render` (returns SVG + MIDI) or `/pdf` (returns PDF). Handles Bearer token auth, timeouts, and error reporting.
- **Interface**: `render(lilypondCode: string): Promise<{ svg: string, midi: MidiEvent[] }>` and `renderPdf(lilypondCode: string): Promise<Blob>`
- **Tested**: Yes (mocked HTTP calls)

### Tone.js Converter

- **Responsibility**: Converts a MIDI event array into a self-contained `<script>` block that initializes `Tone.Sampler` with Salamander samples, defines the note sequence, and exposes play/stop/setBPM functions.
- **Interface**: `midiToToneJs(midi: MidiEvent[]): string`
- **Tested**: Yes

### Etude Route Handler

- **Responsibility**: Controller for GET/POST `/etude` and POST `/etude/pdf`. Parses and validates form, orchestrates generator → converter → service client → Tone.js converter, renders page with form (preserving values), SVG, audio controls, and embedded script.
- **Interface**: `buildEtude(app: Hono): void` (follows existing `buildXxx` pattern)
- **Tested**: Yes (Playwright e2e)

### Etude Form Validator

- **Responsibility**: Valibot schema validating the etude form submission (measures 1–32, time signature enum, at least one note/duration/octave, hand enum).
- **Interface**: `EtudeFormSchema` (Valibot schema) + existing `validateRequest` helper
- **Tested**: Yes

## Testing Decisions

- **Music Generator**: Unit tests covering bar generation, note splitting, interval probability selection, octave constraints, two-hand coordination, bar reuse (exact/rhythm/notes variants), rest generation, and edge cases (single note, single octave, single duration, both hands with same rhythm, both hands with independent rhythm).
- **LilyPond Converter**: Unit tests verifying correct LilyPond syntax for various piece structures, stem directions, time signatures, rests, and multi-hand pieces.
- **LilyPond Service Client**: Unit tests with mocked `fetch` calls verifying request format (Bearer token, JSON body), response parsing (SVG + MIDI), PDF handling, timeout behavior, and error states.
- **Tone.js Converter**: Unit tests verifying generated code structure — Sampler initialization, note sequence from MIDI events, play/stop/setBPM function exposure.
- **Etude Form Validator**: Unit tests for valid submissions, missing notes/durations/octaves, out-of-range measures, invalid time signatures.
- **Etude Route Handler**: Playwright e2e tests covering page load, form submission, generation display, form value preservation, audio control visibility, PDF download button, authentication redirect, and error states (LilyPond service failure).
- **Prior art**: Existing e2e tests in `e2e-tests/` for auth flows and existing unit tests in `tests/` for utility functions serve as reference patterns.

## Out of Scope

- Building the LilyPond rendering service itself (documented as external dependency).
- Persisting generated etudes to the database (pieces are ephemeral).
- Teacher interface or multi-user features.
- Editing generated etudes after creation.
- Saving or sharing etudes.
- Time signatures beyond 4/4, 3/4, 2/4, 6/8.
- Durations beyond whole, half, quarter, eighth, dotted half, dotted quarter.
- Octaves outside the standard piano range.
- Non-piano instruments.
- Tempo changes within a piece.
- Dynamics or articulation markings.
- Key signatures or accidentals beyond the selected note set.
- Chords (only single notes per hand at a time).

## Open Questions

None — all questions were resolved during the interview. The LilyPond service will be built as a separate project with its own PRD.

## Further Notes

- Enharmonic equivalents (e.g., A#/Bb) are treated as a single entry in the note selection. The spelling used in LilyPond output does not matter for generation purposes.
- The `redirectTo` value in the better-auth configuration (`src/lib/auth.ts`) must be updated from `/private` to `/etude`.
- The `PATHS.PRIVATE` constant and all references to `/private` must be removed from `src/constants.ts` and route files.
- The `buildPrivate` route file and its tests should be removed.
- The existing `signedInAccess` middleware is reused for the `/etude` route.
- The global body limit in `src/index.ts` is updated from 1KB/4KB to 8KB.
- The Tone.js salamander sample library will be downloaded for loading in the browser, in `public/samples/`.
