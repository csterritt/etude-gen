# Issues critique: Etude Generator

Skeptical senior-engineer review of the 20 issues in `Notes/issues/` against `PRD-etude-generator.md`. Each finding cites the issue(s) and the PRD section it relates to.

---

## 1. Missing elements (coverage gaps)

1. **`GET /etude/review` is not built by any issue.** The PRD lists `GET /etude/review` as a route and user story 27 says "I want to review every selection before generation, so that I can approve the complete configuration." No issue's "What to build" describes constructing the review page, and story 27 appears in no issue's "User stories addressed" list. Issue 8 references "review-completion state" in passing, and Issue 12 says "from the review page's Generate control" — both assume the review page already exists. This is the largest single gap: the review step is a prerequisite for Issue 12's generate action, yet nothing builds it. Add an issue (or fold it into Issue 8) that builds `GET /etude/review`, renders all selections as a read-only summary, and defines what marks review as complete.

2. **The PDF in-flight lock is missing from Issue 18.** The PRD ("Data and concurrency") states: "New-Piece generation and PDF generation each have two distinct controls: an in-flight lock that prevents concurrent work and a last-success timestamp that enforces a post-success cooldown." Issue 18 covers the PDF cooldown (the timestamp) but never mentions the PDF in-flight lock, owner-identifier verification, or concurrent-PDF rejection. Its acceptance criteria have no concurrent-PDF test. Add lock acquisition, per-owner conditional commit/release, and a concurrent-rejection criterion to Issue 18, mirroring Issue 12's generation-lock semantics.

3. **The "render-pending" score state is not clearly assigned to any issue that precedes Issue 12.** Issue 12 redirects to "the score or retry state" and says "the score route shows a render-pending state that Issue 16/17 completes." Issue 15 says it is "wired minimally into the render-pending score state." But Issue 15 is blocked by Issue 12 — so the render-pending state is built after the generate action that redirects to it. After Issue 12 lands, `GET /etude/score` has no rendering yet, and Issue 12's own acceptance criterion ("the resulting state (render-pending score)") cannot be verified until Issue 15. Either build a minimal score route in Issue 12 itself, or introduce a small issue before Issue 12 that creates the render-pending score page.

4. **Deployment-acceptance verification of the LilyPond version is not addressed.** The PRD ("Configuration and health") says "deployment acceptance verifies that version against the then-current stable release rather than hard-coding a permanent version." Issue 14 retains the version string as render metadata, but no issue describes the acceptance check against the current stable release. If this requires code or a CI step, assign it; if it is purely operational, say so explicitly in Issue 20.

5. **No issue defines what the student sees when Issue 2 rejects an invalid setup submission.** Issue 2 does bare validation ("rejected and no persisted state changes") and Issue 3 adds the error-summary UX (preserved values, focus, field links). Between Issue 2 and Issue 3, a rejected submission produces no guidance — the student sees a rejection with no error summary and no preserved values. State the interim behavior explicitly, or make Issue 3 a co-requisite of Issue 2 so validation and its UX land together.

---

## 2. Dependency and ordering problems

1. **Cross-cutting infrastructure (correlation IDs, PII-free logging) is deferred to Issue 20.** The PRD requires every request to carry an application-generated UUID (in logs and the `X-Correlation-ID` header) and all logs to be free of PII/secrets. Issue 20 — the last issue — adds these across all etude routes. Issues 1–19 build routes and modules without correlation IDs or logging hygiene, then Issue 20 retrofits them. Correlation IDs and structured-logging conventions should be established in Issue 1 and inherited by every subsequent issue; Issue 20 should only verify completeness.

2. **The coherent-state guarantee under D1/R2 failures is deferred to Issue 20.** The PRD's multi-resource ordering principle ("an R2 failure cannot make an artifact current without a matching D1 commit") is first exercised in Issue 12 (the first multi-resource operation). Deferring the coherent-state guarantee to Issue 20 means Issues 12–19 may not design for it. Establish the ordering principle and its test in Issue 12; reserve Issue 20 for cross-cutting verification.

