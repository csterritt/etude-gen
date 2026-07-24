# PRD: Etude Generator

## Problem Statement

Piano students and teachers need practice material tailored to specific skill levels and musical parameters. Currently, finding etudes that target particular keys, rhythms, articulations, or hand techniques requires searching through published books that may not match the exact combination needed. There is no easy way to generate custom piano exercises that combine specific notes, durations, dynamics, and hand patterns in a single piece.

## Solution

A web application where authenticated users can configure musical parameters via a form and generate custom piano etudes. The generated etude is displayed as sheet music (rendered by LilyPond) and can be played as audio (MIDI synthesized in the browser). Each generation is saved to the user's history, where they can revisit, play, or delete past pieces. The generator produces musically coherent results with repeated phrases, arpeggios, scale runs, and weighted interval probabilities — not just random notes.

## User Stories

### Authentication & Access

1. As a `piano student`, I want to `sign in to the application`, so that `I can access the etude generator`.
2. As a `piano teacher`, I want to `sign in to the application`, so that `I can generate custom etudes for my students`.
3. As an `unauthenticated visitor`, I want to `be redirected to the sign-in page when I try to access the etude generator`, so that `only authorized users can use the tool`.
4. As a `signed-in user`, I want to `see my name in the navbar with a sign-out option`, so that `I know I'm authenticated and can securely exit`.

### Form & Parameter Selection

5. As a `user`, I want to `select a key from common major and minor keys (up to 4 sharps/flats)`, so that `the generated music is in a key I want to practice`.
6. As a `user`, I want to `select a time signature from common options (2/4, 3/4, 4/4, 6/8)`, so that `the generated music has the meter I need`.
7. As a `user`, I want to `select the number of measures via a slider from 4 to 64`, so that `I control the length of the etude`.
8. As a `user`, I want to `set the tempo via a slider from 40 to 200 BPM`, so that `the etude is at a speed I can practice`.
9. As a `user`, I want to `select which notes from the key to include via a checklist`, so that `I can restrict the note pool to specific pitches`.
10. As a `user`, I want to `optionally add chromatic notes outside the key via the checklist`, so that `I can practice accidentals`.
11. As a `user`, I want to `select which durations to include via checkboxes (whole, half, quarter, eighth, sixteenth, dotted half, dotted quarter, dotted eighth)`, so that `I control the rhythmic complexity`.
12. As a `user`, I want to `select which articulations to include via checkboxes (staccato, legato, accent, tenuto)`, so that `I can practice specific techniques`.
13. As a `user`, I want to `toggle ties on or off`, so that `I can practice sustained notes across beats`.
14. As a `user`, I want to `toggle slurs on or off`, so that `I can practice phrasing`.
15. As a `user`, I want to `select which dynamics to include via checkboxes (pp, p, mp, mf, f, ff)`, so that `I can practice dynamic control`.
16. As a `user`, I want to `select which hand(s) to use (left, right, both)`, so that `I can target specific hand technique`.
17. As a `user`, when I select `both hands`, I want to `choose between simultaneous or alternating mode`, so that `I control how the hands interact`.
18. As a `user`, when I select `both hands` and `simultaneous`, I want to `choose between shared or independent rhythm`, so that `I control rhythmic coordination`.
19. As a `user`, when I select `both hands` and `alternating`, I want to `select alternation modes via checkboxes (per measure random, per half measure random, per note random)`, so that `I control the alternation granularity`.
20. As a `user`, I want to `toggle whether jumps bigger than an octave are allowed`, so that `I can restrict large leaps`.
21. As a `user`, I want to `select a min and max octave from dropdowns (octaves 1-7)`, so that `the generated music stays within a playable range`.
22. As a `user`, I want to `select which pattern types to include via checkboxes (arpeggios, repeated phrases, scale runs, random melodic)`, so that `I control the musical texture`.
23. As a `user`, I want to `select a style preset (Beginner, Intermediate, Advanced, Free)`, so that `I can quickly configure parameters for my skill level`.
24. As a `user`, when I select `a style preset and submit`, I want to `see all checkboxes update to reflect the preset's configuration`, so that `I can see and modify what the preset selected`.
25. As a `user`, I want to `see sensible defaults pre-selected on the form when I first load the page`, so that `I can generate music immediately without configuring everything`.

