# Critique: PRD — Etude Generator

## Verdict

The PRD is **not ready for issue generation**. It is broad and thoughtfully structured, but several central requirements are contradictory or not representable by the proposed data model. The highest-risk gaps concern rhythmic correctness, polyphonic representation, hand/range rules, randomness, persistence consistency, and browser audio.

The PRD also goes well beyond the initial ideas without distinguishing user-confirmed requirements from implementation assumptions. That is not inherently wrong, but the added behavior needs the same precision as the source requirements.

## What Is Strong

- The problem and user-facing solution are clear.
- Authentication, generation, history, media ownership, and deletion are treated as one end-to-end feature.
- The document identifies failure states for external rendering and basic form validation.
- The external rendering boundary and broad module responsibilities are explicit.
- The PRD preserves key requirements from the ideas file: selected musical inputs, non-uniform generation, valid measure lengths, presentation-independent generation, LilyPond output, audio playback, and POST value preservation.
- Out-of-scope items are concrete.

## Critical Findings

### 1. The internal representation cannot express the required music

`Piece → Measures → Notes`, where each measure merely contains notes with a `hand`, cannot unambiguously represent:

- two hands sounding simultaneously;
- independent rhythms in two hands;
- chords and concurrent notes;
- rests that occupy time in only one voice;
- event onset times;
- multiple voices within a staff;
- ties and slurs between specific events.

An ordered note array is sufficient for one monophonic line, but not for the simultaneous and independent-hand requirements in stories 61 and 62. The representation must define staves or voices, event offsets, exact durations, and stable event identities or links. This must be resolved before module interfaces are accepted.

### 2. Measure filling contradicts duration and tie selections

The 80% shorten / 20% tie rule has unresolved contradictions:

- A tie may be generated when ties are toggled off.
- “Shorten to fit” may create a duration the user did not select.
- A duration may be longer than a whole measure, such as a whole note in 2/4.
- The final measure has no following bar to receive an overflow tie.
- A tie must connect notes of the same pitch, but pitch continuation is not specified.
- Dotted durations can leave remainders that no selected duration can fill.
- The quarter-note fallback can violate the selected durations.

The PRD must define exact duration units, legal decomposition rules, whether controls mean “allowed” or “must appear,” tie behavior when disabled, and a guaranteed algorithm for every permitted parameter combination.

### 3. Hand ranges and octave selection can be impossible to satisfy together

The PRD requires the right hand to use middle C upward, the left hand to use middle C downward, and both hands to remain within a single user-selected octave range from 1–7. Valid form choices can make these requirements impossible, such as right hand with octaves 1–2 or left hand with octaves 6–7.

The PRD must choose one of these models:

- separate validated octave ranges per hand;
- one range whose options are constrained by the selected hand;
- ranges treated as preferences rather than hard limits; or
- cross-field validation that rejects impossible combinations.

It must also define whether octave labels use scientific pitch notation and identify the octave containing middle C.

### 4. Middle C assignment is logically unclear

Stories 35–37 and the algorithm conflate pitch generation, hand assignment, and engraving. If both hands “play middle C simultaneously,” assigning middle C to only one hand appears to discard one performed note. If the rule instead resolves which staff displays a single generated middle C, then both hands were not playing it.

The PRD must define whether a note belongs to a hand before engraving, whether duplicate simultaneous middle Cs are allowed, and whether this rule changes sound, notation, or only staff placement. It must also define behavior when a hand has no previous note.

### 5. “Always succeeds” is not supportable under the current parameter space

The generator promises a valid result and no error state, but legal selections can be mutually incompatible. Examples include no pattern type, a selected duration that cannot tile the chosen meter, an impossible hand/octave range, ties disabled with no exact measure filling, and pattern prerequisites that cannot be met by a one-note pool.

Fallback behavior must preserve documented user constraints or the form must reject incompatible inputs. “Always succeeds” should not remain an unconditional requirement until all valid parameter combinations have defined behavior.

### 6. Randomness is mathematically underspecified