3. **The rhythm-catalog parsing is buried in Issue 6, creating an unnecessarily long critical path for the Piece Generator.** Issues 9–11 (Piece Generator) are pure domain logic blocked by Issue 6 (the duration UI step). The Piece Generator needs the parsed rhythm catalog and the settings types — not the notes-step UI. The catalog parsing (a build-time/health-check concern) could be split into an earlier issue (or folded into Issue 2 alongside the Music Domain definitions), allowing Issues 9–11 to proceed in parallel with the UI chain (Issues 3–8).

4. **Issue 15 (Score Presenter) is blocked by Issue 14 (LilyPond Renderer), but its core deliverable only needs the Piece contract from Issue 9.** The pure Piece→structured-text behavior is independent of the renderer. The "missing or stale artifacts produce a retry state" part needs the artifact concept but not the renderer itself. Blocking on Issue 14 serializes work that could proceed in parallel with Issues 12–14.

5. **Issue 4 (octave ranges) is blocked by Issue 2 but not by Issue 3 (validation UX).** Issues 3 and 4 are both blocked by Issue 2 and can proceed in parallel. If Issue 4 lands first, the new octave-range field will not have the validation-UX pattern (error summary, preserved values, focus) that Issue 3 establishes. Either make Issue 4 blocked by Issue 3, or note that Issue 4 must retrofit the validation UX once Issue 3 lands.

6. **Issue 8 (workflow navigation) hardens all step pages retroactively.** Read-only summaries, Back links, prerequisite redirects, and upstream invalidation are applied across all steps in Issue 8 — after Issues 2–7 build the step pages without them. Each step page is effectively built twice. Consider building navigation incrementally with each step page, or accept the rework explicitly.

---

## 3. Logic correctness and edge cases

1. **Resubmitting a step with unchanged values is not addressed.** If the student navigates back to setup, changes nothing, and submits, does the workflow version increment? Does dependent state (notes, durations, split) clear? Issue 8 says "Changing setup selections clears all dependent note, duration, split, and review state" — but is a resubmission of identical values a "change"? Define whether unchanged resubmission is a no-op (no version bump, no clearing) or is treated as a change.

2. **"Review-completion state" is referenced but never defined.** Issue 8 mentions clearing "review-completion state," and the prerequisite-redirect logic depends on knowing whether review is complete. No issue defines what marks review as complete (visiting the page? an explicit approve action?) or how it is tracked. This is compounded by §1.1 — the review page itself is missing.

3. **Issue 12's supersession-then-rendering-failure path is split across issues without an integration criterion.** Issue 12 persists the new Piece and revokes the old SVG's reachability. If rendering then fails, the student sees retry state (Issue 17). But Issue 12's acceptance criteria don't test the "supersession succeeded, rendering failed" path, and Issue 17's criteria don't test the "old SVG already revoked" precondition. Add a criterion that spans both: after a replacement generation whose rendering fails, the old SVG is unreachable, the new Piece is preserved, and retry renders the new Piece.

4. **Changing the hand selection from "both" to "one hand" after a split is set is not explicitly tested.** Issue 8 says upstream changes clear dependent state including split. But switching from both-hands to one-hand also changes the pitch cardinality rule (≥2 becomes ≥1). If the student had exactly two pitches selected (valid for both-hands) and switches to one-hand, the notes selection is still valid but the split is now irrelevant. Issue 8 should clarify that hand changes clear split (already implied) and that the notes cardinality is re-validated against the new hand mode on the next notes visit.

---

## 4. Error handling and logging

1. **Issue 18 does not specify PDF in-flight lock release on failure.** Even once the PDF lock is added (§1.2), the issue should state that every non-success PDF path (service, validation, storage, conflict, commit failure) conditionally releases its own lock — mirroring Issue 12's generation-lock release semantics. Without this, a crashed PDF request could hold its lock until expiry.

