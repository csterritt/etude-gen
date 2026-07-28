# Critique: PRD — Etude Generator

## Verdict

The PRD is **not ready for issue generation**. It captures most of the original feature ideas and provides a useful high-level decomposition, but several core requirements are contradictory, infeasible for valid form inputs, or not defined precisely enough to implement and test consistently.

The most serious blockers are:

1. The rhythm-generation algorithm cannot produce a valid measure for several allowed combinations of time signature and duration selections.
2. The two-hand rules can be impossible to satisfy and do not define stable hand ownership when rhythms are independent.
3. The single-hand data model contradicts both the selected hand and the source ideas.
4. The pitch probability process is incomplete: it defines interval magnitudes but not direction, constrained sampling, or failure behavior.
5. The promised phrase repetition has been replaced by bar reuse, which does not satisfy the original requirement.
6. The Tone.js design conflicts with the stated CSP, while the MIDI contract lacks the timing semantics needed for BPM-controlled playback.
7. The PDF route has no defined way to recover or safely receive the ephemeral LilyPond source.
8. External-service validation, untrusted SVG handling, operational errors, and logging are insufficiently specified.

The `Open Questions` section should not say that there are none. The unresolved decisions listed at the end of this critique should be settled before work is divided into issues.

## What the PRD does well

- It clearly states the student-facing problem and keeps the teacher interface out of scope.
- It preserves the principal form parameters, authenticated access, SVG rendering, audio playback, PDF download, form-value retention, and the external LilyPond service.
- It records concrete defaults and limits for measures, BPM, hand, time signatures, octaves, and durations.
- It separates generation, LilyPond conversion, service communication, validation, playback conversion, and route orchestration into testable responsibilities.
- It recognizes that the LilyPond API key must remain server-side.
- It includes failure-oriented stories for missing selections, authentication, timeout, and service errors.
- It explicitly makes generated pieces ephemeral and excludes unrelated product expansion.

## Critical findings

### 1. Allowed rhythm inputs are not guaranteed to fill a measure

The form permits any nonempty subset of durations with any supported time signature, but many combinations cannot sum to one measure. Examples include:

- whole notes in 3/4, 2/4, or 6/8;
- half notes only in 3/4;
- dotted-half notes only in 4/4 or 2/4;
- dotted-quarter notes only in 4/4 or 2/4.

The algorithm nevertheless starts with “a single note ... that fills the entire bar” and repeatedly splits it into selected durations. A whole note does not fill 3/4 or 6/8, and the PRD defines no general full-measure duration, ties, truncation, rejection rule, or fallback. “At least one duration” is therefore inadequate validation.

The requirement must define one of these behaviors:

- reject any duration set that cannot tile the chosen meter;
- disable incompatible combinations in the form and validate the same rule server-side;
- allow tied notes across beats or measures under explicit rules; or
- change generation to solve for a valid duration sequence rather than splitting a full-bar note.

The PRD must also define dotted durations numerically and choose a canonical duration unit. For 6/8, it must distinguish six eighth-note units from two compound beats and state how beaming/grouping should appear.

### 2. The splitting process has no termination or solvability guarantee

The PRD says to pick a note, split it into randomly chosen valid durations, and continue until all durations are allowed. It does not define:

- which intermediate durations may exist;
- which partitions are legal;
- how to avoid a dead end;
- what happens when no selected duration can split the current duration exactly;
- whether the optional “continue splitting” decision is made once, per note, or repeatedly;
- a maximum iteration count; or
- a deterministic failure outcome.

A requirements document need not prescribe code, but it must prescribe observable behavior for every accepted input. The accepted input domain and the guarantee that generation terminates with a rhythmically valid piece are missing.

### 3. The two-hand constraints are sometimes impossible

The form allows `both` with one selected pitch class and one octave. That creates only one playable pitch, but the PRD requires simultaneous notes to differ and requires the left note to be lower than the right note. No valid result exists. Similar impossibilities occur near range boundaries or when one sustained note overlaps several independently timed notes.

The PRD must define minimum pitch-range requirements for two-hand generation or define a fallback/error when no valid pair exists. It should not silently relax user-selected notes or octaves.

### 4. Hand assignment is logically unstable

“Lower note = left hand, higher note = right hand, applied on every note” is not compatible with independently generated hand sequences. If the generated lines cross, assigning hands per note can swap a musical line between hands mid-measure. With independent rhythms, there is not necessarily a one-to-one pair of note onsets to reorder. A note in one hand may overlap several notes in the other.

Requirements should instead define whether:

- each generated voice has fixed hand ownership and pitch candidates must satisfy the ordering constraint throughout every overlap; or
- voices may cross, with only exact unisons forbidden; or
- register ranges are partitioned in advance between hands.

