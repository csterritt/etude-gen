# PRD: Etude Generator

## Problem Statement

As a piano student, I want to generate short, randomized etudes tailored to the
specific pitches, rhythms, and hand(s) I am currently practicing, so that I have
a steady supply of fresh sight-reading and technique material that stays within
the constraints I choose. Today there is no way to do this in the existing
application — the only authenticated page is a placeholder "Private Area" with no
music functionality. I have to either write exercises by hand or use generic
printed material that does not match the exact subset of notes and rhythms I am
working on.

## Solution

The placeholder `/private` page is replaced by an `/etude` page that walks the
signed-in student through a short multi-step form (measures/key/time
signature/hand, then pitches/durations/octaves, then an optional split point for
two-hand pieces, then a summary). Pressing **Generate** produces a randomly
composed piano piece that conforms to the chosen constraints, renders it as
engraved sheet music (via an external LilyPond service), and displays the score
inline on the page. The student can download a PDF of the same score, or go back
to any earlier step to adjust their selections and regenerate. Generation and
PDF export are each rate-limited to one per minute per user.

## User Stories

1. As a **student**, I want to sign in and land on the etude generation page, so
   that I can start creating practice material.
2. As a **student**, I want to choose the number of measures (4–32), so that the
   etude fits the time I have available.
3. As a **student**, I want to choose the musical key (up to four flats or
   sharps), so that the generated notes stay in a key I am practicing.
4. As a **student**, I want to choose the time signature (2/4, 3/4, 4/4, or
   6/8), so that the rhythms match what I am working on.
5. As a **student**, I want to choose which hand(s) to practice (left, right, or
   both), so that I can focus on one hand or practice coordination.
6. As a **student**, I want to select a subset of pitches from the chosen key, so
   that only the notes I am currently learning appear in the etude.
7. As a **student**, I want to select which note durations to allow (eighth,
   quarter, dotted quarter, half, dotted half, whole), so that the rhythms match
   my skill level.
8. As a **student**, I want to select one or more octaves (2–6), so that the
   etude stays in a comfortable range on the keyboard.
9. As a **student** generating a two-hand piece, I want to set a split point that
   divides my selected pitches between the left and right hand, so that each hand
   has its own range.
10. As a **student**, I want to see a summary of all my choices before
    generating, so that I can confirm everything is correct.
11. As a **student**, I want a **Back** button on every step, so that I can
    change an earlier choice without starting over.
12. As a **student**, I want to press **Generate** and see the engraved sheet
    music on the same page, so that I can read and play it immediately.
13. As a **student**, I want a **PDF** button on the result page, so that I can
    download and print the etude.
14. As a **student**, I want the result page to keep all my form choices, so that
    I can go back to the summary and tweak them without re-entering everything.
15. As a **student**, I want clear error messages when I submit invalid input, so
    that I can correct it and continue.
16. As a **student**, I want to be told when I am rate-limited (more than one
    generation or one PDF per minute), so that I understand why my request was
    not processed.
17. As a **student**, I want to be told when the sheet music engraving service
    fails, so that I know it is a temporary problem and can try again.
18. As a **student**, I want the form controls to be labeled and keyboard-
    navigable, so that I can use the page without a mouse.
19. As a **student**, I want validation errors to receive focus, so that my
    screen reader announces them immediately.
20. As a **student**, I want the generated score to have a text alternative
    describing the piece and listing the notes, so that I can understand it
    without seeing the engraving.
21. As a **student** using a single hand, I want the score to still show a grand
    staff, so that the layout is consistent and the empty staff is visible.
22. As a **student** using 6/8 time, I want the score to display 6/8 as the time
    signature, so that it matches what I selected.
23. As a **developer**, I want all errors logged with a correlation ID, so that I
    can diagnose failures without exposing PII or secrets.
24. As a **developer**, I want the external LilyPond service calls to time out
    after 30 seconds, so that a hung service does not tie up the worker.
25. As a **developer**, I want the returned SVG to be sanitized before
    embedding, so that the external service cannot inject unsafe content.
26. As a **student**, I want occasional repeated one-bar phrases in my etude, so
    that the music sounds musical rather than entirely random.
27. As a **student**, I want intervals between consecutive notes to follow a
    natural probability distribution, so that the melody is pleasant to play.