### Style Presets

26. As a `beginner student`, I want to `select the Beginner preset`, so that `the form configures simple rhythms (quarter, half), no accidentals, no jumps >octave, staccato/legato only, and p-mf dynamics`.
27. As an `intermediate student`, I want to `select the Intermediate preset`, so that `the form adds eighth notes, dotted rhythms, optional accidentals, and all dynamics`.
28. As an `advanced student`, I want to `select the Advanced preset`, so that `the form adds sixteenth notes, all patterns, and optional jumps >octave`.
29. As a `user`, I want to `select the Free preset`, so that `everything is selectable and nothing is pre-constrained`.

### Generation & Display

30. As a `user`, I want to `click a Generate button on the form`, so that `music is generated from my selected parameters`.
31. As a `user`, after clicking `Generate`, I want to `see the form retain the same values I submitted`, so that `I can tweak parameters and regenerate without reconfiguring`.
32. As a `user`, after clicking `Generate`, I want to `see the generated sheet music displayed below the form`, so that `I can read and play the etude`.
33. As a `user`, I want to `see right-hand notes in the treble clef with stems pointing up`, so that `the sheet music follows standard piano notation`.
34. As a `user`, I want to `see left-hand notes in the bass clef with stems pointing down`, so that `the sheet music follows standard piano notation`.
35. As a `user`, I want to `see notes in the treble clef range from middle C upward`, so that `right-hand notes are notated correctly`.
36. As a `user`, I want to `see notes in the bass clef range from middle C downward`, so that `left-hand notes are notated correctly`.
37. As a `user`, when `both hands play middle C simultaneously`, I want to `see middle C assigned to the hand whose last note was closer to middle C (or randomly if equidistant)`, so that `the notation is unambiguous`.

### Audio Playback

38. As a `user`, I want to `see a Play button appear only after music is generated`, so that `I know audio is available`.
39. As a `user`, I want to `click the Play button to hear the generated music`, so that `I can listen to the etude before practicing`.
40. As a `user`, I want to `click a Pause button to pause playback`, so that `I can stop and resume listening`.
41. As a `user`, I want to `click a Stop button to stop playback`, so that `I can reset the audio to the beginning`.
42. As a `user`, I want to `hear the audio at the tempo I selected`, so that `playback matches the intended speed`.

### History

43. As a `user`, I want to `navigate to a history page`, so that `I can see my previously generated pieces`.
44. As a `user`, I want to `see my past pieces listed 20 per page, newest first`, so that `I can browse my recent generations`.
45. As a `user`, I want to `see the date, key, time signature, and number of measures for each past piece`, so that `I can identify pieces without opening them`.
46. As a `user`, I want to `click a past piece to view it`, so that `I can see the sheet music and play the audio again`.
47. As a `user`, when viewing `a past piece`, I want to `see the form pre-filled with that piece's parameters`, so that `I can regenerate with similar settings`.
48. As a `user`, I want to `navigate history pages via URL query parameters`, so that `I can bookmark a specific page`.
49. As a `user`, I want to `delete a past piece`, so that `I can remove pieces I no longer need`.
50. As a `user`, I want to `see a confirmation page before deleting a piece`, so that `I don't accidentally delete something I want to keep`.
51. As a `user`, after `confirming deletion`, I want to `be redirected to the history page with a success message`, so that `I know the piece was deleted`.

### Failure Modes

52. As a `user`, when the `LilyPond service is unavailable or times out`, I want to `see a user-friendly error message saying the sheet music could not be generated`, so that `I understand what went wrong and can try again`.
53. As a `user`, when the `LilyPond service returns an error after retries`, I want to `see the error message on the page with the form values preserved`, so that `I can retry without reconfiguring`.
54. As a `user`, when I `submit the form with no notes selected`, I want to `see an inline error message`, so that `I know I need to select at least one note`.
55. As a `user`, when I `submit the form with no durations selected`, I want to `see an inline error message`, so that `I know I need to select at least one duration`.
56. As a `user`, when I `submit the form with no hand selected`, I want to `see an inline error message`, so that `I know I need to select at least one hand`.
57. As a `user`, when I `try to view a piece that doesn't exist or belongs to another user`, I want to `see a 404 or error page`, so that `I can't access other users' pieces`.
58. As a `user`, when I `try to access media for a piece that doesn't exist or belongs to another user`, I want to `receive a 404 response`, so that `media access is protected`.
59. As a `user`, when the `form body exceeds the size limit`, I want to `see a friendly overflow message`, so that `I understand the form is too large`.