The behavior for rests must also be explicit: a rest has no pitch and should not participate in lower/higher or unison comparisons.

### 5. The single-hand representation contradicts the selected hand

The PRD says that whenever only one hand is generated, the right-hand array contains notes and the left-hand array is empty. This makes a left-hand selection indistinguishable from a right-hand selection and prevents the converter from reliably choosing the correct staff, stem direction, register behavior, and playback part.

The source ideas contain a different but also incorrect unconditional rule: they say a one-hand piece places notes in the left array. The PRD should resolve the underlying requirement rather than choose the opposite unconditional rule. A left-hand piece must retain left-hand identity; a right-hand piece must retain right-hand identity.

### 6. The interval-probability algorithm is incomplete

The probability table defines absolute interval sizes from 0 through 12 semitones. It does not define:

- whether a nonzero interval moves up or down and with what probability;
- how direction behaves at the edge of the selected range;
- whether probabilities are renormalized over feasible candidates;
- how a pitch class is chosen when multiple selected pitches are the same interval away;
- what “a different valid candidate” means;
- what happens when only interval zero is feasible;
- whether repeated attempts have a cap; or
- whether rests affect the previous-pitch state.

Naive rejection sampling will substantially change the stated distribution for narrow or sparse note selections. The requirements should state whether the listed probabilities are target probabilities before constraints or the expected distribution of generated intervals after constraints. Without this distinction, the probability behavior is not testable.

### 7. “Repeated phrases” is not fulfilled by bar reuse

The source ideas explicitly give both a repeated four-measure phrase and a repeated three-note sequence as examples. The PRD implements only reuse of whole bars. Repeating or transforming a bar is not equivalent to repeating a multi-measure phrase or an intra-measure motif.

The PRD must either:

- retain phrase/motif repetition and define its scope and interaction with bar reuse; or
- explicitly narrow the product requirement to bar repetition and record that this is an intentional change from the source ideas.

### 8. Bar-reuse percentages are underspecified

The following statements are not deterministic enough to serve as acceptance criteria:

- “60%–100% of bars are unique” does not define how the percentage is chosen or rounded for 1–3 measures.
- “60% of repeats are consecutive” and “40% are non-adjacent” do not define behavior when there is only one repeat.
- It is unclear whether a transformed reuse counts as a unique bar.
- It is unclear whether reuse applies to an entire two-hand measure or independently to each hand.
- “Same pitches with different rhythm” does not define pitch-to-duration reassignment, whether onset order is preserved, or how independent two-hand constraints remain valid.
- Falling back to an exact copy changes both the variant distribution and uniqueness count, but neither effect is defined.

The PRD should define integer rounding, small-piece behavior, what unit is reused, and whether percentages are per piece, long-run statistical targets, or weighted random choices.

### 9. Rest requirements conflict

The notes field includes `Rest`, implying that users control whether rests are available. The generation algorithm then says rest is always available regardless of selection and independently converts notes to rests with probability 0.1. This creates several ambiguities:

- Selecting or deselecting `Rest` may have no effect.
- A selection containing only `Rest` passes “at least one note” validation but leaves no pitched note for initial pitch or interval generation.
- “10% probability per note” does not say whether it applies to final events, split operations, or generated pitched candidates.
- It is unclear whether the first event can be a rest and how rests affect repeated bars and pitch transitions.

The product must decide whether `Rest` is user-controlled. If rests are always injected, `Rest` should not be presented as an ordinary pitch-class choice unless selecting it has separately defined behavior.

### 10. The CSP blocks the proposed inline playback script

The architecture requires a generated inline `<script>` block, while the CSP says `script-src 'self'` only. That policy does not permit an inline script without a nonce, hash, or an unsafe-inline allowance. Consequently, the required audio controls cannot work as specified.

This must be resolved at the requirements level by choosing a CSP-compatible interaction: for example, a locally served static module reading inert serialized event data, or a nonce-based inline script with explicit nonce generation and propagation requirements. Adding broad inline-script permission would weaken the page’s security and conflicts with the stated goal of allowing scripts only where needed.

The combination of `sandbox allow-same-origin allow-scripts` also deserves an explicit security rationale. The PRD should state what protection the sandbox is intended to provide and verify that its directives preserve that protection.

### 11. The MIDI API contract is insufficient for playback and tempo changes

The source ideas say the service returns a MIDI string; the PRD changes this to a `MidiEvent[]` without identifying the change as a resolved external contract decision. The event shape does not define:

- whether `note` is a MIDI note number and its valid range;
- whether `time` and `duration` are seconds, beats, ticks, or another unit;
- the ticks-per-quarter-note or original tempo if tick-based;
- velocity range;
- ordering and simultaneous events;
- hand/channel identity; or
- how malformed or overlapping events are handled.