28. As a **student**, I want rests to appear occasionally, so that the etude
    exercises rhythmic variety.
29. As a **student**, I want the first note of the piece to be able to be a rest,
    so that the generation rules are consistent throughout.
30. As a **student**, I want consecutive rests to have different durations, so
    that the rhythm remains interesting.
31. As a **student**, when the engraving service fails, I want to be redirected
    back to the summary with an error message, so that I can retry without losing
    my choices.
32. As a **student**, when PDF generation fails, I want to be redirected back to
    the result page with an error message, so that I can retry the PDF without
    losing the displayed score.
33. As a **student**, I want the key signature shown on the score, so that I know
    what key I am playing in.
34. As a **student**, I want right-hand notes to have stems pointing up and
    left-hand notes to have stems pointing down, so that I can tell the hands
    apart visually.

## Implementation Decisions

### Routes

- The existing `/private` route is removed. A single `/etude` route (GET and
  POST) replaces it, protected by the existing `signedInAccess` middleware.
- The multi-step form is served by one GET (`/etude`) and one POST (`/etude`). A
  hidden `step` field drives a server-side step router that decides which step to
  render next. There are no separate per-step routes.
- Steps: `1` (measures/key/time/hand), `2` (pitches/durations/octaves), `split`
  (split point, only for two-hand), `summary` (recap + Generate), `generate`
  (produce the piece and render the result page), `pdf` (produce the PDF).
- **Back** buttons submit the current accumulated form data via POST to `/etude`
  with the `step` field set to the previous step. The server re-rendons that step
  with all prior choices pre-selected.
- The **Generate** action is a POST to `/etude` with `step=generate`. The result
  page is returned as the direct POST response (no PRG redirect, since the piece
  is ephemeral).
- The **PDF** action is a POST to `/etude` with `step=pdf`. The PDF is streamed
  back directly with `Content-Type: application/pdf`.
- The result page contains two forms: (a) the full choices form (hidden fields)
  with a **Back** button that posts `step=summary`, and (b) a separate form with
  the LilyPond code as a hidden field and the **PDF** button that posts
  `step=pdf`.

### Body limit

- The global body limit (1kb test / 4kb prod) is retained for all other routes.
  The `/etude` POST route gets a larger body limit (64kb) applied via a
  route-local `bodyLimit` middleware, because the result page carries the full
  LilyPond code as a hidden field.

### Validation

- Every step POST validates **all** accumulated fields (current step plus hidden
  fields from prior steps) using Valibot schemas, not just the current step's
  fields. This prevents tampering with hidden fields.
- Validation schemas are defined for each step's accumulated payload and for the
  final generate/pdf payloads.
- On validation failure, the user is redirected back to the current step with an
  error cookie (using the existing `redirectWithError` pattern).

### Random generation

- The generator accepts an injectable random source. In normal operation it uses
  `Math.random`. In test mode, a fake random source is injected via a test-only
  mechanism (a cookie or env flag, mirroring the existing clock-injection
  pattern in `time-access.ts`), enabling deterministic generation in tests.
- Interval probabilities are the fixed table from Ideas.md (half-steps 0–12,
  summing to 1.0).
- Interval direction is chosen to keep the next note within the current hand's
  range. If both up and down stay in range, direction is 50/50. If only one
  direction stays in range, that direction is used. If neither stays in range
  (range too small for the chosen interval), the interval is re-rolled until a
  valid one is found.
- 10% of notes after the first are rests. After a rest, the next note is chosen
  uniformly at random from the hand's range (not interval-based) and becomes the
  new baseline for subsequent interval computation.
- Consecutive rests are allowed only if they have different durations. Since
  durations are fixed by the chosen rhythm, if a note slot would be a rest with
  the same duration as the immediately preceding rest, it is forced to be a
  pitch chosen randomly from the range instead.
- The first note of the first bar may be a rest (per the same rules).
- Past the first bar, 20% of bars are duplicates of a uniformly random previous
  bar in the same hand.
- For two-hand pieces, the right hand is generated first. For the left hand,
  25% of the time the same rhythm as the right hand is reused; 75% of the time a
  new random rhythm is chosen. Left-hand pitch generation is independent of the
  right hand (no pitch-linking between hands).