2. **No issue specifies lock release for the render-retry path on failure.** Issue 17 says render retry "still uses the generation/render in-flight lock" and lists failure cases, but does not explicitly state that a failed retry conditionally releases the lock. Issue 12 states this for generation; Issue 17 should state it for retry.

3. **The interim error experience between Issue 2 and Issue 3 is a logging/testability gap.** If Issue 2 rejects invalid input without the Issue 3 error summary, the rejection may be a bare redirect or empty-form redisplay. This is not just a UX gap (§1.5) — it is also a testability gap: Issue 2's automated tests assert rejection but have no defined assertion for what the student sees. Define the interim error surface so tests can assert it.

---

## 5. Best-practice and process concerns

1. **The serial dependency chain is excessively long.** The primary chain (1→2→3→4→5→6→9→10→11→12→15→16→17→18→19→20) is 16 issues. Several links are unnecessary (§2.3–2.4). Parallelizing the Piece Generator (Issues 9–11) and the Score Presenter's pure text logic (Issue 15) against the UI chain (Issues 3–8) could shorten the critical path by 4–5 issues.

2. **Test-only diagnostic routes (Issues 9, 13) are not scoped for removal.** Issue 9 mentions "a temporary diagnostic output (e.g. JSON dump on a test-only route)" and Issue 13 mentions "a test-only diagnostic." Neither says whether these routes are dev-only, feature-flagged, or scheduled for removal before production. Explicitly gate them so they cannot ship to production.

3. **The setup form and the notes page are each split across two issues.** The setup form is built in Issue 2 (measures, meter, key, hands) and extended in Issue 4 (octave ranges). The notes page is built in Issue 5 (pitches) and extended in Issue 6 (durations). Each split modifies the same page and POST handler, creating integration risk and rework. If the splits are justified for incremental verification, note the integration point explicitly; otherwise consider building each page in a single issue.

4. **No issue explicitly references the PRD's render-pipeline ordering.** The PRD ("Data and concurrency") defines a strict stage order: domain validation and Piece generation → conditional Piece persistence and supersession → LilyPond call → response validation/sanitization → private R2 write → final conditional render-state commit, with each stage verifying lock ownership. Issue 12 describes the first half; Issue 16 describes the second. Neither issue inlines or cross-references the exact ordering. Inline the ordering in Issue 12 (or Issue 16) so an implementer does not miss the per-stage ownership check.

---

## 6. Minor / editorial

- **Issue 1** — the one-record-per-user acceptance criterion mentions only `etude_params`, but the PRD requires all three records (params, current-Piece, operation) to have uniqueness and cascade-deletion semantics. The criterion should cover all three.
- **Issue 12** — "Only one generation is in flight at a time" describes the lock effect but does not reference the lock mechanism by name, making it easy to under-implement. Reference the in-flight lock and owner-identifier check explicitly.
- **Issues 9–11** — interval weights are referenced as "the PRD table" / "the supplied probability weight" without inlining the values. Since the PRD has exact float values to 16 significant figures, inline them (or cite the exact PRD line) to avoid transcription errors during implementation.
- **Issue 16** — "On successful generation, the Workflow Service completes the render pipeline from Issue 12's stored Piece" — the render pipeline is described in Issue 12's body, not Issue 16's. Cross-reference the PRD's "Data and concurrency" ordering so the implementer finds it.
- **Issue 8** — "review-completion state" is listed among the state cleared on upstream changes, but since the review page is missing (§1.1) this term is undefined. Define or remove it.
- **Issue 5** — the C7 acceptance criterion says "C7 is available and no other octave-7 pitch is." Consider also asserting the negative: a key without C natural (e.g. E major) excludes C7 even when the expanded range reaches octave 7.
