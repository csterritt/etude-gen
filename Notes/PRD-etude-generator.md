# PRD: Etude Generator

## Problem Statement

A piano student wants practice material (etudes) tailored to exactly what they are working on: a specific key, a limited set of pitches, particular note durations, one hand or both, and a constrained pitch range. Generic sheet music does not let them control these parameters, so they end up practicing material that is too hard, in the wrong key, or using notes they have not learned yet. There is no existing way in the application to generate custom, randomized-but-musically-plausible piano etudes on demand.

## Solution

An authenticated web application where a signed-in user walks through a short series of forms describing the etude they want: structure (measures, key, time signature, hand(s)), material (pitches, durations, octaves), and — for two-hand pieces — a split point dividing the selected notes between the hands. After reviewing a summary, the user generates sheet music rendered as an SVG image embedded in the page, and can download a PDF, regenerate a new piece with the same parameters, or go back and adjust their choices.

The generated music is not totally random: rhythms are built by recursively splitting a bar-length note into the user's allowed durations, occasional bars repeat earlier bars, and pitches follow a weighted random walk using interval probabilities so melodies feel shaped rather than arbitrary. All user input is validated server-side, generation is rate-limited to one per minute per user, and the rendered score is sanitized before being embedded in the page.

## User Stories

1. As a **visitor**, I want to be redirected to sign in when I try to access the etude generator, so that only authenticated users can generate music.
2. As a **student**, I want to start the etude wizard at the main etude page, so that I can begin configuring a piece.
3. As a **student**, I want to choose the number of measures (4 to 32), so that I can control the length of the etude.
4. As a **student**, I want to choose from 18 keys (major and minor keys with up to four flats or sharps), so that I can practice in the key I am studying.
5. As a **student**, I want to choose a time signature (2/4, 4/4, 3/4, or 6/8), so that I can practice different meters.
6. As a **student**, I want to choose left hand, right hand, or both hands, so that I can practice the hand(s) I need.
7. As a **student**, I want the second step to offer only pitches diatonic to my chosen key, so that I cannot accidentally select notes outside the key.
8. As a **student**, I want to select at least 3 pitches from the key, so that my etude has enough melodic material.
9. As a **student**, I want to select at least 2 durations from eighth, quarter, half, whole, dotted half, and dotted quarter, so that my etude has rhythmic variety.
10. As a **student**, I want to select one or more octaves (2 through 6), so that I can control the register of a single-hand etude.
11. As a **student generating a two-hand piece**, I want to choose a split point between two adjacent notes in my selected pitch set, so that notes above the split are played by the right hand and notes below it by the left hand.
12. As a **student generating a two-hand piece**, I want the split point validated so that both hands receive at least one note and the left hand's notes are always below the right hand's, so that the generated music is physically playable and clearly voiced.
13. As a **student**, I want each step to display my earlier choices, so that I always know the full context of my configuration.
14. As a **student**, I want a Back button on every step, so that I can revise earlier choices without losing my work.
15. As a **student**, I want a summary of all my choices before generation, so that I can confirm everything is correct.
16. As a **student**, I want a Generate button on the summary, so that I can produce the sheet music.
17. As a **student**, I want generated rhythms where each bar's durations sum correctly to the time signature, so that the music is well-formed.
18. As a **student**, I want generated music to occasionally repeat earlier bars, so that the etude has recognizable phrases rather than pure novelty.
19. As a **student**, I want melodies whose intervals follow musical probabilities (smaller intervals more likely), so that the etude sounds plausible.
20. As a **student**, I want occasional rests in the music, so that the rhythm is varied and realistic.
21. As a **student generating a two-hand piece**, I want the hands to sometimes share a rhythm and sometimes differ, so that the texture is varied.
22. As a **student**, I want right-hand notes rendered with stems up and left-hand notes with stems down, so that the score is easy to read by hand.
23. As a **student**, I want the generated score embedded in a page showing all my choices, so that I can verify the result matches what I asked for.
24. As a **student**, I want a Generate button on the result page, so that I can generate a new, different piece with the same parameters.
25. As a **student**, I want a PDF button on the result page, so that I can download a printable version of the generated piece.
26. As a **student**, I want Back buttons on the result page, so that I can return to any earlier step and adjust my selections.
27. As a **student**, I want clear, field-level error messages when my input is invalid, with my selections preserved, so that I can fix mistakes without starting over.
28. As a **student**, I want to be told when I have exceeded the rate limit of one generation per minute, so that I understand why my request was refused and can retry later.
29. As a **student**, I want to see a clear error when the sheet-music service fails or times out, with my selections preserved, so that I can retry without re-entering everything.
30. As a **student using a screen reader**, I want labeled form controls, announced validation errors, focus management after errors and generation, and a text description of the generated score, so that I can use the generator accessibly.
31. As a **student**, I want the embedded score SVG to contain no scripts or interactive content, so that the page is safe and behaves predictably in assistive technology.
32. As an **operator**, I want all errors logged with a request/correlation identifier and no PII or secrets, so that I can diagnose failures without compromising user privacy.
33. As an **operator**, I want LilyPond service calls to time out after a configurable duration (default 30 seconds), so that a hung service does not hang user requests.

