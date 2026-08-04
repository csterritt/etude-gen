## 2. Missing or incomplete elements

1. **No rule for the minimum pitch count in two-hand mode.** "At least one pitch is required" is the only pitch cardinality rule. But the split step requires "a boundary between adjacent selected pitches" with both sides non-empty. With exactly one selected pitch there is no boundary and the split step is unsatisfiable. Add: two-hand mode requires ≥2 selected pitches, and define the notes-step validation message when this is violated.
2. **Behavior of `GET /etude/score` with no current Piece is not stated.** The prerequisite-redirect rule covers setup/notes/split/review, but the score route is not explicitly listed. State that it redirects to the earliest incomplete step (or to setup) when no Piece exists.
3. **Attachment filename "fixed safe pattern" is unspecified.** State the pattern (e.g. `etude-<short-id>.pdf`) so tests can assert it and so operators know what to expect.
4. **No focus target after successful generation/render.** "Successful full-page navigation relies on logical heading order and browser navigation behavior." For a screen-reader user, after `POST /etude/generate` → `GET /etude/score`, focus lands at the page top, not the score. Please move focus to the score region/heading on the score page. This is a minor a11y gap relative to the otherwise strong a11y section.
5. **No stated behavior for setup/notes/split POST rate limiting.** Only generation and PDF have cooldowns. A signed-in user can spam the cheap POSTs. If "existing authentication and request protections" are intended to cover this, say so; otherwise note it as accepted risk.

---

## 3. Logic correctness and edge cases

2. **"Current pitch" state after a repeated/mirrored bar is not defined.** Repeated bars copy pitches exactly; mirrored bars copy only rhythm/rests and generate fresh pitches. The PRD does not say what pitch the _next_ fresh bar transitions from. Use the last pitched event of the just-completed bar (copied or freshly generated), but it must be stated, including across a trailing rest run.
3. **Left-hand first pitched event selection is not defined.** For the first left-hand bar — whether mirrored or independent rhythm — the PRD does not say how the first pitched event is chosen. It should match the first hand generation rules.
4. **Lock-replacement race while the original request is still running.** "An expired lock may be atomically replaced by a later request." If the original request is genuinely still running (slow LilyPond, <60 s is tight given the 30 s timeout plus sanitization/R2), a second request can replace the lock and start a second generation. The PRD says conditional writes enforce workflow versions and lock acquisition, but does not explicitly state that a write must verify the _current lock owner/ID_ matches the request's lock, not merely that _a_ lock exists. State the ownership check explicitly to close the race.

---

## 4. Error handling and logging

1. **Cooldown-start ordering is well specified, but lock release on failure is not.** The PRD carefully defines when cooldowns start (only after full success) and that failures don't consume them. It does not explicitly state that the in-flight lock is released on every non-success path (rendering failure, R2 failure, validation failure). State that lock release is unconditional on the non-success paths.
2. **Orphan cleanup logging content is underspecified.** "Artifact deletion … logs the opaque object identifier and correlation ID." State the log fields explicitly so an operator script can find and reap them, since v1 has no sweeper.
3. **LilyPond service timeout vs. lock expiry coupling.** Default `LILYPOND_TIMEOUT_MS` is 30,000 ms; the in-flight lock expires at 60 s. A single SVG call cannot exceed the lock on its own, but SVG call + sanitization + R2 write + D1 update could approach 60 s under load. Document the expected ordering and that the lock expiry is a safety net, not the normal path.

---

## 6. Best-practice and process concerns

3. **`Score Presenter` is tested only via Playwright.** Every other module gets Bun unit tests; the score presenter's structured-text generation is pure logic (Piece → text) and is well suited to unit tests. The PRD's reason ("through Playwright behavior rather than dedicated unit tests") is weak. Please add Bun tests for the text-alternative generator and reserving Playwright for the surrounding page chrome.

---

## 7. Minor / editorial

- "The unused staff remains empty" for one-hand pieces — the unused staff should show the key and time signature.
- Story 16 ("without client-side scripting") and the Implementation Decisions both describe the no-script fallback; consider folding story 16 into the implementation note to avoid two sources of truth.
