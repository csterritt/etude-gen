# PRD: Etude Generator

## Problem Statement

Piano students need a simple way to create short, playable practice pieces tailored to the notes, rhythms, key, register, length, and hand or hands they want to practice. The current authenticated application provides account and profile functionality but no music-generation workflow. Students cannot progressively choose constraints, review them, generate a repeatable score, correct selections, or download the same music as a PDF.

The desired experience must make musically valid choices understandable, preserve one current workflow across visits, produce material that is varied without sounding uniformly random, and remain usable when validation, storage, or the external engraving service fails. It must also keep each student's work private, accessible, and isolated from concurrent or stale submissions.

## Solution

Signed-in students will use a guided, server-rendered workflow to configure and generate one current piano etude. The workflow will provide practical defaults, expose only supported musical choices, retain progress across sessions, and present earlier answers as read-only summaries. Students can move back to revise choices, review the complete configuration, generate an etude, retry engraving without changing the music when rendering fails, download the same Piece as a PDF, or clear everything and start over.

A completed etude will remain the same across refreshes and PDF download, while revised settings will never be shown beside stale music. If score rendering fails, the student can retry without changing the generated notes. The score page will include the selected settings, conventional piano notation, and an equivalent structured textual description. The student can securely download that same etude through a one-use temporary PDF link or clear the current work and begin again.

## User Stories