### Edge Cases

60. As a `user`, when `only one note is selected`, I want to `the generator to produce music using only that note pitch at different octaves`, so that `the etude is still musically valid`.
61. As a `user`, when `both hands are selected in simultaneous mode with shared rhythm`, I want to `both hands to use the same durations per measure but different notes`, so that `the music is coordinated but not identical`.
62. As a `user`, when `both hands are selected in simultaneous mode with independent rhythm`, I want to `each hand to have its own durations`, so that `the music has rhythmic independence`.
63. As a `user`, when `both hands are selected in alternating mode with multiple alternation modes checked`, I want to `each note/measure to have equal probability of using any selected mode`, so that `the alternation is varied throughout`.
64. As a `user`, when `a note's duration would exceed the remaining beats in a measure`, I want to `the note to be shortened 80% of the time or tied across the barline 20% of the time`, so that `measures always sum correctly`.
65. As a `user`, when `jumps bigger than an octave are disabled`, I want to `no interval larger than an octave to appear`, so that `the etude stays within comfortable hand reach`.
66. As a `user`, when `jumps bigger than an octave are enabled`, I want to `intervals larger than an octave to follow the inverse-proportional probability curve`, so that `large leaps are possible but uncommon`.

## Implementation Decisions

### Architecture

- The etude generator replaces the existing `/private` route with `/etude`. The `/private` route is removed.
- All etude routes require authentication via the existing `signedInAccess` middleware.
- Form submission is traditional POST (full page reload). No AJAX for form submission.
- Client-side JavaScript is permitted only for the Audio Player module (Tone.js playback). Explicit permission granted for this scope only.
- The external LilyPond service is a separate project. This PRD defines only the API contract the Worker expects.

### External LilyPond Service API Contract

- **Endpoint**: `POST /render`
- **Request**: `{ "lilypondText": "string", "options": { "format": "svg+midi" } }`
- **Response**: `{ "svg": "string", "midi": "base64string" }`
- **Auth**: `Authorization: Bearer <LILYPOND_API_KEY>`
- **Errors**: 400 (invalid LilyPond text), 500 (rendering error), 503 (service unavailable)
- **Retry**: Worker retries using existing `async-retry` pattern with `STANDARD_RETRY_OPTIONS`. On final failure, user-friendly error shown on page with form values preserved. LilyPond text is stored in D1 so it can be re-rendered later.

### Storage

- **R2 bucket**: `etude-gen-storage` binding added to `wrangler.jsonc`. Objects stored with keys `{userId}/{pieceId}.svg` and `{userId}/{pieceId}.mid`.
- **D1 schema**: New `etude` table with columns: `id` (text PK), `userId` (text, FK to user), `params` (text, JSON), `svgR2Key` (text), `midiR2Key` (text), `lilypondText` (text), `createdAt` (integer timestamp).
- Both SVG and MIDI stored in R2 permanently. D1 record stores a minimal record (user ID, params JSON, R2 keys, LilyPond text, timestamp). Full internal music representation is NOT stored in D1.

### Serving R2 Objects

- Dedicated Worker route: `GET /etude/media/:pieceId/:type` (type = `svg` or `midi`).
- Worker reads from R2, sets appropriate Content-Type (`image/svg+xml` or `audio/midi`), returns content.
- Auth check: only the piece's owner can access media. Non-owners get 404.

### Body Limit

- Global body limit increased to 16kb (test) / 8kb (production) to accommodate the etude form's many checkboxes.

### Content Security Policy

