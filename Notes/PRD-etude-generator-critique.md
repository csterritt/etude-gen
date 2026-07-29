# Critique: PRD — Etude Generator

## Review scope

This is a requirements-only review of `Ideas.md` and `PRD-etude-generator.md`, performed before issue or task generation. It evaluates traceability, completeness, correctness, edge cases, error handling, logging, security, accessibility, testability, and implementation feasibility.

## Overall assessment

The PRD is well organized and preserves much of the original product intent. It gives unusually useful detail about the server-driven wizard, external rendering contract, module boundaries, and test strategy. It is not ready for issue generation, however. Several requirements conflict with one another or cannot produce the promised behavior.

The most serious problems are:

1. A PDF cannot reliably represent the score shown to the user because pieces are not persisted and the result form retains only generation parameters.
2. The rate limit prevents the expected Generate-then-PDF workflow.
3. The rhythm algorithm accepts duration selections that cannot fill the selected meter and does not guarantee termination.
4. “Repeated phrases” are not actually repeated because repetition occurs before pitches are assigned.
5. The `Piece` model lacks key and time-signature metadata required by the stated `lilypond-emitter` interface.
6. The specified score text alternative describes the request, not the generated music, and therefore is not a useful alternative to the score.

**Recommendation:** resolve all Critical and High findings and revise the testing decisions before converting this PRD into issues.

## Findings

### Critical

#### C1. PDF output is not tied to the displayed piece

**Evidence**

- The PRD says generated pieces are not persisted.
- The result-page form is described as carrying the generation choices in hidden fields.
- The generator is randomized.
- `/pdf` requires LilyPond source for a particular piece.

If the PDF action reconstructs a piece from the parameters, it will normally generate a new random etude rather than download the score currently displayed. The PRD nevertheless promises a printable version of “the generated piece.”

**Required resolution**

Define one authoritative mechanism that binds the PDF to the displayed score. Viable designs include:

- retain a signed, integrity-protected serialization of the generated `Piece` for the PDF request;
- persist the piece temporarily under an opaque identifier owned by the user;
- have one service call produce/cache both SVG and PDF representations of the same LilyPond source; or
- return the PDF from the exact LilyPond source retained from the SVG generation, with tamper protection and explicit size limits.

Specify expiration, ownership checks, tamper handling, and behavior when the retained representation is unavailable. Add an acceptance test proving the PDF and SVG are derived from the same `Piece`.

#### C2. Rate limiting makes the normal PDF workflow fail

**Evidence**

- The limit is one service invocation per minute per user.
- Both SVG generation and PDF download consume the same limit.
- The intended result page offers PDF immediately after generation.

A user who successfully generates an SVG will be rate-limited if they immediately click PDF. This directly conflicts with the primary workflow.

**Required resolution**

Define what the limit protects and model it accordingly. For example, rate-limit creation of a new randomized piece but permit rendering/downloading another representation of that same piece, or cache both output formats from one generation. Also specify:

- whether failed and timed-out service calls consume the limit;
- whether validation failures consume it;
- whether concurrent requests are atomically limited;
- the response status and retry information;
- whether the timestamp records attempt start or successful completion; and
- how retries after a service error interact with the limit.

#### C3. Valid form selections can be impossible to generate

**Evidence**

The only duration validation is “minimum 2.” That does not ensure that the chosen durations can exactly tile the selected bar length. Examples include:

- half + whole in 3/4 or 6/8: units 4 and 8 cannot total 6;
- dotted quarter + whole in 4/4: units 3 and 8 cannot total 8; and
- half + whole in 2/4: only a half can fill the bar, so the second selected duration can never appear.

The splitting loop cannot fix an arithmetically impossible selection. The PRD also says a random coin may stop continued splitting but never defines its probability or a maximum number of iterations.

**Required resolution**

Define meter-aware feasibility validation. A valid selection must be capable of composing the exact bar total, and the generation algorithm must have a demonstrable termination condition. Decide whether every selected duration must be eligible to appear or merely whether at least one valid composition exists. Define the continuation probability and behavior when no legal split exists. Prefer generation from legal duration compositions over unconstrained random splitting if that makes correctness easier to guarantee.

Add exhaustive tests for every supported meter × non-empty duration subset, including impossible subsets and subsets where some selected durations are unusable.

#### C4. Bar repetition does not produce repeated musical phrases

**Evidence**