1. As a piano student, I want to sign in before using the etude generator, so that my workflow and generated music remain private.
2. As a signed-out visitor, I want an explanation and a path to sign in when I request an etude page, so that I understand why access was denied.
3. As a student, I want the application to resume my one current workflow when I return, so that I do not lose progress.
4. As a student beginning a new workflow, I want sensible initial settings, so that I can generate a useful etude quickly.
5. As a student, I want to choose between 4 and 32 measures, so that the etude has an appropriate practice length.
6. As a student, I want to choose 2/4, 3/4, or 4/4, so that I can practice the desired meter.
7. As a student, I want to choose a supported major or natural-minor key with no more than four sharps or flats, so that the etude fits my current key-signature practice.
8. As a student, I want pitches spelled according to the selected key signature, so that the notation uses conventional note names rather than enharmonic duplicates.
9. As a student, I want to select one or more keyboard scale ranges identified by octaves 2 through 6, so that the available register matches my practice goal.
10. As a student, I want non-adjacent octave selections interpreted as one continuous range, so that all scale ranges between the lowest and highest selection are included.
11. As a student, I want C7 to be the only possible octave-7 pitch and to appear only when C natural belongs to the selected key and falls within the expanded range, so that the upper boundary is predictable.
12. As a student, I want to choose left hand, right hand, or both hands, so that the etude targets the intended coordination skill.
13. As a student, I want all available key pitches selected by default on the notes step, so that the default produces a complete scale-based exercise.
14. As a student, I want to select one or more available pitches for one-hand mode and at least two for two-hand mode, so that I can narrow the exercise while leaving a playable pitch range for each selected hand.
15. As a student, I want a Select all control, so that restoring the full pitch set is quick.
16. As a screen-reader or keyboard user, I want focus moved to the score heading after successful generation or rendering retry, so that I can reach the result without navigating again from the top of the page.
17. As a student, I want compatible durations selected by default, so that the initial rhythm selection is usable.
18. As a student, I want to choose among eighth, quarter, half, whole, dotted-half, and dotted-quarter notes when they can fit the selected meter, so that I can target rhythmic skills.
19. As a student, I want the duration controls to prevent a selection that cannot form any complete measure, so that I do not reach review with an impossible rhythm set.
20. As a student without client-side scripting, I want the server to reject an impossible rhythm set with corrective guidance, so that validation remains authoritative.
21. As a student generating for both hands, I want to choose a boundary between adjacent selected pitches, so that at least one pitch belongs to each hand.
22. As a student generating for one hand, I do not want to see an irrelevant split step, so that the workflow stays concise.
23. As a student, I want prior answers shown as read-only summaries on later steps, so that I can understand the current configuration without accidentally editing multiple steps at once.
24. As a student, I want a Back link on each later step, so that I can return to the canonical prior step without saving unsaved edits on the current page.
25. As a student, I want a direct request for an unavailable later step redirected to the earliest incomplete step, so that I can recover from stale bookmarks or manually entered URLs.
26. As a student, I want upstream changes to clear dependent downstream choices, so that old notes, durations, or split boundaries cannot silently become invalid.
27. As a student, I want to review every selection before generation, so that I can approve the complete configuration.
28. As a student, I want invalid input redisplayed on the same step with safe submitted values preserved, so that correction does not require re-entering the entire form.
29. As a keyboard or screen-reader user, I want an error summary linked to field-level errors and focused after an invalid submission, so that I can find and correct problems efficiently.
30. As a student, I want every form control to have an accessible label and native HTML constraints, so that the workflow is understandable and benefits from browser validation.
31. As a student, I want Generate to create a new immutable Piece from my approved settings, so that the resulting score exactly reflects those settings.
32. As a student, I want occasional exact one-measure repetitions, so that the etude contains recognizable phrases rather than uniform randomness.
33. As a student, I want melodic movement selected with the specified interval weights, so that small and moderate movements occur with controlled likelihood.
34. As a student, I want rests to occur occasionally without unrestricted identical consecutive rests, so that the rhythm varies while remaining intentional.
35. As a student, I want two-hand etudes sometimes to share rhythmic structure while retaining independently selected pitches, so that the hands sometimes coordinate without always moving identically.
36. As a student, I want right-hand notes on a treble staff with upward stems and left-hand notes on a bass staff with downward stems, so that hand assignment is visually clear.
37. As a student generating one hand, I want the score to remain on a grand staff with the unused staff showing the key and time signatures but no notes or rests, so that all generated scores use a consistent piano layout.
38. As a student, I want the score to show the selected key and time signature, so that it is ready for practice.
39. As a student, I want the generated page to repeat my complete settings above the score, so that I can connect the result to its constraints.
40. As a student using assistive technology, I want a structured measure-by-measure text equivalent listing each hand's notes, rests, and durations, so that the generated music has useful nonvisual content.
41. As a student, I want the embedded SVG to contain no unsafe or inaccessible interactive content, so that viewing a score does not compromise security or navigation.
42. As a student, I want a refresh to show the same stored Piece and SVG rather than generating different music, so that the result is stable.
43. As a student, I want changing a parameter after generation to hide the old score while retaining it internally until replacement, so that stale music is never mistaken for the revised configuration.
44. As a student, I want creating a replacement Piece to revoke and clean up the superseded SVG immediately, so that old artifacts do not accumulate or remain reachable.
45. As a student, I want a rendering failure to preserve the newly generated Piece and offer an explicit Retry rendering action, so that retrying does not change the music.
46. As a student, I want malformed, oversized, mistyped, timed-out, or unsafe service output handled as a retryable rendering failure, so that bad external output is never embedded.
47. As a student, I want unexpected errors to show a safe message and correlation identifier, so that I can report the problem without seeing sensitive technical details.
48. As a student, I want no more than one new Piece generation in flight at a time, so that concurrent requests cannot overwrite each other unpredictably.
49. As a student, I want a successful etude generation limited to one per minute, so that the service is protected from repeated expensive work.
50. As a student, I want failed generation or rendering attempts not to consume the success cooldown, so that service problems do not unnecessarily block recovery.
51. As a student, I want an expired in-flight lock to recover after one minute, so that a crashed request does not block me permanently.
52. As a student, I want stale submissions from another tab rejected with the currently saved state shown, so that older forms cannot overwrite newer decisions.
53. As a student, I want a PDF generated from the exact stored Piece displayed as SVG, so that the download and web score contain the same music.
54. As a student, I want PDF generation independently limited to one successful result per minute, so that I can create a PDF immediately after generating an SVG while repeated PDF work remains controlled.
55. As a student, I want failed PDF attempts not to consume the PDF cooldown, so that I can recover from service or storage failures.
56. As a student, I want a successful PDF delivered after a server redirect as an attachment named `etude-<piece-short-id>.pdf`, so that form submission follows POST-redirect-to-GET with a predictable safe filename and without exposing the object publicly.
57. As a student, I want the temporary PDF download to remain available for 15 minutes and permit one download, so that the immediate download can complete without creating lasting storage.
58. As a student, I want an expired, consumed, or missing PDF download redirected to my score with an actionable safe error, so that I can recover within the normal workflow.
59. As a student, I want Start a new piece to clear all current parameters, Piece data, score artifacts, operation state, and download grants, so that I can begin from clean defaults.
60. As a student, I want my etude data retained until I clear it or delete my account, so that an inactive workflow does not expire unexpectedly.
61. As a student deleting my account, I want all etude parameters, Pieces, grants, locks, cooldowns, and reachable artifacts removed or revoked, so that no user-accessible etude data survives account deletion.
62. As a student, I want database or private-object-storage failures to leave the last committed workflow coherent, so that partial updates do not present mismatched settings and music.
63. As an operator, I want all unexpected errors logged with a generated correlation identifier and without PII or secrets, so that failures are diagnosable safely.
64. As an operator, I want failed private-artifact deletions retried three times with bounded exponential delays and then logged as unreachable orphans, so that user actions can complete without silently losing cleanup work.
65. As an operator, I want required database, object-storage, LilyPond, and authentication configuration validated before the application is considered healthy, so that configuration defects do not reach students as action-time surprises.
66. As an operator, I want the curated rhythm catalog validated before the application is considered healthy, so that supported meter and duration choices always have valid generation patterns.
67. As the LilyPond service, I want authenticated, bounded, well-formed requests at the documented endpoints, so that engraving work is controlled and interoperable.
68. As the application, I want strict multipart response and media-type validation, so that only expected SVG and PDF output crosses the service boundary.