- New etude-specific CSP configuration created (not reusing `ALLOW_SCRIPTS_SECURE_HEADERS`).
- CSP allows `allow-same-origin`, `allow-scripts`, `allow-forms` in sandbox.
- `scriptSrc` includes `'self'` only (Tone.js bundled locally in `public/`).
- `mediaSrc` includes `'self'` (R2 served through Worker, same-origin).
- Tone.js is downloaded and served from the `public/` directory. No CDN dependencies.

### Environment Variables

- `LILYPOND_SERVICE_URL` (secret) — base URL of the external LilyPond service.
- `LILYPOND_API_KEY` (secret) — bearer token for the external service.
- `LILYPOND_TIMEOUT_MS` (var, default 30000) — timeout for external service calls.

### Music Generation Algorithm

- **Interval probability**: Inversely proportional to interval size. An octave jump is 3x less likely than a unison. Other intervals scaled linearly between these two points. Applied to melodic intervals within a single hand's line, after constraining to selected notes.
- **Jumps >octave toggle**: When off, no interval larger than an octave is generated (hard disable). When on, all intervals follow the probability curve.
- **Measure filling**: Fill left-to-right. If a note's duration would exceed remaining beats, 80% chance shorten to fit, 20% chance tie across barline.
- **Pattern types**: Arpeggios, repeated phrases, scale runs, random melodic. When multiple selected, each measure has equal probability of using any selected pattern. Patterns are independent per hand in simultaneous mode.
- **Both hands simultaneous**: User chooses shared rhythm (same durations per measure) or independent rhythm (different durations). Patterns always independent per hand.
- **Both hands alternating**: User selects alternation modes (per measure random, per half measure random, per note random). Multiple modes can be selected. Each note/measure has equal probability of using any selected mode (weighted throughout).
- **Middle C assignment**: When both hands could claim middle C, assign to the hand whose last note was closer to middle C. If equidistant, pick randomly.
- **Generator guarantee**: The generator always produces a valid result. If complex patterns fail, it falls back to simple quarter notes. No error state.
- **Octave range**: User selects min and max octave (1-7). Left hand gravitates toward lower end, right hand toward upper end. Generator stays within the selected range.

### Internal Music Representation

- JSON-serializable hierarchical structure: Piece → Measures → Notes.
- Piece contains metadata (key, time signature, tempo) and an array of measures.
- Each measure contains notes. Each note has: pitches (array for chords, empty for rests), duration, articulation, dynamics, hand, and tie/slur info.
- Rests represented as notes with empty pitches array.
- Chords represented as notes with multiple pitches.
- Converters transform this representation to LilyPond text and the external service produces MIDI from the LilyPond text.

### Form Behavior

- Sensible defaults pre-selected on page load (all notes in key, quarter note duration, right hand, etc.).
- Server validates all parameters as safety net. Inline errors shown if required fields missing (at least one note, one duration, one hand).
- Style preset selection submits the form (GET with preset param). Server pre-fills all checkboxes based on the preset. No client-side JS for preset selection.
- Form values preserved after POST using `value` attribute (not `defaultValue`) per project conventions.

### History

- `GET /etude/history` — paginated list, 20 per page, newest first. URL-based pagination via `?page=N` query param.
- List shows date, key, time signature, number of measures per piece. No thumbnails.
- `GET /etude/:pieceId` — view past piece. Same layout as generation view (form at top with params pre-filled, sheet music below, play button).
- `GET /etude/delete-confirm/:pieceId` — confirmation page (follows existing profile delete-confirm pattern).
- `POST /etude/delete/:pieceId` — deletes D1 record and both R2 objects (SVG + MIDI). Redirects to history with success message.

### Style Presets

- **Beginner**: Simple rhythms (quarter, half), no accidentals, no jumps >octave, staccato/legato only, p-mf dynamics.
- **Intermediate**: Adds eighth notes, dotted rhythms, accidentals optional, all dynamics.
- **Advanced**: Adds sixteenth notes, all patterns, jumps >octave optional.
- **Free**: Everything selectable, nothing pre-constrained.

### Keys Available

- Major: C, G, D, A, E, F, Bb, Eb, Ab
- Minor: a, e, b, f#, c#, d, g, c, f (relative minors of the above)
- Time signatures: 2/4, 3/4, 4/4, 6/8

