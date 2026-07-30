# Critique: PRD — Etude Generator

Reviewer posture: skeptical senior engineer doing a requirements-only review. Source inputs: `Notes/Ideas.md` (original brain dump), `Notes/PRD-etude-generator.md` (PRD under review), `Notes/all-rhythms.txt` (authoritative rhythm catalog). Git history was not examined, per instruction.

Overall: this is a strong, unusually thorough PRD. The module decomposition is clean, the concurrency/cooldown model is precise, the failure boundaries are well typed, and the testing strategy is disciplined. The critique below is therefore mostly edge cases, undeclared deviations from `Ideas.md`, and a few genuine logic gaps — not a wholesale rejection.

---

## 1. Deviations from `Ideas.md` (source intent)

These are places where the PRD adds, removes, or changes behavior relative to the brain dump without flagging the change. Some are improvements; some are scope creep. All should be acknowledged explicitly so the product owner can confirm.

1. **Left-hand duplicate bars are introduced (15% overall).** `Ideas.md` describes the second hand as: for *any* bar, 25% same-rhythm-as-right / 75% new random rhythm, then pitch generation. It never mentions exact duplicate bars for the second hand. The PRD adds a 20% duplicate roll inside the 75% branch for *later* left-hand bars (yielding 15% duplicate / 60% independent). This is new behavior. Confirm it is desired, and decide whether the first left-hand bar should also be eligible for duplication (the PRD excludes it).
2. **Linear recency weighting for repeated-bar source selection is new.** `Ideas.md` only says "a duplicate of a previous bar." The PRD weights prior bars oldest=1 … newest=N. Reasonable, but it is an invented distribution and will materially affect the musical result. State that this is a design choice, not a derived requirement.
3. **Repeat eligibility gated on ≤12-semitone entry transition is new.** `Ideas.md` has no such constraint. It interacts with the gap in §3 below.
4. **First-note 10% rest chance is invented.** `Ideas.md` says "choose a random pitch … (or a Rest)" without a probability. The PRD fixes it at 10%. A piece that opens with a rest is musically odd; confirm 10% is intended for position 1, or special-case the very first note of the piece to be pitched.
5. **Hidden-field form on the score page is removed.** `Ideas.md` explicitly wants "the same form for generation with hidden fields documenting the user's choices." The PRD replaces this with server-stored state + workflow version and explicitly rejects client assertions of ownership/content. This is a better design, but it is a deliberate reversal of the source idea and should be called out as such.
6. **`GET /etude` becomes a redirect, not the main page.** `Ideas.md` says `/etude` GET is the main etude generation page. The PRD makes it a redirect to the canonical current-state route. Fine, but it is a change.
7. **SVG is stored in private R2 and re-fetched per render, not embedded directly from the service response.** `Ideas.md` says "embed the SVG in the page returned to the browser." The PRD's R2 detour is justified by the D1 2 MB / 5 MB SVG ceiling (good), but it adds a storage round-trip and a cleanup lifecycle that `Ideas.md` never contemplated. Acknowledge the architectural escalation.
8. **LilyPond response contract is multipart + metadata, not a plain SVG.** `Ideas.md` says the service "will return an SVG of the sheet music or an error message." The PRD imposes a multipart response with one `output` file part, one JSON `metadata` part, version string, warnings array, and strict size/counts. See §5 — this is the biggest undeclared dependency in the document.

---

## 2. Missing or incomplete elements

1. **No rule for the minimum pitch count in two-hand mode.** "At least one pitch is required" is the only pitch cardinality rule. But the split step requires "a boundary between adjacent selected pitches" with both sides non-empty. With exactly one selected pitch there is no boundary and the split step is unsatisfiable. Add: two-hand mode requires ≥2 selected pitches, and define the notes-step validation message when this is violated.
2. **Behavior of `GET /etude/score` with no current Piece is not stated.** The prerequisite-redirect rule covers setup/notes/split/review, but the score route is not explicitly listed. State that it redirects to the earliest incomplete step (or to setup) when no Piece exists.
3. **Attachment filename "fixed safe pattern" is unspecified.** State the pattern (e.g. `etude-<short-id>.pdf`) so tests can assert it and so operators know what to expect.
4. **No focus target after successful generation/render.** "Successful full-page navigation relies on logical heading order and browser navigation behavior." For a screen-reader user, after `POST /etude/generate` → `GET /etude/score`, focus lands at the page top, not the score. Consider moving focus to the score region/heading on the score page. This is a minor a11y gap relative to the otherwise strong a11y section.
5. **No stated behavior for setup/notes/split POST rate limiting.** Only generation and PDF have cooldowns. A signed-in user can spam the cheap POSTs. If "existing authentication and request protections" are intended to cover this, say so; otherwise note it as accepted risk.
6. **Sign-up mode interaction is not mentioned.** The project supports open/gated/interest/no sign-up modes. The PRD only says "existing authenticated session middleware." Confirm the etude routes behave identically across all four sign-up modes (they should, since they only require a session), and state it.
7. **No explicit retention/cleanup story for an orphaned PDF whose owner never returns.** The PRD says this is out of scope for v1 ("not guaranteed") and that orphans are logged. Acceptable, but there is no operator-facing list/query for these orphans beyond logs. Confirm logs are the intended operator interface.