## Implementation Decisions

### Product and workflow

- There is one actor-facing interface: a signed-in piano student. There is no teacher role or separate teacher workflow.
- All etude pages and actions require the existing authenticated session middleware and no-cache behavior.
- The etude experience and `/etude` entry route replace the current `/private` protected placeholder. Successful sign-in destinations and profile navigation target the etude entry route.
- A user has exactly one current etude parameter aggregate. Returning to the entry route resumes the latest valid workflow state or current score.
- A new aggregate starts with 8 measures, 4/4, C major, octave range 4, and right hand. All available pitches and all individually compatible durations are selected when the notes step is first derived.
- Every handled etude form POST uses a 303 redirect to a canonical GET. The sole binary delivery is also GET-based through a temporary PDF grant.
- Invalid submissions redirect to the same step and preserve safe submitted values in one-time server-managed validation state. Persisted domain state changes only after authoritative validation succeeds.
- Back controls are canonical GET links and do not save unsaved values from the current page.
- Every mutable form carries the current workflow version. A compare-and-set update rejects stale versions and displays the newly current state with an explanatory error.
- Changing setup selections clears all dependent note, duration, split, and review completion state. Any retained Piece becomes stale and its score and PDF controls are hidden.
- Generating a new Piece supersedes the old Piece immediately. Its old SVG reference becomes unreachable and artifact cleanup begins even if rendering the replacement later fails.
- Start Over clears the complete aggregate and returns the student to a fresh setup step with practical defaults.

### Supported musical domain

- Supported major keys are C, G, D, A, E, F, B-flat, E-flat, and A-flat major.
- Supported minor keys are A, E, B, F-sharp, C-sharp, D, G, C, and F natural minor.
- Pitches are the seven diatonic notes of the selected key and use conventional key-signature spelling.
- The student selects one or more keyboard scale ranges identified by octaves 2 through 6. The lowest and highest selections establish a continuous expanded range that includes every intervening scale range. Each range is derived tonic-to-tonic before the global upper cap is applied. Every scientific-pitch octave-7 note is then excluded except C7; C7 remains available only when C natural belongs to the selected key and it occurs in the expanded range.
- One-hand mode requires at least one selected pitch. Two-hand mode requires at least two selected pitches so a boundary can leave both hands non-empty. The notes step rejects a smaller selection with the field-level message “Select at least two pitches when using both hands.”
- For both hands, the split is a boundary between adjacent selected pitches, with lower pitches assigned left and higher pitches assigned right; both sets must be non-empty.
- Supported duration tokens are whole (`W`), half (`H`), dotted half (`D`), quarter (`Q`), dotted quarter (`R`), and eighth (`E`). The curated text catalog is the authoritative build-time input for complete-measure patterns: each time-signature heading is followed by one token sequence per line.
- A rhythm is eligible only when every token it contains is selected. A submitted duration set is valid only if at least one eligible complete-measure pattern exists.
- Minimal client TypeScript is approved only to enhance Select all and disable duration toggles that would leave no eligible rhythm. Select all and form submission work through server requests without scripting, and server controls and validation provide a complete no-script fallback.

### Piece model and generation