## Module Design

### Music Theory

- **Name**: `music-theory`
- **Responsibility**: Key signatures, scales, note naming, interval calculations, pitch-to-octave mapping
- **Interface**: Pure functions. Input: key name, note names. Output: scale notes, interval sizes, pitch classes, octave assignments. No I/O, no side effects.
- **Tested**: Yes

### Music Generator

- **Name**: `music-generator`
- **Responsibility**: Takes generation parameters, produces internal music representation (Piece → Measures → Notes). Implements weighted probability, pattern selection, measure filling, hand assignment, and middle C resolution algorithms.
- **Interface**: Input: `GenerationParameters` object. Output: `Piece` object (JSON-serializable). Always succeeds — falls back to simple quarter notes if complex patterns fail. No I/O.
- **Tested**: Yes

### LilyPond Converter

- **Name**: `lilypond-converter`
- **Responsibility**: Converts internal music representation to LilyPond text. Handles clef assignment (treble for right hand down to middle C, bass for left hand up to middle C), stem direction (up in treble, down in bass), dynamics, articulation, ties, slurs.
- **Interface**: Input: `Piece` object. Output: LilyPond text string. No I/O.
- **Tested**: Yes

### LilyPond Service Client

- **Name**: `lilypond-service-client`
- **Responsibility**: Sends LilyPond text to external service, receives SVG + MIDI. Handles auth (bearer token), retries (async-retry), timeouts.
- **Interface**: Input: LilyPond text string, env bindings. Output: Result type — success returns `{ svg: string, midi: Uint8Array }`, failure returns error description. Uses `true-myth` Result type.
- **Tested**: Yes

### R2 Storage

- **Name**: `r2-storage`
- **Responsibility**: Stores and retrieves SVG, MIDI objects in R2. Generates keys (`{userId}/{pieceId}.svg`, `{userId}/{pieceId}.mid`). Handles uploads and deletes.
- **Interface**: Input: R2 bucket binding, userId, pieceId, content. Output: R2 key string on store, content on retrieve, void on delete.
- **Tested**: Yes

### Etude D1 Access

- **Name**: `etude-db-access`
- **Responsibility**: CRUD operations for etude records in D1. Stores user ID, params JSON, R2 keys, LilyPond text, timestamp. Supports paginated queries by user.
- **Interface**: Input: Drizzle client, userId, piece data. Output: etude records, pagination metadata. Uses existing Drizzle patterns.
- **Tested**: Yes

### Etude Routes

- **Name**: `etude-routes`
- **Responsibility**: All HTTP routes for the etude feature. GET /etude (form + results), POST /etude (generate), GET /etude/history (paginated list), GET /etude/media/:pieceId/:type (serve R2), GET /etude/:pieceId (view past piece), GET /etude/delete-confirm/:pieceId (confirmation), POST /etude/delete/:pieceId (delete handler).
- **Interface**: Hono route builders following existing `build-*` pattern. Uses `signedInAccess` middleware. Uses `useLayout` for page rendering. Uses `redirectWithMessage` / `redirectWithError` for redirects.
- **Tested**: Yes (e2e)

### Etude Form

- **Name**: `etude-form`
- **Responsibility**: Renders the generation form with all parameters. Preserves values after POST. Handles preset selection (server-side). Shows inline validation errors.
- **Interface**: TSX component. Input: current form values (or defaults), preset selection, validation errors. Output: HTML form with all controls. Uses DaisyUI components. Uses `data-testid` attributes per project conventions.
- **Tested**: Yes (e2e)

### Audio Player

- **Name**: `audio-player`
- **Responsibility**: Client-side JS module for Tone.js playback. Fetches MIDI from R2 URL. Provides Play, Pause, Stop controls.
- **Interface**: Inline script in page. Reads MIDI URL from data attribute. Uses Tone.js bundled in `public/`. No server-side interface.
- **Tested**: No

## Testing Decisions