The PRD repeats bars while rhythms are being built, then assigns pitches by independently walking each bar. A copied bar therefore receives new pitches. At most, its rhythm repeats; the one-bar musical phrase does not.

This does not satisfy the source requirement for “occasional repeated one-bar phrases” or the user story promising recognizable phrases.

**Required resolution**

Define whether repetition means rhythm only or the complete musical content. To preserve the original requirement, perform phrase duplication after pitch and rest assignment, copying rhythm, rests, pitches, and both hands as the selected repetition mode requires. Specify whether a repeated phrase must be an exact copy, whether transposition is allowed, and how repetition works for one-hand versus two-hand pieces.

#### C5. The internal representation cannot support the emitter interface

**Evidence**

`Piece` is described as only a hierarchy of measures and per-hand notes. The `lilypond-emitter` accepts only `Piece`, but must emit a key signature and time signature. Bar totals cannot distinguish 3/4 from 6/8 because both total six eighth-note units.

**Required resolution**

Add all presentation-independent musical semantics required to reproduce the score to `Piece`, including at least key, meter, selected/generated hand configuration, measures, voices/hands, notes/rests, pitches, and durations. Alternatively, explicitly pass score metadata alongside `Piece`, but then revise the stated module interface and serialization requirements. Define pitch spelling rather than storing only an enharmonic numeric pitch if the chosen key must be notated correctly.

### High

#### H1. The PRD silently changes the source’s 6/8 arithmetic

`Ideas.md` says 6/8 totals 12 internal beats while also saying an eighth note equals one unit and a dotted half fills the bar. Those statements conflict: six eighth notes total 6 units, not 12. The PRD uses 6, which is musically and internally consistent, but it does not identify this as a correction.

**Required resolution:** record an explicit decision that 6/8 contains six eighth-note units and correct the source discrepancy. Define whether beat grouping in 6/8 must be represented as two dotted-quarter beats, because mathematically totaling six eighth notes is not sufficient for idiomatic notation or beaming.

#### H2. Several product constraints were introduced without traceable rationale

The minimum of three pitches and minimum of two durations do not appear in the original ideas. They exclude legitimate technical exercises, such as repeated-note studies or a single-rhythm exercise. The exact 10% repetition probability and the 50/50 whole-bar versus per-hand repetition policy also do not appear in `Ideas.md`, despite the Further Notes saying algorithm constants come directly from the ideas document and design interview.

**Required resolution:** identify these as explicit stakeholder decisions with rationale, or remove them. The PRD should distinguish source requirements, interview decisions, and engineering proposals. Do not claim “Open Questions: None” while consequential constraints remain unsupported in the supplied inputs.

#### H3. Pitch continuity and interval behavior differ from the source and are underspecified

The source describes choosing intervals “from one note to the next.” The PRD resets pitch uniformly at every bar and after every rest, substantially weakening melodic continuity. Candidate weighting also does not literally select an interval from the supplied distribution and then choose up/down equally: range boundaries and the selected pitch set alter the realized distribution.

**Required resolution:** decide whether the random walk continues across bar lines and rests. Define the exact boundary policy: renormalize legal candidates, resample an illegal direction/interval, reflect direction, or reset. State whether simultaneous hands have independent pitch walks. Tests should assert the selected policy rather than loosely asserting that output “sounds plausible.”

#### H4. The accessibility alternative is not equivalent or useful enough

The exact alternative text contains only key, meter, measure count, hands, and selected pitches. It does not describe the generated notes, rhythms, rests, or repeated phrases. It describes generation parameters rather than the generated score and therefore conflicts with the requirement for a useful text alternative.

**Required resolution:** define an accessible representation of the actual score. This could be a structured measure-by-measure textual transcription, an accessible table/list per hand, or another recognized accessible music representation. Parameter summary text may supplement but should not be called an alternative to the score. Include keyboard navigation, heading/landmark expectations, and automated plus screen-reader-oriented acceptance checks.

#### H5. The SVG security boundary is under-specified and under-tested

The PRD requires sanitization but does not define an allowlist or handling for external references, `foreignObject`, embedded CSS, URL-bearing attributes, data URLs, animation, or malformed/non-SVG output. The sanitizer is explicitly denied unit tests even though it processes untrusted output crossing a service boundary. E2E coverage alone is not adequate for adversarial sanitizer cases.