### Pitch range and split point

- The full note range is the cartesian product of the user's selected pitch
  classes × selected octaves, yielding absolute notes (e.g. C4, D#5). Each note
  is represented internally as a pitch class plus an octave.
- For two-hand pieces, the split point is an index into the sorted list of all
  selected absolute notes. Notes at or below the index go to the left hand; notes
  above go to the right hand. The sorted order is by absolute pitch height
  (MIDI number).
- For single-hand pieces, the selected hand uses the entire range; the other
  hand's note array is empty.

### Time signatures and rhythms

- Rhythms are loaded from `Notes/all-rhythms.txt`, which contains rhythm
  patterns for 2/4, 3/4, and 4/4. The character encoding is: `W`=whole, `H`=half,
  `D`=dotted half, `Q`=quarter, `R`=dotted quarter, `E`=eighth.
- 6/8 reuses the 3/4 rhythm set. The score displays the user's chosen time
  signature (6/8) regardless of the underlying rhythm source.

### LilyPond rendering

- The internal Piece is converted to LilyPond code with: a grand staff (treble
  and bass clefs), the key signature, the time signature, and notes with stems
  up for the right hand and stems down for the left hand. No tempo marking.
- For single-hand pieces, the grand staff is still used; the unused hand's staff
  is rendered empty.

### External LilyPond service

- The server calls the external LilyPond service via HTTP POST with a JSON body
  `{ lilypond: string }` and a `Bearer` token.
- `POST /generate` on the external service returns `200` with JSON `{ svg:
  string }` on success, or a non-2xx status / error message on failure.
- `POST /pdf` on the external service returns `200` with a PDF body on success,
  or a non-2xx status / error message on failure.
- Calls time out after `LILYPOND_TIMEOUT_MS` (default 30000ms).
- On any failure (timeout, non-2xx, network error, error message), generation
  redirects back to the summary step with an error cookie; PDF failures redirect
  back to the result page with an error cookie.

### SVG sanitization

- The SVG returned by the external service is sanitized with DOMPurify (backed
  by jsdom) before being embedded in the page. This is a separate security
  boundary from the service client.

### Rate limiting

- A new `rate_limit` table stores per-user, per-action timestamps. Actions:
  `etude_generate` and `pdf_generate`, tracked separately.
- Each action is limited to one per minute (60 seconds). When a request arrives
  within the window, it is denied with a user-facing message indicating how many
  seconds remain.
- The rate-limit check uses the existing `getCurrentTime` helper so it respects
  the test-mode clock injection.

### Correlation IDs

- A per-request middleware generates a ULID and stores it in the Hono context.
  The existing `logInfo`/`logError`/`logWarn` helpers are extended to read the
  correlation ID from context and include it in every structured log line. No
  PII or secrets are logged.

### Environment variables

- `LILYPOND_SERVICE_URL` (secret) — base URL of the external LilyPond service.
- `LILYPOND_API_KEY` (secret) — bearer token for the external service.
- `LILYPOND_TIMEOUT_MS` (var, default 30000) — timeout for external service
  calls.

### Internal data structure

- The internal music representation is a JSON-serializable hierarchy:
  **Piece → Measures → Notes**.
  - **Piece**: key, time signature, measure count, hand selection, and an array
    of measures.
  - **Measure**: two arrays of notes — `rightHand` and `leftHand`. For
    single-hand pieces, the unused hand's array is empty.
  - **Note**: pitch class (or null for a rest), octave (or null for a rest), and
    a duration (one of the six supported values).
- The piece is ephemeral: it is not persisted to the database. It exists only in
  the hidden form fields on the result page and in memory during request
  processing.

### Accessibility

- All form controls have associated `<label>` elements and `aria-label` where
  needed.
- Validation errors are displayed inline and in the existing layout error alert;
  after an error redirect, focus moves to the error alert, then the user can tab
  to the first relevant field.
- On normal step renders, focus moves to the first input of the current step.
- The embedded score SVG has an `aria-label` summary (key, time signature, hand,
  measure count, "randomly generated etude") and a visually-hidden full note
  listing as its accessible alternative.
- The sanitized SVG must not introduce interactive or scripted content.

## Module Design

### Music Domain

- **Name**: music-domain
- **Responsibility**: encode and reason about pitches, keys, octaves, intervals,
  and note ranges. Convert between pitch names and absolute pitch heights; build
  the playable range from selected pitches × octaves; apply the split point to
  partition notes between hands; look up which pitches belong to a given key.
- **Interface**:
  - `pitchesForKey(key: Key): PitchClass[]`
  - `buildRange(pitches: PitchClass[], octaves: number[]): AbsoluteNote[]`
  - `splitRange(range: AbsoluteNote[], splitIndex: number): { left: AbsoluteNote[], right: AbsoluteNote[] }`
  - `intervalDistance(a: AbsoluteNote, b: AbsoluteNote): number`
  - `noteInDirection(from: AbsoluteNote, interval: number, direction: 'up' | 'down'): AbsoluteNote`
- **Tested**: yes

### Rhythm Library

- **Name**: rhythm-library
- **Responsibility**: load and parse `all-rhythms.txt`, map a time signature to
  its list of rhythm patterns (with 6/8 reusing the 3/4 set), and select a random
  rhythm for a given time signature.
- **Interface**:
  - `rhythmsForTimeSignature(ts: TimeSignature): Rhythm[]` (where `Rhythm` is an
    array of duration tokens)
  - `randomRhythm(ts: TimeSignature, random: RandomSource): Rhythm`
- **Tested**: yes

### Piece Generator

- **Name**: piece-generator
- **Responsibility**: given validated generation parameters and a random source,
  produce the internal `Piece` structure. Owns the entire generation algorithm:
  per-bar rhythm selection, 20% bar duplication, interval-based pitch selection
  with the fixed probability table, direction-within-range, 10% rests, the
  consecutive-rest-different-duration rule, post-rest random re-entry, and
  two-hand generation with 25/75 rhythm sharing.
- **Interface**:
  - `generatePiece(params: GenerationParams, random: RandomSource): Piece`
- **Tested**: yes

### LilyPond Renderer

- **Name**: lilypond-renderer
- **Responsibility**: convert an internal `Piece` into a LilyPond code string
  with grand staff, treble/bass clefs, key signature, time signature, and stems
  up (right) / down (left). Pure function with no I/O.
- **Interface**:
  - `renderLilyPond(piece: Piece): string`
- **Tested**: yes

### LilyPond Client

- **Name**: lilypond-client
- **Responsibility**: wrap the external LilyPond service. Send LilyPond code via
  authenticated HTTP POST to `/generate` (returns SVG) or `/pdf` (returns PDF
  bytes). Enforce the timeout and map non-2xx/network/timeout failures into
  typed errors. Mirrors the existing `email-service` pattern.
- **Interface**:
  - `generateSvg(env: Bindings, lilypondCode: string): Promise<Result<string, LilyPondError>>`
  - `generatePdf(env: Bindings, lilypondCode: string): Promise<Result<Uint8Array, LilyPondError>>`
- **Tested**: yes (with mocked `fetch`)

### SVG Sanitizer

- **Name**: svg-sanitizer
- **Responsibility**: sanitize an SVG string with DOMPurify (backed by jsdom)
  before it is embedded in a page. Strip scripts, event handlers, and unsafe
  external references while preserving the visual notation.
- **Interface**:
  - `sanitizeSvg(raw: string): string`
- **Tested**: yes (unit tests with known-bad and known-good SVG snippets)

### Rate Limiter

- **Name**: rate-limiter
- **Responsibility**: enforce per-user, per-action rate limits using the
  `rate_limit` table. Check and record the last-action timestamp; return whether
  the action is allowed and, if not, how many seconds remain.
- **Interface**:
  - `checkAndRecord(db: DrizzleClient, userId: string, action: RateLimitAction, now: Date): Promise<RateLimitResult>`
  - `RateLimitAction = 'etude_generate' | 'pdf_generate'`
  - `RateLimitResult = { allowed: boolean, remainingSeconds: number }`
- **Tested**: yes

### Correlation Middleware

- **Name**: correlation-middleware
- **Responsibility**: generate a ULID per request and store it in the Hono
  context so that logger helpers can include it in every structured log line.
- **Interface**: a Hono middleware that sets `c.set('correlationId', ulid())`.
  The logger helpers are extended to read it.
- **Tested**: yes (unit test that the middleware sets a value and the logger
  includes it)

## Testing Decisions

- **What makes a good test here**: tests should assert external behaviour and
  structural properties, not implementation details. For the generator, this
  means asserting measure counts, that every note lies within the selected
  range, that duplicated bars are exact copies, that the rest and interval rules
  are obeyed, and that a fixed random source produces a fixed piece. For the
  renderer, it means asserting the presence of clefs, key signature, time
  signature, and correct stem directions in the LilyPond output. For the client
  and rate limiter, it means asserting allow/deny and error-mapping behaviour
  with mocked dependencies.
- **Modules with unit tests** (in `tests/`, using `bun:test`): music-domain,
  rhythm-library, piece-generator, lilypond-renderer, lilypond-client,
  svg-sanitizer, rate-limiter, correlation-middleware.
- **E2E tests** (in `e2e-tests/`, using Playwright): cover the full happy path
  for both single-hand and two-hand pieces (sign in → complete all steps →
  generate → see score → generate PDF), back-button navigation between all steps
  and from the result page back to summary, validation errors at each step,
  rate-limit enforcement, and LilyPond service failure surfacing. Reference
  existing helpers in `e2e-tests/support` and patterns in `e2e-tests/sign-in`.
- **Prior art in the codebase**: `tests/validators.spec.ts` and
  `tests/time-access.spec.ts` for unit-test style; `src/lib/email-service.ts`
  for the external-API-client pattern to mirror in `lilypond-client`;
  `src/routes/auth/handle-sign-up.ts` for the form-handler and
  `redirectWithError` pattern; `src/db/schema.ts` for adding the `rate_limit`
  table.

## Out of Scope

- 6/8-specific rhythm generation beyond reusing the 3/4 set. Distinct 6/8
  rhythms are not generated.
- Tempo markings in the score.
- Audio playback or MIDI export of the generated piece.
- Saving, sharing, or listing previously generated etudes. Pieces are
  ephemeral.
- A teacher interface or multi-user collaboration. There is only the student
  view.
- Client-side JavaScript. All interactivity is server-rendered HTML with form
  POSTs, per the project's client-side code rules.
- Custom time signatures beyond 2/4, 3/4, 4/4, and 6/8.
- Durations beyond the six supported (eighth, quarter, dotted quarter, half,
  dotted half, whole).
- Octaves outside 2–6.
- Keys with more than four flats or sharps.
- Rests longer than a whole note or other advanced notation.

## Open Questions

- **Rate-limit table schema details** (owner: developer). Suggested resolution:
  a `rate_limit` table with columns `id` (text PK, ULID), `userId` (text, FK to
  `user.id` with cascade delete), `action` (text), `lastAt` (integer timestamp),
  and a unique index on `(userId, action)`. Confirm during implementation.
- **Exact LilyPond input format for the external service** (owner: developer).
  The JSON body field name (`lilypond` vs `code` vs `source`) and any required
  metadata fields must be confirmed against the external service's actual API.
  Suggested resolution: confirm by reading the external service's docs or source
  before wiring up the client.
- **Test-mode random injection mechanism** (owner: developer). Whether to use a
  cookie (like the clock delta) or an env flag. Suggested resolution: mirror the
  clock-injection cookie pattern for consistency, with a `random-seed` cookie
  that seeds a PRNG used only in non-production mode.

## Further Notes

- The `generate-rhythms.ts` script already exists and produces the rhythms in
  `all-rhythms.txt`. No changes to it are needed for this PRD; 6/8 is handled by
  reuse, not by new generation.
- The existing `STANDARD_SECURE_HEADERS` CSP allows `imgSrc: ["'self'", "data:"]`.
  Inline SVG (embedded directly in the DOM, not via `<img>`) is not affected by
  `imgSrc`, but the CSP `scriptSrc` and `objectSrc` directives ensure the
  sanitized SVG cannot run scripts. This should be verified during
  implementation.
- The result page embeds the SVG inline (not as an `<img>` src) so that it
  scales with the page and is accessible to assistive technology via the
  surrounding labeled container.
- All new code follows the project's TypeScript rules (arrow functions, types,
  braces on all `if`/`while` bodies) and the red-green-refactor TDD cycle
  mandated in `AGENTS.md`.