- **Good test criteria**: Tests should verify external behavior, not implementation details. For the music generator, test that measures sum correctly, that intervals respect the probability constraints, that patterns produce expected structures. For the LilyPond converter, test that output contains expected LilyPond syntax for given inputs. For routes, test full user flows via Playwright.
- **Modules with tests**:
  - Music Theory — unit tests (bun:test) verifying scales, intervals, note naming
  - Music Generator — unit tests (bun:test) verifying measure filling, probability distribution, pattern generation, hand assignment, middle C resolution
  - LilyPond Converter — unit tests (bun:test) verifying correct LilyPond output for various inputs (chords, rests, ties, slurs, dynamics, articulations, clef assignment)
  - LilyPond Service Client — unit tests (bun:test) with mocked fetch, testing retry behavior and failure handling
  - R2 Storage — unit tests (bun:test) with mocked R2 binding, testing key generation, upload, retrieve, delete
  - Etude D1 Access — unit tests (bun:test) with mocked Drizzle, testing CRUD and pagination
  - Etude Routes — e2e tests (Playwright) testing full user flows: form submission, generation, history, viewing past pieces, deletion
  - Etude Form — e2e tests (Playwright) testing form rendering, value preservation, preset selection, validation errors
- **Prior art in codebase**:
  - Unit tests follow patterns in `tests/` directory (bun:test, spec files)
  - E2e tests follow patterns in `e2e-tests/` directory (Playwright, support helpers in `e2e-tests/support/`)
  - Test helpers in `e2e-tests/support/` for auth, navigation, form filling
  - Test data patterns in `e2e-tests/support/test-data.ts`

## Out of Scope

1. The external LilyPond service itself — built as a separate project with its own PRD
2. User accounts and authentication — already implemented, no changes needed
3. Sharing generated pieces with other users — no social or sharing features
4. Exporting to PDF or MusicXML — only SVG sheet music and MIDI audio
5. Editing generated music after generation — no interactive score editor
6. Multiple instruments — piano only, two staves (treble and bass clef)
7. Mobile-specific UI — responsive layout via DaisyUI/Tailwind, but not mobile-first or native mobile
8. Real-time collaboration — single-user only

## Open Questions

1. **R2 bucket creation** — Owner: user. The R2 bucket `etude-gen-storage` needs to be created via Cloudflare dashboard or wrangler CLI before the app can store objects. Resolution: create during implementation setup.
2. **Tone.js version and bundling** — Owner: user. The exact version of Tone.js to bundle in `public/` needs to be determined. Resolution: use latest stable release at implementation time, download minified build.
3. **LilyPond service deployment** — Owner: user. The external LilyPond service needs to be built and deployed before the etude generator can produce sheet music. The Worker code should handle the service being unavailable gracefully. Resolution: build the service as a separate project, use mock for development/testing.
4. **D1 migration for etude table** — Owner: developer. A Drizzle migration needs to be created for the new `etude` table. Resolution: use `drizzle-kit` to generate the migration during implementation.

## Further Notes

- The existing `/private` route is replaced by `/etude`. The `buildPrivate` function and its route registration in `src/index.ts` should be removed. The `buildRoot` function (development-only) may need updating to link to `/etude` instead of `/private`.
- The `PATHS` constant in `src/constants.ts` needs new entries for etude routes (ETUDE, ETUDE_HISTORY, ETUDE_MEDIA, ETUDE_DELETE_CONFIRM, ETUDE_DELETE).
- The `signedInAccess` middleware is reused for all etude routes — no new auth middleware needed.
- The `useLayout` function in `build-layout.tsx` is reused for all etude pages. The navbar should link to `/etude` instead of `/private` for signed-in users.
- The `renderer.tsx` may need a title update from "Worker, D1, Drizzle" to something like "Etude Generator".
- The existing `bodyLimit` in `src/index.ts` needs to be updated from 1kb/4kb to 16kb/8kb.
- The `validateEnvironmentVariables` function in `src/index.ts` needs to add `LILYPOND_SERVICE_URL` and `LILYPOND_API_KEY` to the required vars list. `LILYPOND_TIMEOUT_MS` is optional with a default.
- The `.dev.vars` file needs the new LilyPond environment variables added for local development.
- The `wrangler.jsonc` needs the R2 bucket binding added: `{ "binding": "ETUDE_STORAGE", "bucket_name": "etude-gen-storage" }`.