- The stable Piece contract is immutable, JSON-serializable, and self-contained. It includes key, time signature, hand/staff assignment, source parameter version, and an ordered array of measures.
- Each measure contains right-hand and left-hand note arrays. The unused hand array is empty. Each note event contains a duration and either a pitch or a rest marker.
- The stored Piece is authoritative. No random seed is persisted or used to reconstruct it.
- The first note position of a freshly generated hand has a 10% rest chance; otherwise its pitch is uniform across that hand's selected pitches.
- Every freshly generated later position also has a 10% rest chance when the rest rule permits it.
- After a pitched event, each available target pitch no more than 12 semitones away receives the supplied probability weight for its absolute interval; those target weights are normalized and sampled. Targets over 12 semitones away have zero transition weight.
- Interval weights are: 0 = 0.0932197441181743, 1 = 0.0755079927357212, 2 = 0.121143267210103, 3 = 0.109028940489093, 4 = 0.0981260464401835, 5 = 0.0883134417961651, 6 = 0.0794820976165486, 7 = 0.0715338878548937, 8 = 0.0643804990694044, 9 = 0.0579424491624639, 10 = 0.0521482042462175, 11 = 0.0469333838215958, and 12 = 0.0422400454394362.
- After a rest, the next pitch is uniform across the hand's selected pitches rather than interval-weighted.
- The left hand’s first pitched event follows the same first-pitched-event rule whether its first rhythm is mirrored or independent: it is selected uniformly across the left hand’s pitches. Rest positions before that event do not establish a current pitch.
- In freshly generated material, a rest may follow a rest only when the durations differ. This constraint carries across measure boundaries.
- After every completed bar, including an exactly repeated bar or a mirrored-rhythm bar, the hand’s current pitch becomes the last pitched event in that completed bar. Trailing rests do not clear it; the next interval-weighted fresh pitch transitions from that last pitched event. If the hand has produced no pitched event yet, its first pitched event uses the uniform first-pitch rule.
- For a single-hand Piece, and for the right hand of a two-hand Piece, each bar after the first has a 20% repeated-bar event. An eligible source is selected among prior bars with linear recency weights: oldest weight 1 through newest weight N.
- A repeated source whose opening pitched event would require a transition over 12 semitones is ineligible. If no prior source is eligible, a fresh bar is generated.
- An accepted repeated bar copies rhythm, pitches, and rests exactly. Exact repeated rest structure may override the same-duration consecutive-rest rule at a measure boundary.
- In a two-hand Piece, the right hand is generated first. For the first left-hand bar, 25% uses the corresponding right-hand rhythm and copied rest positions; 75% uses an independently selected rhythm.
- For each later left-hand bar, the algorithm first assigns a 25% mirrored-rhythm outcome. In the remaining 75%, it applies a 20% duplicate roll, giving 15% overall probability of an exact prior left-hand bar and 60% overall probability of an independent rhythm.
- A mirrored left-hand rhythm copies rest positions and durations from the corresponding right-hand bar but generates different pitched events from the left-hand range. Exact mirrored rests may override the same-duration consecutive-rest rule at a boundary.
- Randomness is injectable at the Piece Generator boundary for deterministic tests, but production generation uses a non-seeded random source.

### Data and concurrency

- D1 uses three user-owned, one-to-one records: the required `etude_params` table for selections and workflow version; a current-Piece record for immutable Piece JSON and render metadata; and an operation record for generation/PDF locks, independent success timestamps, and the temporary PDF grant. Physical columns and the two companion table names remain encapsulated rather than stable application contracts.
- All three records reference the authenticated user with uniqueness and cascade-deletion semantics.
- Conditional writes enforce workflow versions and per-user lock acquisition. Routes never implement read-then-unconditionally-write concurrency.
- New-Piece generation and PDF generation each have two distinct controls: an in-flight lock that prevents concurrent work and a last-success timestamp that enforces a post-success cooldown.
- Each acquired lock has an unpredictable owner identifier held by that request. Every completion, state commit, and release conditionally verifies that the current lock owner identifier still matches; a request whose expired lock was replaced cannot commit results or release its replacement’s lock.
- An in-flight lock expires exactly 60 seconds after acquisition. An expired lock may be atomically replaced by a later request. Expiry is crash-recovery safety, not the normal release path.
- Work proceeds in this order while the request owns the lock: domain validation and Piece generation, conditional Piece persistence and supersession, LilyPond call, response validation/sanitization, private R2 write, and final conditional render-state commit. This preserves the new Piece for rendering retry while preventing a request that lost its lease from publishing a result. The 30-second default service timeout leaves budget within the 60-second lease for local processing; every stage still verifies ownership before committing.
- The new-Piece cooldown lasts exactly 60 seconds and starts only after Piece persistence, valid SVG receipt, sanitization, private R2 persistence, and final D1 state update all succeed.
- Rendering retry reuses the saved Piece, does not create random music, and is not blocked by the new-Piece cooldown. It still uses the generation/render in-flight lock.
- The PDF cooldown lasts exactly 60 seconds and starts only after a valid PDF is persisted privately and its one-time grant is committed. Service, validation, or storage failures do not consume it.
- Every non-success path after acquisition, including validation, rendering, sanitization, storage, conflict, and final-commit failure, conditionally releases its own lock. Successful completion also conditionally releases it; lock expiry is used only when the owning request cannot perform release.
- Current data has no inactivity expiration. It remains until Start Over, replacement, or account deletion.