“Inversely proportional to interval size” conflicts with “scaled linearly” and is undefined for a unison if interval size is zero. The statement that an octave is three times less likely than a unison does not determine weights for the intervening intervals or intervals larger than an octave.

The PRD must define:

- interval distance units;
- an explicit weight function or lookup table;
- candidate construction across pitch classes and octaves;
- normalization after range and note filtering;
- treatment of repeated notes;
- behavior at range boundaries;
- the maximum interval when large jumps are enabled;
- a seedable random-number source for deterministic tests;
- statistical acceptance tolerances and sample sizes.

Without these decisions, the algorithm and its tests cannot agree on correctness.

### 7. Persistence has no consistency model

One generation writes a D1 row and two R2 objects, but these operations cannot be committed atomically. The PRD does not define behavior after partial upload, D1 failure, retry, timeout after a successful remote operation, or partial deletion. This can create orphaned objects, incomplete history records, or false failure messages.

The PRD must define operation ordering, idempotency, cleanup behavior, record states, retryability, and the user-visible result of partial failure. Deletion should state whether a missing R2 object counts as success and what happens when only one object can be deleted.

### 8. Failed-render storage contradicts the schema and history model

The PRD says LilyPond text is stored so it can be re-rendered after final service failure, but the proposed record requires SVG and MIDI keys and no status field. It does not say whether failed generations appear in history, how users retry them, or who initiates re-rendering.

Either failed generations are not saved, or the schema and user stories need nullable artifact keys, a generation status, error metadata, and a retry lifecycle. The current statements cannot both be implemented.

### 9. Account deletion will orphan R2 objects

The new D1 row references the user with cascade deletion, but R2 objects are outside D1 and cannot be cascade-deleted. Existing account deletion can therefore remove ownership records while leaving permanent SVG and MIDI objects behind.

The PRD must add account-deletion behavior for etude artifacts, including partial-failure handling and eventual cleanup. This is an integration requirement, not an implementation detail.

### 10. The Audio Player design is incomplete and internally inconsistent

The module says playback uses an inline script, while the proposed CSP allows scripts from `'self'` only and does not allow inline script execution. One of those decisions must change, preferably by serving a dedicated local script without weakening CSP.

Tone.js also does not by itself define how a MIDI file is parsed, scheduled, or voiced. The PRD must specify the MIDI parser or playback approach, instrument/synthesis behavior, loading and decode failures, browser audio-context activation, concurrent clicks, pause/resume semantics, stop/reset semantics, end-of-track state, and cleanup on navigation.

Marking this user-facing module “Tested: No” conflicts with the PRD’s otherwise test-oriented design and the project’s test-first rules. Its pure scheduling/state logic should be testable even if browser audio output is not asserted directly.

## Major Findings

### 11. Form dependencies are not defined without client-side JavaScript

Only audio JavaScript is permitted, but several controls depend on earlier choices: key determines note choices, hand determines interaction controls, and simultaneous/alternating mode determines later controls. The preset GET behavior is specified, but key and hand changes are not.

The PRD must define whether all controls are always rendered, whether key/hand changes submit a GET form, and how pending values are preserved or reset when choices become invalid. It should also specify browser-native validation versus server validation for checkbox groups.

### 12. Musical selection semantics are ambiguous

For notes, durations, articulations, dynamics, and patterns, “include” could mean any of the following:

- allowed to occur;
- guaranteed to occur at least once;
- selected uniformly;
- selected with an unspecified musical weighting.

These interpretations produce materially different results. The PRD must define the semantics and weighting of each selected category. It must also state whether zero articulations or dynamics is valid and what output that produces.

### 13. Pattern types are names, not requirements

Arpeggios, repeated phrases, scale runs, and random melodic patterns lack definitions. Missing decisions include pattern length, direction, repetition count, chord source, whether an arpeggio may repeat pitches across octaves, how patterns cross measures, how they interact with rhythm, and fallback behavior when selected notes cannot support them.

“Each measure has equal probability” also prevents a repeated phrase from naturally spanning measures unless an additional phrase-level planning stage is defined.

### 14. Alternating-hand behavior is not coherent