---

## 3. Logic correctness and edge cases

1. **Interval-weighted transition with zero eligible targets is undefined.** "Each available target pitch no more than 12 semitones away receives the supplied probability weight … normalized and sampled." If the current hand's selected pitches are all >12 semitones from the current pitch (plausible after a split that leaves a sparse left-hand set, or after a repeated bar whose last pitch is far from the rest of the range), the normalized distribution is empty. Define the fallback: e.g. fall back to uniform across the hand's selected pitches, or treat as a generation invariant failure. This is the most important logic gap in the document.
2. **"Current pitch" state after a repeated/mirrored bar is not defined.** Repeated bars copy pitches exactly; mirrored bars copy only rhythm/rests and generate fresh pitches. The PRD does not say what pitch the *next* fresh bar transitions from. Presumably the last pitched event of the just-completed bar (copied or freshly generated), but it must be stated, including across a trailing rest run.
3. **Left-hand first pitched event selection is not defined.** For the first left-hand bar — whether mirrored or independent rhythm — the PRD does not say how the first pitched event is chosen. Presumably uniform across the left-hand range (analogous to a fresh hand), but it is not stated, and the 10% first-position rest rule should be explicitly applied or excluded here.
4. **"Current pitch" persistence through rests is not stated.** "After a rest, the next pitch is uniform across the hand's selected pitches." Clear for the immediate next event. But if there are several rests in a row (different durations), does the "current pitch" remain the last pitched event throughout, or is it forgotten? The interval rule only applies "after a pitched event," so presumably it persists — state it.
5. **Rest-probability mass when rests are disallowed.** "Every freshly generated later position also has a 10% rest chance when the rest rule permits it." When the rest rule does not permit a rest (same duration as previous rest), is the 10% simply reassigned to pitch selection (i.e. 100% pitch), or is there a re-roll? State the resolution.
6. **Repeat eligibility checks only the entry transition, not the exit.** "A repeated source whose opening pitched event would require a transition over 12 semitones is ineligible." The transition *out* of a repeated bar (its last pitch → next bar's first pitch) is not checked, and can produce the zero-eligible-target situation from §3.1. Either check both ends, or rely on the §3.1 fallback (once defined).
7. **Carve-outs for the consecutive-rest rule create an inconsistency.** The rule is "a rest may follow a rest only when the durations differ," but repeated-bar and mirrored-rhythm paths may "override" it at measure boundaries, producing two same-duration rests back-to-back. This is acknowledged but musically questionable and makes the rule non-authoritative. Either tighten (forbid same-duration repeats even via copy) or document explicitly that this is an accepted musical trade-off.
8. **Lock-replacement race while the original request is still running.** "An expired lock may be atomically replaced by a later request." If the original request is genuinely still running (slow LilyPond, <60 s is tight given the 30 s timeout plus sanitization/R2), a second request can replace the lock and start a second generation. The PRD says conditional writes enforce workflow versions and lock acquisition, but does not explicitly state that a write must verify the *current lock owner/ID* matches the request's lock, not merely that *a* lock exists. State the ownership check explicitly to close the race.
9. **PDF download interrupted after grant consumption.** The download GET "atomically consumes the grant, and initiates object cleanup." If the network drops mid-stream after consumption, the user has a consumed grant, a deleted/being-deleted object, and no PDF. Story 58 sends them back to the score with a safe error. Confirm this is acceptable, or consider consuming the grant only after successful response completion (harder on Workers, but worth a sentence).
10. **First-note rest at the very start of the piece.** Combined with §1.4 above: a 10% chance the piece opens with a rest is musically strange and likely unwanted. Special-case the first event of the piece to be pitched.
11. **Two-hand independence can produce simultaneous dissonance.** No constraint relates the two hands' pitches. Acceptable for a random etude generator, but the PRD should at least acknowledge this is intentional rather than leave it implicit.

---

## 4. Error handling and logging

1. **Cooldown-start ordering is well specified, but lock release on failure is not.** The PRD carefully defines when cooldowns start (only after full success) and that failures don't consume them. It does not explicitly state that the in-flight lock is released on every non-success path (rendering failure, R2 failure, validation failure). State that lock release is unconditional on the non-success paths.
2. **"Generic retry message" for database failures is vague.** "Database failures preserve the prior committed aggregate where possible and produce a generic retry message." Define whether the user is told to retry immediately, wait, or contact support, and whether the correlation ID is shown (story 47 says yes for unexpected errors — confirm DB failures qualify as "unexpected").
3. **Orphan cleanup logging content is underspecified.** "Artifact deletion … logs the opaque object identifier and correlation ID." State the log fields explicitly so an operator script can find and reap them, since v1 has no sweeper.
4. **LilyPond service timeout vs. lock expiry coupling.** Default `LILYPOND_TIMEOUT_MS` is 30,000 ms; the in-flight lock expires at 60 s. A single SVG call cannot exceed the lock on its own, but SVG call + sanitization + R2 write + D1 update could approach 60 s under load. Document the expected ordering and that the lock expiry is a safety net, not the normal path.

---

## 5. External-service contract risk

1. **The multipart LilyPond response contract is imposed on an out-of-scope service.** The PRD says building/operating the LilyPond service is out of scope, yet it mandates a specific multipart shape (`output` + `metadata`), media types, size caps, metadata bounds, warning counts, version string, and JSON error shape. If that service does not already implement exactly this contract, the PRD has an undeclared build dependency. Either (a) confirm the service already speaks this protocol, or (b) move "LilyPond service contract conformance" into scope and add it to the module/test plan, or (c) simplify the client to match whatever the service actually returns. "Open Questions: None" is not defensible while this is unresolved.
2. **"Redirects to an unconfigured host are not followed" is ambiguous.** Does "unconfigured" mean any host other than the configured base URL's host? Are same-host redirects followed? State the rule precisely (recommend: follow no redirects, or follow only redirects to the exact configured host).
3. **Service-reported LilyPond version acceptance.** "Deployment acceptance verifies that version against the then-current stable release." This requires a runtime/CI check that knows the current stable release. Where does that knowledge come from (manual config, a fetched release index)? It is not in the configuration list. Add it or downgrade to "logged for operator review."

---

## 6. Best-practice and process concerns

1. **Minimal client TypeScript contradicts the project's own `AGENTS.md`.** The repo rules say "in general, do not implement client-side code. get explicit permission before implementing client-side code." The PRD grants that permission for Select all and duration-toggle disabling. That is fine, but the PRD should explicitly note that it is granting an exception to `AGENTS.md`, so a future reader doesn't treat the client TS as precedent.
2. **"Open Questions: None" is overconfident.** Given the items in §3 and §5 alone, this should be a non-empty list (at minimum: zero-eligible-target fallback, external service contract conformance, single-pitch two-hand rule, current-pitch state after repeated bars).
3. **`Score Presenter` is tested only via Playwright.** Every other module gets Bun unit tests; the score presenter's structured-text generation is pure logic (Piece → text) and is well suited to unit tests. The PRD's reason ("through Playwright behavior rather than dedicated unit tests") is weak. Recommend adding Bun tests for the text-alternative generator and reserving Playwright for the surrounding page chrome.
4. **No explicit non-functional targets.** Generation of a 32-measure two-hand piece, LilyPond call, sanitization, R2 write, and D1 update all within the 60 s lock — there is no stated latency budget or p95 target. Even a soft budget would help sizing.
5. **Rhythm catalog health check vs. runtime selection.** The catalog is validated at health-check time for "at least one pattern for every supported time signature," but eligibility for a *specific duration set* is computed at runtime. Confirm the health check also validates that every supported *duration token* appears in at least one pattern per meter, so that selecting a single duration can never produce an empty eligible set (otherwise the duration-prevention UX is the only safety net).

---

## 7. Minor / editorial

- §"Supported musical domain" lists supported minor keys as "A, E, B, F-sharp, C-sharp, D, G, C, and F natural minor." That is 9 keys; the major list is also 9. The "no more than four sharps or flats" rule is satisfied, but the list includes C-sharp minor (4 sharps) and F minor (4 flats) while omitting G-sharp minor (5 sharps, correctly excluded) — worth a sanity-check pass to confirm the boundary is exactly ±4 and the list is the intended 9 of each.
- "The unused staff remains empty" for one-hand pieces — confirm LilyPond renders an empty staff without a time signature / key signature confusion, or state that the unused staff still shows the key and time signature.
- "Interval weights … sum to approximately one" — the document should either state the exact sum or stop saying "approximately" and just say "treated as relative weights; normalized after filtering," which is what the Further Notes already says. The body and the notes are slightly redundant.
- Story 16 ("without client-side scripting") and the Implementation Decisions both describe the no-script fallback; consider folding story 16 into the implementation note to avoid two sources of truth.

---

## 8. Recommendations (priority order)

1. Define the fallback for interval-weighted transition when zero targets are within 12 semitones (§3.1). Blocks implementation.
2. Resolve the LilyPond service contract: confirm the service exists and speaks the mandated multipart protocol, or move it into scope (§5.1). Blocks implementation and deployment.
3. Add the ≥2-pitches-for-two-hand rule and the split-step validation message (§2.1).
4. Define "current pitch" state across repeated/mirrored bars, rest runs, and the left hand's first pitched event (§3.2–3.4).
5. State the lock-ownership check on write explicitly (§3.8) and unconditional lock release on failure (§4.1).
6. Replace "Open Questions: None" with the real open list (§6.2).
7. Acknowledge the `Ideas.md` deviations in §1 so the product owner can sign off.
8. Add Bun unit tests for the score text-alternative generator (§6.3).
9. Special-case the first event of the piece to be pitched (§3.10).
10. Specify the orphan-cleanup log fields and the PDF filename pattern (§2.3, §4.3).