### HTTP routes and interaction contract

- `GET /etude` is the stable entry point and redirects to the canonical route for the saved current state.
- Setup uses `GET /etude/setup` and `POST /etude/setup`.
- Pitch and duration selection uses `GET /etude/notes` and `POST /etude/notes`.
- The conditional two-hand boundary uses `GET /etude/split` and `POST /etude/split`.
- Review uses `GET /etude/review`.
- New-Piece generation uses `POST /etude/generate` and redirects to the score or retry state.
- The current score uses `GET /etude/score`. If no current Piece exists, it redirects with a safe message to the earliest incomplete canonical step.
- Rendering recovery uses `POST /etude/render/retry`.
- PDF creation uses `POST /etude/pdf`. Success creates a grant and redirects to an authenticated download GET identified by an opaque grant identifier.
- Start Over uses `POST /etude/start-over`.
- Direct access to any step or score with unmet prerequisites redirects to the earliest incomplete canonical step with a safe message.
- A temporary PDF grant belongs to the authenticated user, expires after 15 minutes, and can be consumed once. Expired, consumed, foreign, or missing grants never expose object details and redirect the owner to the score with a safe error where applicable.
- Any later etude activity by that owner detects expired grants, atomically revokes them, and attempts physical PDF cleanup. Grant expiry itself does not require a background job.
- The attachment filename is `etude-<piece-short-id>.pdf`, where `<piece-short-id>` is the first eight lowercase hexadecimal characters of the server-generated Piece UUID. It is generated entirely by the server and never from untrusted form input.
- Setup, notes, and split POSTs have no etude-specific cooldown or rate limiter in v1. Existing authenticated-session, CSRF, request-size, and platform request protections apply; their comparatively cheap repeated submission is an accepted v1 risk.

### LilyPond and artifact contracts

- The application serializes the authoritative Piece to LilyPond source. The output is a grand staff with fixed treble/right and bass/left mapping, selected key and time signature, upward right-hand stems, and downward left-hand stems. For a one-hand Piece, the unused staff contains no notes or rests but still displays the selected key and time signature.
- V1 output has no title, composer, tempo, dynamics, fingering, articulation, or measure-number metadata.
- The configured service base URL is joined with `/generate` for SVG and `/pdf` for PDF.
- Requests use HTTP POST, JSON content type, a JSON string field named `lilypond`, and Bearer authentication from a secret binding.
- Each external call has the configured timeout, defaulting to 30 seconds. Redirects to an unconfigured host are not followed.
- A successful service response is multipart and contains exactly one required `output` file part and one required JSON `metadata` part. Unknown bounded parts may be ignored; duplicate required parts are rejected.
- `/generate` requires `image/svg+xml` output no larger than 5 MB. `/pdf` requires `application/pdf` output no larger than 10 MB. Bodies are bounded while read or streamed; a declared content length does not replace actual-size enforcement.
- Metadata contains a LilyPond version string and an array of warning strings. Metadata is limited to 128 KB, at most 100 warnings, and at most 1 KB per warning. SVG metadata is persisted for diagnosis; warnings are not shown to students. PDF metadata is bounded and logged only when needed for diagnosis.
- Non-success responses use JSON with a string `error` field. The client reads only a bounded body, sanitizes it for logs, and shows students a generic message and correlation identifier.
- Missing parts, wrong media types, malformed multipart, malformed metadata, oversized output, timeout, network failure, non-success status, malformed SVG, rejected SVG content, or artifact-write failure are typed service failures.
- SVG is sanitized with DOMPurify in a jsdom environment before storage and again treated as untrusted presentation data when embedded. Scripts, event handlers, external resource loads, foreign interactive content, and unsafe links are removed or rejected. Sanitization that cannot produce a valid inert SVG is a failure.
- Sanitized SVG is stored in private R2 and has no public URL. The authenticated application retrieves it through the binding after checking current user ownership and Piece version.
- PDF is stored in private R2 only for the grant lifecycle. The download GET prepares the bounded attachment, atomically consumes the grant, and initiates object cleanup.
- Replacing a Piece, Start Over, grant consumption/expiry, and account deletion revoke D1 reachability before or regardless of cleanup completion.
- Artifact deletion makes one initial attempt followed by three retries delayed 100, 200, and 400 milliseconds. Exhaustion emits a structured `artifact_cleanup_exhausted` log with `artifactId`, `artifactKind` (`svg` or `pdf`), `cleanupReason` (`replacement`, `start_over`, `grant_consumed`, `grant_expired`, or `account_deleted`), `attemptCount`, `lastErrorCategory`, `correlationId`, and `occurredAt`. The opaque artifact identifier contains no user identifier; the user operation proceeds and the object remains unreachable.
- R2 write failure after valid SVG/PDF receipt does not consume the corresponding cooldown. SVG failure retains the Piece for Retry rendering; PDF failure returns to the current score.