A BPM slider cannot correctly retime events unless timing is represented in tempo-independent musical units or conversion metadata is supplied. The response must also be demonstrated to represent exactly the same piece as the SVG. The contract needs units, ranges, ordering, versioning, and validation rules.

### 12. The PDF flow has no defined source-of-truth or request contract

Generated pieces are ephemeral, but `/etude/pdf` needs the LilyPond code from the prior generation. The PRD does not say whether the browser posts:

- raw LilyPond source;
- the complete `Piece` for server-side reconversion;
- a signed opaque token;
- a server-side identifier; or
- all original generation parameters, which would generate a different random piece.

This decision affects correctness, body limits, tamper resistance, CSRF exposure, and whether the downloaded PDF matches the displayed SVG. The route’s request schema, maximum size, validation, timeout, error response, `Content-Disposition` filename, and content-type verification must be specified.

## Major findings

### 13. The external-service contract and failure behavior are incomplete

“Appropriate HTTP status code” is not a usable API contract. The PRD should define at least:

- request and response content types and character encoding;
- maximum request and response sizes;
- timeout behavior for both render and PDF calls;
- malformed JSON, missing fields, invalid MIDI events, invalid SVG, and unexpected content type;
- authentication failures, rate limiting, and transient versus permanent errors;
- whether retries occur and, if so, for which failures;
- cancellation when the client disconnects; and
- user-visible behavior and response status for each failure category.

The timeout environment variable also needs a valid range and behavior for missing or malformed configuration.

### 14. Returned SVG and generated script data cross a trust boundary

The Worker embeds SVG returned by an external service into an authenticated page. SVG can contain scripts, event handlers, external references, links, and other active content. The PRD does not require sanitization, safe image embedding, or a trusted-content guarantee in the service contract.

Likewise, serializing MIDI/event data into JavaScript requires an encoding rule that prevents script-context injection. The requirements should define safe rendering and serialization boundaries rather than assume all successful upstream responses are safe.

### 15. Error handling is too generic and logging is absent

The user stories collapse service timeout, unavailability, and upstream errors into generic page messages. There are no requirements for:

- preserving form values after generation or PDF failures;
- preventing duplicate submissions;
- distinguishing validation errors from temporary service failures;
- handling sample-loading or browser-audio initialization failures;
- handling playback attempted before samples load;
- making Play/Stop state visible and consistent;
- logging generation or service failures with a request/correlation identifier;
- recording latency and upstream status for diagnosis; or
- ensuring URLs, authorization headers, LilyPond source, and secrets are not logged inappropriately.

A requirements-only review does not need a logging implementation, but it should define the observable and operational outcomes needed to support the feature.

### 16. Form validation is incomplete

The validator description omits BPM even though BPM is submitted state. It also does not define behavior for fractional or nonnumeric measure counts, duplicate checkbox values, unknown note/duration/octave values, multiple hand values, oversized submissions, or a `Rest`-only submission. HTML constraints are not a replacement for server-side rules.

The PRD says validation failures redirect with an error but does not define whether submitted values survive that redirect. That omission conflicts with the broader requirement to quickly correct and regenerate from previous values.

### 17. Audio behavior is not sufficiently specified

The PRD does not define:

- whether BPM changes during playback take effect immediately or on the next play;
- whether Play restarts, resumes, or is ignored when already playing;
- whether Stop rewinds;
- what happens when playback reaches the end;
- how browser autoplay restrictions and `Tone.start()` user activation are handled;
- loading, disabled, and error states for Salamander samples;
- sample asset URL mapping, supported pitch range, and fallback behavior; or
- cleanup when regenerating or navigating away.

“Salamander piano samples” also needs an asset source, version, licensing decision, and deployment-size/cache expectations. “No CDN dependencies” means the samples as well as Tone.js must be available locally.

### 18. Music-notation semantics are incomplete

Stem direction alone does not define readable piano notation. The PRD should decide:

- whether both-hand output uses a grand staff and which clefs are used;
- which staff is used for left-only and right-only pieces;
- how enharmonic selections are spelled (`C#` versus `Db`);
- the octave-numbering convention, especially at C boundaries;
- beaming and beat grouping, particularly in 6/8;
- whether ties are allowed or forbidden;
- how rests are placed per staff; and
- whether the generated MIDI and notation must be structurally equivalent.

The statement that enharmonic spelling “does not matter” is questionable for a sight-reading practice tool: accidental spelling directly affects what the student sees and practices.

### 19. Resource and concurrency limits are not defined

The maximum of 32 two-hand measures, SVG generation, MIDI events, script serialization, and PDF rendering can produce materially different workloads depending on selected durations. The PRD provides no maximum generated-note count, LilyPond source size, upstream response size, generation time, or overall request deadline. It also does not define behavior for repeated Generate clicks or overlapping PDF requests.