The PRD says selected alternation modes have equal probability for “each note/measure,” but the modes themselves operate at different granularities. It is unclear when a mode is sampled, how long it remains active, which hand starts, and what the inactive hand contributes.

“Half measure” is also ambiguous in odd meters such as 3/4 and can bisect a selected duration. The PRD needs a timeline-level definition for each mode and meter.

### 15. Meter and tempo semantics are incomplete

The tempo slider gives BPM but does not define the beat unit. This is especially significant in 6/8, where tempo may refer to an eighth note or dotted quarter. Whole and dotted-note duration meaning across meters also needs exact rational units.

The LilyPond and MIDI outputs must use the same tempo interpretation, and playback acceptance criteria should verify it.

### 16. Note spelling and key changes are undefined

The PRD does not specify:

- whether the checklist contains pitch classes or spelled notes;
- how enharmonic chromatic notes are named in sharp and flat keys;
- whether key changes preserve equivalent selected pitches or reset to scale defaults;
- how minor keys are labeled to users;
- whether accidentals follow key-aware spelling in generated notation.

This affects the form, generator, theory module, LilyPond conversion, and test fixtures.

### 17. Slur, tie, articulation, and dynamic rules are incomplete

The toggles do not say whether ties or slurs are merely allowed or guaranteed. Valid engraving requires constraints: ties connect identical pitches; slurs need start and end events and should not terminate on rests; chord ties need per-pitch treatment; articulations and slurs can interact; dynamics may apply per note, voice, staff, or phrase.

The internal representation and converter tests cannot be designed until these semantics are fixed.

### 18. External API failure behavior is too narrow

The contract omits malformed JSON, missing response fields, invalid base64, oversized responses, authentication failures, rate limits, network failures, abort behavior, and unexpected status codes. It also does not distinguish retryable statuses from permanent errors; retrying a 400 is inappropriate.

The PRD should define request and response size limits, content types, timeout scope, retryable conditions, backoff, error-body limits, schema validation, and safe user-facing error mapping.

### 19. Operational limits and abuse controls are absent

An authenticated user can request up to 64 measures repeatedly, causing external compute, Worker memory use, R2 storage, and D1 growth. No concurrency limit, rate limit, quota, retention policy, or maximum rendered payload is stated.

These are expensive-to-reverse product and operational decisions. At minimum, the PRD needs explicit limits and behavior when a limit is reached.

### 20. SVG handling needs a security requirement

The Worker serves externally produced SVG as same-origin content. The PRD does not define sanitization, response security headers, content disposition, or whether SVG is embedded as an image versus injected as markup. It must prohibit unsafe active content and external resource references or require sanitization before storage/serving.

### 21. History pagination and ordering lack edge cases

The PRD does not define behavior for missing, zero, negative, non-integer, very large, or repeated `page` parameters. “Newest first” needs a stable secondary sort when timestamps match. The schema also needs an index supporting owner-scoped chronological pagination.

Deletion from the last item on a page should have specified redirect behavior so the user does not land on an empty or now-out-of-range page.

### 22. Data evolution is unaddressed

`params` is stored as unversioned JSON. Future parameter or preset changes may make old records impossible to parse or cause the history form to reinterpret old values. The PRD should define a schema version, parse-failure behavior, and whether history renders from stored artifacts even when old parameters can no longer populate the current form.

### 23. Route-level error behavior is incomplete

Ownership 404 behavior is defined for view and media, but not for delete confirmation or deletion. Database and R2 read failures are not distinguished from not-found responses. The PRD also does not state whether media responses support caching, conditional requests, or byte ranges.

Static routes such as history and delete confirmation must not be captured by the generic `/etude/:pieceId` route; registration or path design must make this unambiguous.

### 24. Logging and observability requirements are missing

The feature depends on D1, R2, an external renderer, and browser playback, but no logging requirements are defined. The PRD should require structured server logs for generation ID, safe user identifier, render latency, retry attempt and status, upload/delete stages, cleanup failures, and final outcome. Secrets, bearer tokens, and full generated payloads must not be logged.

It should also define useful metrics, including generation success rate, renderer latency, retries, artifact sizes, and orphan-cleanup failures.