**Required resolution:** define a strict SVG sanitization policy, response size limit, SVG root/content validation, and failure behavior. Add focused unit tests containing scripts, event handlers, external URLs, `foreignObject`, malicious styles, malformed markup, and oversized responses. Confirm that DOMPurify plus jsdom is compatible with the actual Cloudflare Workers runtime and bundle constraints; if not, select a runtime-compatible approach before issue generation.

#### H6. The external renderer is a blocking dependency that is out of scope

The PRD says the renderer does not yet exist and is outside this PRD’s implementation scope, but the product has no usable generation or PDF path without it. “Current stable release” is also not reproducible and can change output or compatibility without an application change.

**Required resolution:** declare the external service as a prerequisite with an owner, delivery contract, integration environment, health expectations, and version compatibility. Pin or report a tested LilyPond version instead of relying on an unbounded “current stable” version. Define availability expectations and how the application behaves when the dependency is unavailable.

#### H7. The external-service contract lacks defensive limits and response rules

Missing requirements include request/response size limits, content-type validation, malformed JSON handling, malformed SVG/PDF handling, redirect policy, PDF signature validation, filename/content-disposition behavior, and correlation-ID propagation. A generic service message may still contain unsafe or unexpectedly large text.

**Required resolution:** specify bounded response parsing, accepted content types, redirect behavior, generic local user messages, safe logging limits, and a correlation header shared with the renderer. State that bearer tokens and LilyPond source are never logged. Define whether the service base URL includes a path and how endpoint URLs are constructed.

#### H8. Wizard navigation and request semantics are incomplete

The single GET/POST path design does not define how GET selects a step, what refresh does after POST, whether Post/Redirect/Get is used, whether Back validates fields on the step being left, or how forged/stale hidden state is handled. “Back navigation to any step” conflicts somewhat with “a Back button on every step” and is not concretely specified.

**Required resolution:** provide a transition table for every step and action, including invalid actions, skipped Step 3, changing an earlier choice that invalidates later choices, refresh/resubmission, direct GET, and expired sessions. Require full server validation at the trust boundary while allowing Back navigation without trapping users behind irrelevant forward validation. Define CSRF protection or explicitly reference the base application mechanism.

#### H9. The rate-limit schema is not enough to guarantee the stated limit

A `lastGenerationAt` row does not by itself specify an atomic check-and-update. Two concurrent requests can both observe an old timestamp and proceed. Foreign-key behavior, timestamp precision, cleanup, and account deletion behavior are also omitted.

**Required resolution:** specify an atomic enforcement operation or another concurrency-safe design. Define user relationship/cascade behavior, precision and clock source, migration behavior, and whether stale rows are retained indefinitely.

### Medium

#### M1. Summary-page PDF behavior differs from the source

`Ideas.md` places Generate and PDF controls in the final approval flow, while the PRD provides PDF only on the result page. The source wording is somewhat ambiguous because a PDF requires generated music, but the change should not be silent.

**Required resolution:** explicitly decide whether PDF appears on Summary, Result, or both, and define whether selecting PDF from Summary generates a piece directly as PDF or first shows the SVG result.

#### M2. Musical notation requirements are incomplete

The PRD does not define clefs, grand-staff versus single-staff layout, staff assignment, key-signature spelling, octave notation, measure grouping, final barlines, beaming in 6/8, title/metadata, or how all-rest measures are rendered. “Clef changes” being out of scope does not establish the initial clef.

**Required resolution:** specify minimum engraving rules for each hand mode and meter. Define whether all-rest bars and all-rest pieces are valid. State whether right/left stem direction applies to single-hand scores as well as two-hand scores.

#### M3. Rest timing is ambiguous

The PRD says each note has a 10% chance to become a rest but does not clearly state whether this happens before or after second-hand rhythm copying and bar repetition. This changes whether hands share rests and whether repeated phrases preserve rests. It also allows an entire piece to become rests, albeit with low probability.

**Required resolution:** order every generation phase explicitly and define whether rests are copied as part of rhythm/phrase repetition. Decide whether at least one pitched note per hand, bar, or piece is required.

#### M4. Error behavior is too generic

“All selections preserved” does not define HTTP statuses, error-summary structure, malformed hidden-field behavior, renderer authentication/configuration errors, invalid configuration at startup, or what users see if sanitized SVG becomes empty. Logging requirements do not distinguish expected validation/rate-limit events from operational errors.