### Validation, errors, logging, and accessibility

- Native HTML attributes provide client-side constraints where applicable. Every submitted value, workflow transition, ownership claim, and version is independently validated on the server.
- Invalid values are never silently coerced or added. Errors identify the affected controls and explain the supported range or combination.
- Database failures preserve the prior committed aggregate where possible and produce a generic retry message. Multi-resource operations use explicit state transitions so an R2 failure cannot make an artifact current without a matching D1 commit.
- Every request receives an application-generated UUID. It is included in structured logs and the `X-Correlation-ID` response header; unexpected user-facing errors include it.
- Logs contain no names, email addresses, session values, Bearer tokens, secrets, raw service credentials, or LilyPond request bodies. Artifact identifiers logged for orphan cleanup are opaque and contain no user identifier.
- Form controls have programmatic labels, instructions are associated with their fields, error summaries link to invalid controls, and errors use semantic status/alert behavior.
- Invalid submissions programmatically focus the error summary. After successful generation or rendering retry, one-time server-managed navigation state causes the score heading/region to receive programmatic focus; other successful full-page navigation relies on logical heading order and browser navigation behavior.
- The score page provides a structured textual representation of key, time signature, and each measure's right- and left-hand pitches/rests and durations. It is derived from the authoritative Piece rather than parsed from SVG.
- The embedded sanitized SVG is noninteractive, has an accessible relationship to the structured text, and does not create duplicate or misleading screen-reader content.

### Configuration and health

- Required production configuration includes the D1 binding, private R2 binding, the `LILYPOND_SERVICE_URL` secret for the service base URL, the `LILYPOND_API_KEY` secret for Bearer authentication, and `LILYPOND_TIMEOUT_MS` as a numeric variable defaulting to 30,000 milliseconds, in addition to existing authentication configuration.
- Missing or invalid required configuration prevents the deployment/startup health check from passing.
- The rhythm catalog is validated for syntax, supported tokens, exact measure lengths, and at least one pattern for every supported time signature before the application is considered healthy.
- The external service is responsible for running the current stable LilyPond release. Its reported version is retained with SVG render metadata, and deployment acceptance verifies that version against the then-current stable release rather than hard-coding a permanent version in the Piece contract.

## Module Design

### Music Domain

- **Name**: Music Domain
- **Responsibility**: Own supported musical values, key-aware pitch/range derivation, split boundaries, rhythm catalog parsing, eligible-rhythm calculation, and authoritative parameter validation.
- **Interface**: Accepts untrusted parameter candidates or validated upstream choices and returns typed validated settings, derived options, or field-addressable domain failures. Catalog initialization can fail health validation.
- **Tested**: yes

### Piece Generator

- **Name**: Piece Generator
- **Responsibility**: Create one immutable, presentation-independent Piece according to the rhythm, interval, rest, repetition, and two-hand probability rules.
- **Interface**: Accepts validated immutable generation settings and an injectable random-number source; returns a complete Piece or a typed invariant failure. It performs no database, HTTP, SVG, or UI work.
- **Tested**: yes

### Etude Repository

- **Name**: Etude Repository
- **Responsibility**: Own persistence and atomic transition semantics for the one current D1 aggregate.
- **Interface**: Loads owner-scoped workflow snapshots; creates or updates parameters by expected version; commits/revokes Pieces and artifact metadata; atomically acquires, verifies, releases, or recovers locks by owner identifier; checks/records independent cooldowns; creates, consumes, and revokes PDF grants; and returns typed conflict, missing, ownership, or storage failures.
- **Tested**: yes

### Artifact Store

- **Name**: Artifact Store
- **Responsibility**: Own private R2 score artifacts and their bounded lifecycle.
- **Interface**: Stores and retrieves bounded SVG/PDF data under opaque identifiers; validates expected object metadata; deletes with the defined retry policy; and returns typed missing, size, storage, or cleanup-exhausted failures. It exposes no public URL or user-derived key.
- **Tested**: yes