### 25. Accessibility and responsive behavior lack acceptance criteria

The PRD names DaisyUI and says the layout is responsive, but does not require labels, fieldsets and legends, keyboard operation, error association, focus movement after failed POST, slider value output, accessible playback state, or score alternatives. “No mobile-specific UI” does not remove the need for the large form and generated score to work at narrow widths.

### 26. Success criteria and performance requirements are absent

There are no measurable product or system outcomes. The PRD should define at least generation latency targets, maximum accepted render time, history and media response expectations, supported browsers, and the user-visible boundary between loading, timeout, retry, and failure.

## General Quality Problems

### User stories

- Stories 60–66 contain the grammatical construction “I want to the generator/each hand,” which should be corrected.
- Student and teacher authentication stories are duplicates because the system defines no role-specific behavior.
- Several implementation rules are written as user benefits even though users cannot observe the exact algorithm, such as equal probability or the 80/20 split. These are better expressed as acceptance rules with measurable tests.
- There are no stories for audio load/playback failure, storage failure, rate limiting, impossible parameter combinations, invalid pagination, or partial deletion.

### Implementation decisions

- The PRD includes volatile file paths and symbol names in Further Notes, contrary to the `write-a-prd` skill’s instruction not to include file paths or code snippets.
- Several decisions have no rationale despite the template asking for architectural decisions and rationale. Examples include permanent dual-artifact storage, not storing the internal representation, a single global octave range, and a separate renderer reached by HTTP rather than a service binding.
- `LILYPOND_SERVICE_URL` is called a secret even though the security-sensitive value is the bearer token. The intended configuration and rotation model should be explicit.
- “Current stable” LilyPond in the ideas file and “latest stable at implementation time” Tone.js make builds non-reproducible. Exact deployed versions should be pinned and recorded.

### Testing decisions

- Randomized tests need injected seeds and deterministic invariants; distribution tests need sample counts and tolerances to avoid flakiness.
- “Patterns produce expected structures” is not testable until each structure is defined.
- Converter tests based only on string fragments may accept invalid LilyPond. The strategy should include parsing or rendering representative fixtures through a pinned LilyPond test double/service where practical.
- Route tests need deterministic renderer and R2 fakes, explicit partial-failure cases, ownership checks, and account-deletion cleanup coverage.
- The Audio Player should not remain untested.

## Source-Idea Coverage

The PRD covers every explicit capability in the ideas file, but the following source concepts were altered or expanded and need confirmation:

- “Accents” became a specific articulation list.
- Basic hand selection expanded into simultaneous/shared/independent/alternating modes.
- History, deletion, presets, pagination, external-service architecture, R2 persistence, and a large set of algorithmic probabilities were added.
- The ideas file says generated music is stored internally in a presentation-independent way. The PRD creates such a representation only during generation and explicitly does not persist it. Confirm whether “stored internally” meant an in-memory model or durable storage.
- The ideas file requires the current stable LilyPond release, while the API contract does not expose or verify renderer version. Version compatibility needs an explicit owner and deployment contract.

## Decisions Required Before Issue Generation

1. Define a polyphonic, time-aware internal representation.
2. Define valid parameter combinations and complete cross-field validation.
3. Replace the measure-filling rule with an exact algorithm consistent with duration and tie controls.
4. Resolve hand, staff, middle-C, and octave-range semantics.
5. Specify explicit probability functions, selection semantics, seeding, and test tolerances.
6. Define every pattern and alternation mode at the event/timeline level.
7. Define atomicity-equivalent workflows for render, D1, R2, deletion, and cleanup.
8. Decide whether failed generations are persisted and, if so, define their lifecycle and schema.
9. Add account-deletion cleanup behavior.
10. Resolve the CSP/inline-script contradiction and specify the complete browser-audio stack.
11. Complete the external API contract and operational limits.
12. Add security, accessibility, observability, data-versioning, performance, and browser-support requirements.
13. Add deterministic and failure-oriented testing requirements for the high-risk modules.

Once these decisions are resolved in the PRD, the remaining findings are suitable for refinement during issue generation.