**Required resolution:** create an error taxonomy covering validation, authentication/session expiry, rate limit, timeout, renderer 4xx/5xx, malformed response, sanitization failure, and configuration failure. For each, define user response, status, retryability, state preservation, focus destination, and log level/fields. Avoid logging expected field validation as an operational error unless explicitly desired.

#### M5. Testing decisions miss critical behaviors and contain potentially flaky assertions

There is no explicit test that PDF matches SVG, no PDF happy/failure E2E path, no sanitizer unit suite, no concurrency test for rate limiting, no malicious SVG cases, no accessibility audit, and no exhaustive duration-feasibility tests. “Rests present” cannot be guaranteed in every randomized piece, and statistical frequency assertions can be flaky even with an injectable random source if not carefully designed.

**Required resolution:** use deterministic scripted random sources for branch behavior, property/invariant tests across many fixed seeds, and separate non-flaky statistical characterization if needed. Add the missing security, PDF-fidelity, concurrency, navigation, and accessibility cases. Test exact phrase repetition rather than rhythm-only repetition.

#### M6. Success criteria are absent

The PRD states functionality but has no release acceptance criteria or measurable product/operational outcomes. It is therefore unclear what minimum behavior qualifies as complete beyond individual stories.

**Required resolution:** define a release gate, including supported happy paths, correctness invariants, renderer integration readiness, accessibility checks, security tests, latency/timeout expectations, and acceptable failure behavior. Product analytics need not be added if intentionally out of scope, but that decision should be explicit.

#### M7. “Physically playable” is an overclaim

Keeping left-hand pitches below right-hand pitches does not ensure physical playability. Range, span, leaps, rhythm, and simultaneous motion also affect playability.

**Required resolution:** change the claim to the actual guarantee—non-crossing hand pitch sets—or add concrete playability constraints.

## Source-to-PRD coverage summary

### Preserved well

- Authenticated student-only application with no teacher role.
- Server-driven multi-step form with hidden accumulated state and Back navigation.
- Supported measure range, keys, meters, hand modes, pitch classes, duration choices, and octaves.
- Presentation-independent internal representation as a goal.
- Server-side validation and state preservation.
- External bearer-authenticated LilyPond rendering with timeout.
- Sanitized embedded SVG and PDF download as product capabilities.
- Correlation-aware logging without PII or secrets.
- Accessibility as an explicit requirement.
- Unit and E2E testing split consistent with project conventions.

### Changed, invented, or unresolved

- 6/8 changed from 12 source units to 6 PRD units; this is the correct arithmetic but needs an explicit correction record.
- Minimum pitch and duration counts were added.
- Exact phrase-repetition probability and two-hand repetition policy were added.
- Pitch walks reset at bars and rests, which was not in the source.
- PDF moved from the final approval wording to the result page.
- Rate limiting was extended to PDF rendering in a way that breaks the intended workflow.
- Exact alternative text was added but does not meet the source’s “useful description” requirement.

## Decisions required before issue generation

1. How is the exact generated `Piece` retained and bound to PDF download?
2. What actions consume rate-limit capacity, and how can a user download PDF immediately after SVG generation?
3. Which duration selections are valid for each meter, and how does rhythm generation guarantee termination?
4. Does phrase repetition copy exact pitches, rests, and both hands?
5. Does pitch continuity cross bars and rests, and what is the interval boundary policy?
6. What metadata belongs in `Piece` so it can be rendered independently?
7. What is the accessible equivalent of the actual generated score?
8. Are minimum pitch/duration counts and invented repetition constants approved product decisions?
9. What are the initial clef/staff and 6/8 grouping rules?
10. What renderer version, readiness dependency, response limits, and security contract apply?
11. What is the atomic rate-limit operation and failure-consumption policy?
12. What are the exact wizard transitions, refresh semantics, CSRF expectations, and stale-state rules?

## Recommended readiness gate

The PRD should proceed to issue generation only after:

- all Critical and High findings have explicit resolutions in the PRD;
- `Open Questions` reflects unresolved decisions rather than claiming none;
- the `Piece` and renderer interfaces are internally consistent;
- the Generate → Result → PDF workflow is possible and testable;
- generation is proven total for every accepted parameter combination;
- exact phrase-repetition semantics are defined;
- the sanitizer receives dedicated adversarial unit coverage;
- error and rate-limit state transitions are specified; and
- acceptance tests cover PDF fidelity, concurrency, accessibility, malformed renderer output, and every meter/duration feasibility class.