### LilyPond Renderer

- **Name**: LilyPond Renderer
- **Responsibility**: Hide Piece-to-LilyPond serialization, authenticated external calls, bounded multipart parsing, output validation, metadata validation, and SVG sanitization behind one rendering boundary.
- **Interface**: Accepts a self-contained Piece and an SVG or PDF target; returns a typed sanitized SVG result or bounded PDF result with metadata. Failures distinguish timeout, transport, service response, contract, size, serialization, and sanitization categories without exposing secrets.
- **Tested**: yes

### Workflow Service

- **Name**: Workflow Service
- **Responsibility**: Coordinate domain validation, progression, dependent-state invalidation, generation, rendering retry, artifact replacement, cooldowns, PDF grants, Start Over, and account-deletion cleanup.
- **Interface**: Exposes owner-scoped application operations using expected workflow versions and returns route-neutral success states or typed actionable failures. It is the only caller that composes repository, generator, renderer, and artifact-store operations.
- **Tested**: yes

### Score Presenter

- **Name**: Score Presenter
- **Responsibility**: Produce the safe score-page presentation and equivalent structured textual score from a current Piece and sanitized artifact.
- **Interface**: Accepts an owner-authorized current Piece, its validated sanitized SVG, and render metadata; returns server-renderable score content and structured measure text. Missing or stale artifacts produce a retry state rather than score content.
- **Tested**: yes, with Bun tests for Piece-to-structured-text behavior and Playwright tests for page integration, focus, and accessibility wiring

### Etude Web Interface

- **Name**: Etude Web Interface
- **Responsibility**: Own authenticated named routes, server-rendered pages/forms, PRG redirects, one-time validation state, accessibility wiring, and approved progressive enhancements.
- **Interface**: Maps HTTP requests and authenticated context to Workflow Service operations and canonical responses. It accepts no client assertion of ownership, cooldown, Piece content, or completion state as authoritative.
- **Tested**: yes, through Playwright

## Testing Decisions

- Tests must assert externally observable behavior and domain invariants rather than private helper calls, physical D1 columns, or R2 key formatting.
- Tests are written before implementation, then the minimum implementation is added to pass them, followed by refactoring while the tests remain green.
- Bun tests cover the first six modules plus the Score Presenter’s pure Piece-to-structured-text behavior. Playwright covers the Score Presenter’s page integration and the Etude Web Interface in complete authenticated workflows.
- Music Domain tests cover the exact supported keys, natural-minor spelling, scale-range boundaries, C7 exception, contiguous octave expansion, one-hand and two-hand minimum pitch counts and exact validation message, split eligibility, duration compatibility, malformed catalogs, and every catalog pattern's exact meter length.
- Piece Generator tests use deterministic random sequences at branch boundaries. They cover every duration token, interval weights and normalization, over-12 exclusion, initial and later rests, the left hand’s first pitched event in mirrored and independent rhythms, consecutive-rest rules, current-pitch continuity after fresh, repeated, and mirrored bars with trailing rests, first/subsequent bars, 20% repeat decisions, linear recency weighting, ineligible repeat fallback, exact-repeat exceptions, and the 25%/15%/60% two-hand outcomes.
- Piece Generator property/invariant tests verify requested measure count, exact measure duration, selected pitches only, correct hand ranges, complete JSON serialization, empty unused-hand arrays, and no mutation of settings.
- Repository tests cover one-record-per-user enforcement, cascade behavior, optimistic conflicts, conditional lock acquisition, owner-identifier checks on every commit and release, replacement of an expired lock while its former owner is still running, unconditional owner-scoped release on every failure category, one-minute lock recovery, independent cooldown clocks, success-only timestamps, owner-scoped reads, grant expiration, and single consumption.
- Artifact Store tests use a fake R2 boundary and cover privacy, actual byte limits, missing objects, metadata mismatch, replacement, revocation, retry delays, and the exact structured orphan-cleanup log event and fields after exhausted cleanup.
- LilyPond Renderer contract tests cover exact request method, endpoints, authorization, JSON field, timeout, redirect handling, valid multipart responses, missing/duplicate parts, strict media types, actual size limits, bounded metadata/warnings, non-JSON and oversized errors, malformed SVG, sanitizer rejection, and safe SVG output.
- Workflow Service tests cover every state transition and failure boundary, including stale-tab conflicts, upstream invalidation, stale-score hiding, new-Piece replacement, render retry identity, D1/R2 partial failures, generation and PDF locking, lost-lock-owner commit rejection, cooldown accounting, Start Over, account deletion, one-use PDF delivery, and opportunistic cleanup of expired grants on later owner activity.
- Score Presenter Bun tests cover key and time signatures, ordered measures, both hands, empty unused hands, every pitch/rest and duration token, and stable accessible text derived only from the Piece.
- Playwright tests cover signed-out denial; resume; all step routes; score access without a current Piece; prerequisite redirects; defaults; Back links; read-only summaries; native labels/constraints; Select all with and without enhancement; duration prevention and server fallback; one-hand and two-hand pitch cardinality; error summary focus; review; generation; score focus after generation and retry; stale-score hiding; retry rendering; score text alternative; SVG safety; exact PDF attachment filename, redirect, download, expiry, and consumption; Start Over; concurrent/stale submissions; cooldown messages; and generic errors with correlation IDs.
- Existing protected-page sign-in tests and authentication helpers are prior art for authenticated navigation. Existing form-validation suites are prior art for server validation and error assertions. Existing resend/reset cooldown tests are prior art for time-based behavior. Existing database-failure hooks and retry tests are prior art for controlled persistence failures.
- External service, D1, and R2 failures are simulated at module boundaries; tests do not depend on the real LilyPond service or public object URLs.
- Distribution tests verify deterministic decision thresholds and invariants, not flaky aggregate randomness over uncontrolled production samples.