These limits are necessary both for reliable Worker execution and for a complete external-service contract.

### 20. Accessibility requirements are absent

The generated sheet music and custom audio controls require explicit accessibility behavior. At minimum, the PRD should require labeled form controls and validation errors, keyboard-operable playback controls, an accessible BPM value, disabled/loading states, focus management after errors or generation, and a useful text alternative or description for the generated score. The SVG must not introduce inaccessible or unsafe interactive content.

### 21. Testing decisions focus partly on implementation rather than behavior

The proposed Tone.js tests verify generated code structure and function exposure. That locks tests to the chosen implementation but does not establish that a user can load samples, play, stop, and change tempo under the CSP. Similarly, listing “interval probability selection” does not define a statistically robust acceptance threshold.

The test requirements should include:

- exhaustive rhythm-feasibility tests over accepted meter/duration combinations;
- property-based invariants for measure sums, selected pitches/octaves, maximum jumps, hand ordering, and termination;
- explicit infeasible-input behavior;
- seeded randomness or injected random sources for reproducible tests;
- statistical tests with stated sample sizes and tolerances where distribution matters;
- contract tests for all LilyPond response classes and malformed payloads;
- browser tests proving CSP-compatible playback behavior and audio control state;
- PDF identity and download-header tests; and
- safe SVG/script-data rendering tests.

### 22. Requirements and implementation notes are mixed and duplicated

Many user stories describe implementation details rather than user outcomes, including Worker execution, CSP directives, body limits, local library placement, and data structures. Several stories duplicate later sections. The `Further Notes` section also names concrete source files despite the PRD template explicitly saying not to include file paths because they become stale.

This does not by itself make the feature incorrect, but it makes the PRD harder to maintain and obscures acceptance criteria. Technical constraints should live once under implementation decisions; user stories should describe externally valuable behavior.

## Source-fidelity issues

The PRD introduces decisions that are not present in the original ideas and does not identify them as assumptions or interview outcomes:

- time signatures are limited to four choices;
- measures are limited to 1–32;
- octaves are fixed to 2–6;
- default values are introduced;
- unique-bar and repeat-variant percentages are introduced;
- the LilyPond response changes from a MIDI string to an event array;
- rest becomes available regardless of selection;
- PDF gets a new `/etude/pdf` route and unspecified proxy protocol;
- generation is explicitly assigned to the Worker; and
- the one-hand data representation changes from always-left in the source ideas to always-right in the PRD.

Some of these may be sensible resolutions, but the documents supplied for this review do not provide the decision rationale. The PRD should distinguish source requirements, deliberately resolved design decisions, and author assumptions. Otherwise issue generation will treat inventions and contradictions as approved requirements.

## Recommended decisions before issue generation

1. Define a canonical musical time unit and exact numeric values for every duration and meter.
2. Define which meter/duration combinations are accepted and the observable error for infeasible combinations.
3. Replace or fully specify the splitting process so termination and exact measure filling are guaranteed.
4. Define interval direction, constrained probability sampling, boundary behavior, rests in pitch state, and reproducible randomness.
5. Decide whether repetition means bars, multi-measure phrases, intra-bar motifs, or a defined combination.
6. Define small-piece rounding and the unit, counting, and fallback semantics for all reuse percentages.
7. Decide whether `Rest` is user-controlled and define `Rest`-only and first-event behavior.
8. Define fixed hand ownership, one-hand representation, two-hand range feasibility, crossing/unison rules, and independent-rhythm overlap semantics.
9. Define notation semantics: staffs, clefs, enharmonic spelling, octave convention, beaming, rests, and ties.
10. Finalize a versioned LilyPond render/PDF contract with timing units, ranges, validation, size limits, and error schemas.
11. Define how PDF generation identifies the exact displayed piece without trusting arbitrary client input.
12. Choose a CSP-compatible playback design and safe serialization strategy.
13. Define safe handling of externally returned SVG and all other upstream content.
14. Define audio loading, playback state, BPM-change behavior, failure behavior, sample provenance, and cleanup.
15. Define user-facing error recovery, form-value preservation, server logging, metrics, correlation, and secret-redaction requirements.
16. Define accessibility acceptance criteria for the form, generated score, errors, and audio controls.
17. Revise testing requirements around externally observable behavior, invariants, failure cases, and explicit statistical tolerances.
18. Move technical constraints out of user stories, remove stale-prone file paths, and replace `Open Questions: None` with the unresolved decisions and owners.

Until these decisions are resolved, issue generation would force implementers to invent product behavior and would likely produce incompatible solutions across the generator, converter, route, rendering service, and browser playback modules.