## Implementation Decisions

### Architecture

- Built on the existing base auth application (Hono on Cloudflare Workers, server-rendered JSX, better-auth, D1 via Drizzle). Authentication, session management, and sign-up modes are unchanged.
- The etude wizard replaces the existing placeholder private page: a single path serves GET (render current step) and POST (step transitions and generation). All wizard steps live on this one path.
- The wizard is fully server-driven: each step is a form containing hidden fields carrying all earlier choices, plus a step indicator. Navigation (Next, Back, Generate, PDF) is a form submission with a direction/action field; the server validates the accumulated state and re-renders the appropriate step with prior values pre-filled via `value` attributes.
- Generated pieces are **not persisted**. The only database change is rate-limit bookkeeping (see Schema).
- The internal music representation is a JSON-serializable hierarchy: Piece → Measures → per-hand note arrays (the unused hand's array is empty). Each note carries pitch information (or a rest marker) and duration. This structure is presentation-independent; LilyPond code is derived from it.

### Wizard steps and validation

- **Step 1**: measures (integer 4–32), key (18 options: C, G, D, A, E, F, Bb, Eb, Ab major and A, E, B, F#, C#, D, G, C, F minor), time signature (2/4, 4/4, 3/4, 6/8), hand (left, right, both).
- **Step 2**: pitches (checkboxes of the chosen key's diatonic pitch classes; minimum 3), durations (checkboxes; minimum 2), octaves (checkboxes 2–6; minimum 1). The selected pitch classes × selected octaves define the piece-wide allowed note set for every piece, single- or two-hand.
- **Step 3** (only when hand = both): a split point between two adjacent notes of the piece-wide allowed set; notes above the split belong to the right hand, notes below it to the left hand. The split must leave at least one allowed note in each hand.
- **Summary**: all choices displayed; Generate button.
- **Result page**: embedded sanitized SVG score, all choices displayed, hidden-field form with Generate (regenerate same params), PDF (download), and Back navigation to any step.
- All validation is server-side. On any failure (validation, rate limit, service error), the current step is re-rendered with a clear error message and all selections preserved.

### Music generation algorithm

- Duration units are integer eighth-note counts: eighth = 1, quarter = 2, half = 4, whole = 8, dotted quarter = 3, dotted half = 6. Bar totals: 2/4 = 4, 3/4 = 6, 4/4 = 8, 6/8 = 6 (six eighth-notes per bar; a dotted half fills a 3/4 or 6/8 bar exactly).
- **Rhythm per bar per hand**: start with a single bar-filling note (half for 2/4, whole for 4/4, dotted half for 3/4 and 6/8) with no pitch. Loop: while the bar contains disallowed durations — or splittable notes remain and a random coin says continue — pick a random note and split it into exactly two notes at a random split point, such that the two durations sum to the original. Each note then has an independent 10% chance of becoming a rest.
- **Bar repetition**: each bar after the first has a 10% chance of duplicating an earlier bar chosen uniformly at random. For two-hand pieces, 50% of repetitions copy the whole bar (both hands together); 50% copy an earlier bar per hand independently.
- **Two-hand rhythm**: when a bar is not a repetition, 50% of the time the second hand deep-copies the first hand's rhythm; 50% of the time the splitting algorithm runs independently for the second hand.
- **Pitch assignment**: after all rhythms are fixed, walk each bar of each hand. The first pitched note of a bar, and the first pitched note after a rest, gets a uniformly random pitch from the allowed set. For subsequent notes, candidates are the allowed pitches within 12 semitones of the current pitch; each candidate is weighted by the interval-probability table indexed by absolute semitone distance (0–12); one is chosen proportionally. Pitches more than 12 semitones away are excluded. Rests carry no pitch.
- **Allowed pitch sets**: for all pieces, the piece-wide allowed note set is the selected pitch classes × selected octaves. Single-hand pieces draw from that whole set. Two-hand pieces partition it at the split point: the right hand draws from allowed notes above the split, the left hand from allowed notes below it.
- The interval probability table (half-steps 0–12, summing to 1.0) is exactly as given in the project ideas document.

### LilyPond service integration

- The service contract is defined by this project (the service will conform to it):
  - `POST /generate` — request JSON body `{ "lilypond": "<code>" }`, header `Authorization: Bearer <key>`; success response 200 with JSON `{ "svg": "<svg markup>" }`; failure is any non-200 status with JSON `{ "error": "<generic message>" }` where available.
  - `POST /pdf` — identical request; success response 200 with `Content-Type: application/pdf` binary body; failure as above.
  - Error bodies contain only a generic, user-safe message; the service logs its own internal details (compiler diagnostics, etc.) and never returns them. The server logs the returned message with the request/correlation identifier and displays that generic message to the user.
  - Calls time out after `LILYPOND_TIMEOUT_MS` (default 30000).
- The server generates LilyPond code from the internal Piece representation, with right-hand stems up and left-hand stems down.
- The returned SVG is sanitized server-side with DOMPurify + jsdom before embedding; scripts, event handlers, and interactive content must be stripped. The result page includes a text alternative for the score containing exactly: the key, time signature, number of measures, hand(s), and selected pitches — nothing more.
- The PDF response is proxied back to the browser as a file download.
- Environment variables: `LILYPOND_SERVICE_URL` (secret), `LILYPOND_API_KEY` (secret), `LILYPOND_TIMEOUT_MS` (var, default 30000).

### Rate limiting

- One generation per minute per user, enforced on both piece generation and PDF download (both invoke the external service).
- Tracked in a **new rate-limit table** keyed by userId holding the last generation timestamp.
- When limited, the current step is re-rendered with an explanatory message and selections preserved.

### Schema changes

- One new table: etude generation rate limit (userId primary key, lastGenerationAt timestamp). No other schema changes.

### Accessibility, security, logging

- Labeled form controls; validation errors associated with fields and announced; focus moves to the error summary after failed submission and to the score region after successful generation; the score has a useful text alternative.
- Errors logged with a request/correlation identifier; no PII or secrets in logs.

## Module Design

- **Name**: etude-generator
  - **Responsibility**: builds the internal Piece JSON from validated parameters (rhythm splitting, rests, bar repetition, two-hand rhythm sharing, pitch walk).
  - **Interface**: input — validated generation parameters (measures, key, time signature, hand(s), pitch classes, durations, octaves and/or per-hand ranges); output — Piece JSON. Pure and deterministic given an injectable random source; failure modes are limited to invalid input (validated upstream).
  - **Tested**: yes

- **Name**: lilypond-emitter
  - **Responsibility**: converts Piece JSON into LilyPond code, including stem directions per hand.
  - **Interface**: input — Piece JSON; output — LilyPond source string.
  - **Tested**: yes

- **Name**: lilypond-client
  - **Responsibility**: calls the external LilyPond service (`/generate` and `/pdf`) with bearer auth, JSON body, and configurable timeout; normalizes service failures into typed errors.
  - **Interface**: input — LilyPond source and output mode (svg | pdf); output — SVG string or PDF bytes; failure modes — timeout, non-200, malformed response.
  - **Tested**: yes (mocked fetch)

- **Name**: svg-sanitizer
  - **Responsibility**: sanitizes service-returned SVG via DOMPurify + jsdom before embedding.
  - **Interface**: input — raw SVG string; output — safe SVG string; failure — rejects unparseable markup.
  - **Tested**: no (covered by e2e)

- **Name**: etude-validation
  - **Responsibility**: validates and parses all wizard form submissions into typed parameter objects, including cross-field rules (pitch minimums, split point leaving notes in both hands, key-consistent pitches).
  - **Interface**: input — raw form data; output — typed params or a list of field-level errors.
  - **Tested**: yes

- **Name**: etude-routes
  - **Responsibility**: the wizard itself — step rendering with hidden state, Back/Next/Generate/PDF transitions, rate-limit enforcement, error re-rendering, layout and accessibility wiring.
  - **Interface**: HTTP GET/POST on the etude path; uses the other modules.
  - **Tested**: no unit tests; covered by Playwright e2e. Rate-limit logic extracted and unit tested.

## Testing Decisions

- Good tests exercise external behaviour: given parameters, the generator produces structurally valid pieces (correct bar totals, allowed durations/pitches only, rests present but not dominating, repetition occurring with roughly expected frequency over many runs); the emitter produces LilyPond code containing the right notes and stem directions; the client maps HTTP outcomes to typed results; validation accepts valid input and rejects each invalid case with the right error.
- Randomness is injected so generator tests are deterministic.
- Unit tests (bun:test, in the `tests` directory): etude-generator, lilypond-emitter, lilypond-client, etude-validation, rate-limit logic.
- E2E tests (Playwright, in the `e2e-tests` directory): full wizard happy paths (single hand, both hands), Back navigation preserving state, validation error display, rate-limit message, and service-failure handling (service mocked or stubbed at the network boundary). Use the existing helpers in the e2e support folder and sign-in examples for authenticated sessions.

## Out of Scope

- Persisting generated pieces, parameter presets, or any user history — pieces are ephemeral.
- A teacher interface or any role other than the student.
- Sharing, printing directly from the browser, playback/audio, or MIDI export.
- Time signatures beyond 2/4, 3/4, 4/4, 6/8; durations beyond the six listed; tuplets, ties, dynamics, articulations, clef changes, and any notation beyond notes, rests, and stem directions.
- Chromatic (non-diatonic) pitch selection; minor-key variants (harmonic/melodic minor) — pitch sets are the key's diatonic notes.
- Changes to authentication, sign-up modes, or any existing non-etude routes.
- Client-side JavaScript: validation is via HTML attributes plus server-side checks; the wizard works without JS.

## Open Questions

None. All questions raised during the interview were resolved:

- Two-hand pieces use the piece-wide allowed note set (pitch classes × octaves), partitioned by a user-chosen split point into right hand (above) and left hand (below).
- The score's text alternative contains exactly the key, time signature, measures, hand(s), and selected pitches.
- LilyPond service errors carry only a generic user-safe message; internal details are logged by the service, and the server logs and displays the generic message.

## Further Notes

- The interval probability table and all algorithm constants (10% rest probability, 10% bar-repetition probability, 50% rhythm sharing, 50% whole-bar vs per-hand repetition) come directly from the project ideas document and the design interview; they are implementation constants, not user-configurable.
- The external LilyPond service is a separate web application whose contract is defined by this PRD; it does not exist yet and is not part of this PRD's implementation scope beyond the client module.
- The base app's conventions apply: redirects use the redirect helpers, elements for testing use kebab-case `data-testid` attributes named `name-action`, and no code ships without tests passing.