## Out of Scope

- A teacher, administrator-facing composition UI, classroom management, assignments, or sharing students' etudes.
- More than one active workflow, saved score history, archives, favorites, public sharing, or restoration after Start Over.
- Editing individual generated notes, manually composing measures, or importing existing music.
- Audio playback, MIDI input/output, MusicXML, braille music, or formats other than embedded SVG and downloadable PDF.
- Time signatures other than 2/4, 3/4, and 4/4.
- Keys with more than four sharps or flats, modes, harmonic/melodic minor, chromatic pitch selection, or alternative enharmonic spelling controls.
- Durations, tuplets, ties, chords, dynamics, articulations, fingering, pedal markings, tempo, titles, composer labels, or measure numbers beyond the explicitly supported note lengths and rests.
- Cross-staff notation, automatic clef changes, or a single-staff layout for one-hand etudes.
- Deterministic regeneration from a persisted random seed.
- Displaying a stale score or allowing a PDF from parameters that no longer match its Piece.
- Public R2 URLs or unauthenticated artifact access.
- PDF download access beyond the 15-minute grant or more than one successful download per grant. Immediate physical deletion of an expired undownloaded PDF when its owner never returns is not guaranteed in v1; the object remains private and unreachable.
- Building or operating the external LilyPond web application itself, except for enforcing its client contract.
- Redesigning existing authentication, session, profile, sign-up-mode, or email behavior beyond replacing protected-page destinations and integrating etude cleanup into account deletion.
- An automated orphan-artifact sweeper or operator dashboard; v1 records opaque cleanup failures for privileged operational handling.
- Analytics, product telemetry, usage dashboards, billing, quotas beyond the two one-minute cooldowns, or anti-abuse systems beyond existing authentication and request protections.

## Open Questions

None. Product, domain, failure, integration, persistence, module, and testing decisions required for v1 were resolved during the PRD interview.

## Further Notes

- The current application already supplies Better Auth sessions, signed-in route protection, D1 through Drizzle, server-rendered Hono forms, Valibot validation, PRG redirect helpers, secure headers, CSRF protection, structured logging utilities, Bun tests, and Playwright authentication helpers. The etude feature should extend those patterns rather than establish a parallel application architecture.
- The current application does not yet contain etude tables/routes, Piece generation, a LilyPond client, SVG sanitization, or PDF handling. DOMPurify and jsdom-compatible sanitization support and a private R2 binding must be added during implementation.
- The curated rhythm source currently lives at `Notes/all-rhythms.txt`; implementation may package its validated contents at build time, but that source remains authoritative for v1 patterns.
- The 5 MB SVG ceiling requires R2 rather than a single D1 value because D1's current documented maximum string, BLOB, or row size is 2,000,000 bytes. D1 remains authoritative for ownership and artifact reachability.
- The interval probabilities are treated as relative target-pitch weights after filtering to available targets. Their supplied values sum to approximately one before availability filtering; normalization after filtering is required.
- “Current stable LilyPond” is an operational deployment requirement. The service-reported version is evidence for acceptance and diagnosis, not a permanent version embedded in the stable Piece format.
