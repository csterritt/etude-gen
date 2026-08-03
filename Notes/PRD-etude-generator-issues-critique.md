# Critique: Etude Generator Issues

## Scope and method

This is an issues-only review of `Notes/issues/issue-001-*.md` through `issue-040-*.md` against `Notes/PRD-etude-generator.md`. It assesses requirement coverage, issue boundaries, dependency ordering, correctness, testability, failure handling, security, accessibility, and edge cases. It does not generate tasks or review implementation, and it does not use Git history.

## Overall assessment

The issue set is substantially better than a typical PRD decomposition. All 68 user stories have an apparent owner, the issue sequence follows the product flow, every issue includes verification guidance and acceptance criteria, and the issues preserve most of the PRD's unusually detailed musical, accessibility, concurrency, storage, and external-service contracts.

The set is not ready to drive implementation unchanged. The principal problem is not missing top-level feature coverage; it is that cross-cutting requirements are introduced as later retrofit issues without dependencies that make earlier slices safe or complete. If issues are implemented and merged in dependency order, the repository can temporarily contain generation without concurrency protection, rendering without defined recovery, PDF handling without complete lifecycle controls, and forms that do not necessarily inherit stale-write, redisplay, and accessibility behavior. Several concurrency and lifecycle interactions are also unresolved despite the PRD claiming there are no open questions.

**Recommendation:** revise the dependency graph and the affected acceptance criteria before task generation. In particular, define whether intermediate tracer-bullet issues are non-deployable scaffolding, hidden behind a feature flag, or required to satisfy the complete production invariants before merge.

## Findings by severity

### High: Cross-cutting form requirements are not dependencies of later forms

Issues 8, 9, and 10 establish behavior that the PRD applies to every mutable form: safe invalid-value redisplay, accessible error presentation, and workflow-version compare-and-set protection. Later form issues do not depend on them:

- Issue 13 creates `POST /etude/notes` but is blocked only by Issues 7 and 11.
- Issue 14 extends the same POST but does not depend on Issues 8-10.
- Issue 16 creates `POST /etude/split` but depends only on Issue 13.
- Generation, retry, PDF, and Start Over POSTs also do not consistently state whether they carry and validate the workflow version or how stale submissions are handled.

This permits later forms to be considered complete while violating the PRD's universal validation, accessibility, and stale-submission rules. It also leaves unclear whether a stale Generate, Retry, PDF, or Start Over form may act on a newer workflow.

**Required revision:** make Issues 8-10 prerequisites for every applicable later form issue, or create an explicit shared “etude form contract” issue that they all depend on. Add acceptance criteria to each state-changing route for missing/tampered/stale versions, PRG behavior, safe error redisplay where relevant, and accessible error wiring. Specify which actions intentionally do not use the parameter workflow version and what concurrency token they use instead.

### High: The dependency graph allows unsafe production intermediates

The issue sequence deliberately introduces partial behavior and retrofits essential invariants later:

- Issue 20 generates and replaces Pieces before Issue 33 adds an in-flight lock and before Issue 34 adds the required cooldown.
- Issue 30 performs the multi-resource D1/LilyPond/R2 happy path before Issue 31 defines rendering recovery, Issue 33 protects concurrent work, and Issue 40 defines partial-failure coherence.
- Issue 35 adds PDF creation before Issue 36 completes grant expiry/consumption behavior and Issue 37 adds the PDF cooldown.
- Issue 40, which owns correctness across D1 and R2 failure boundaries, is last and is blocked only by Issues 32 and 35 even though it tests behavior owned by Issues 31, 34, 36, and 37.

This is acceptable only if these are explicitly non-deployable scaffolding slices. As written, each issue presents itself as shippable end-to-end behavior. A merged Issue 30 could publish work without the concurrency and recovery guarantees that are central to the PRD.

**Required revision:** either combine the unsafe slices, put the feature behind an explicit inaccessible feature flag until the protection issues land, or change dependencies so no externally reachable generation/PDF path exists before its lock, cooldown, recovery, and partial-failure invariants are implemented. Issue 40 should depend on all operations whose failure behavior it verifies.

### High: PDF locking is not actually specified

The PRD requires new-Piece generation and PDF generation to have distinct in-flight locks. Issue 33 defines a “generation and render” lock and explicitly applies it only to `POST /etude/generate` and `POST /etude/render/retry`. Issue 35 then says PDF work uses “its own in-flight lock semantics from Issue 33,” but neither issue defines the separate PDF lock's fields, acquisition/replacement rules, owner checks, release behavior, interaction with the generation lock, or tests proving the two locks are independent.

This ambiguity can lead either to no PDF lock or to one shared lock, both contrary to the PRD's two-distinct-controls model.

**Required revision:** add a separate PDF-lock contract, preferably in Issue 33, with the same owner-token and expiry rules, independent acquisition from generation/render, lost-owner commit rejection, all-path release, and tests for concurrent PDF/PDF and generation/PDF requests.

### High: Issue 19 makes a GET mutate workflow state

Issue 19 says that reaching `GET /etude/review` marks the workflow as review-complete. That makes a safe, cacheable navigation request mutate persisted state and potentially increment the workflow version. Browser prefetching, retries, multiple tabs, or automated link inspection could change the workflow merely by reading it. The issue does not state a compare-and-set rule for this mutation, and the PRD's route contract defines review only as GET.

**Required revision:** derive “review complete” from validated prerequisites rather than persist it, or introduce an explicit POST that records approval. If persisted review approval is needed as a generation precondition, define its version semantics, PRG response, stale-tab behavior, and invalidation atomically. Do not mutate approval state on GET.

### High: Required dependency from duration selection to split/review is absent

Issue 16 depends on Issue 13 but not Issue 14. Consequently, the split step can be implemented before the notes step has duration selection or authoritative rhythm validation. Issue 17 depends on Issue 16, and Issues 18-20 follow transitively, so review and generation can also appear complete without Issue 14. This contradicts the required workflow and Piece-generation inputs.

**Required revision:** make Issue 16 depend on Issue 14 (and on the shared form-contract issues). Ensure earliest-incomplete-step tests treat pitch and duration completion as one coherent notes-step prerequisite.

### Medium: Retry behavior for a stale Piece is unresolved

Issue 31 offers Retry rendering for a preserved Piece. Issue 32 makes a Piece stale when parameters change and hides its score/PDF controls. Neither says what happens to a previously displayed Retry action after another tab changes parameters, or whether a direct stale retry POST is rejected. Rendering stale music would violate the PRD; silently rendering it and keeping it hidden would waste external work.

**Required revision:** state that retry revalidates current Piece identity, source parameter version, workflow version, and lock ownership immediately before external work and final commit. A stale retry must be rejected and redirect to the current canonical workflow state without calling LilyPond.

### Medium: Start Over and account deletion during in-flight work are undefined

Issues 38 and 39 clear operation records and artifact reachability, but do not define interaction with a generation/render/PDF request that already owns a lock and may still be calling LilyPond or writing R2. Deleting the operation row may make later owner verification fail, which is useful, but the issues must require that the old request cannot recreate current Piece, render, grant, or cooldown state after the clear/delete. Artifact writes performed after revocation can also become untracked orphans.

**Required revision:** define a terminal generation/aggregate epoch or equivalent conditional-commit guard. Test Start Over and account deletion at every external-work boundary and prove the former owner cannot commit, release a replacement lock, or leave a reachable artifact. Define cleanup/logging for an artifact written by work that loses authority after the write.

### Medium: PDF grant consumption and delivery order is not precise enough

Issue 36 says the GET prepares the attachment, atomically consumes the grant, and starts cleanup, while its acceptance criterion says consumption occurs “when the download completes.” A server cannot reliably know that a browser received the entire response. Immediate object deletion is safe only if the complete bounded PDF has already been read into response-owned bytes; streaming directly from R2 while deleting introduces a race.

**Required revision:** define the exact order: authenticate and authorize, atomically claim/consume the grant, read and validate the bounded object (or claim only after a successful bounded read), create the response from owned bytes, then schedule cleanup. State what happens when object read fails after claim and acknowledge that one use means one successful server response attempt, not confirmed client receipt.

### Medium: Validation-state storage has unspecified integrity and size guarantees

Issue 8 proposes extending a cookie flash pattern into structured validation state carrying submitted values and field errors. “Server-managed” is ambiguous if the values reside in a client cookie. The issue does not define signing/encryption, replay resistance beyond one-time consumption, size bounds, truncation/fallback behavior, or output encoding. These omissions matter because later forms can contain many pitch checkboxes and validation data can exceed cookie limits.

**Required revision:** specify whether only an opaque nonce is stored client-side with state held server-side, or how a cookie-contained payload is authenticated, bounded, encoded, and expired. Define per-field shape/length bounds and a safe fallback when state cannot be stored. Do not describe HTML stripping as the primary defense; contextual output escaping remains mandatory.

### Medium: Two-hand duplicate-source selection is undefined

Issue 25 assigns a 15% outcome to “an exact prior left-hand bar” but does not say which prior bar is selected or with what distribution. Issue 24 defines linear-recency source selection for right-hand/single-hand repetition, but Issue 25 neither adopts nor rejects that rule. Deterministic tests cannot establish a complete expected result without this decision.

**Required revision:** define eligible prior left-hand sources, selection weighting, behavior when none is eligible, opening-pitch transition eligibility, and the random-draw order. Add deterministic boundary tests.

### Medium: All-rest repeated-bar eligibility is undefined

Issue 24 excludes a repeated source when its opening pitched event would require a transition over 12 semitones. It does not define a source with no pitched event, a hand that has not yet produced a current pitch, or a source with leading rests before its first pitch. These cases are possible because rests are introduced in Issue 23.

**Required revision:** define eligibility for all-rest bars and for absent current/opening pitches. Test all-rest source bars, leading-rest source bars, and a hand with no prior pitched event.

### Medium: SVG sanitization and embedding policy is too abstract

Issue 28 names DOMPurify but does not define an SVG allowlist, URL policy, namespace handling, CSS/style handling, data URLs, parser mode, or the concrete meaning of treating sanitized output as untrusted again at embed time. “Legitimate engraving markup survives unchanged in visual meaning” is not a deterministic acceptance criterion. Issue 30 tests a few unsafe constructs but does not close the policy gap.

**Required revision:** define the allowed SVG elements/attributes/protocols and whether style elements/attributes, `<use>`, fragments, data URLs, XML processing instructions, and namespace changes are allowed. Require inert parsing, a single SVG root, no active/focusable content, and a concrete embedding strategy. Use representative known-safe LilyPond fixtures for fidelity tests rather than an unbounded “same visual meaning” assertion.

### Medium: External redirect handling can leak credentials if implemented naively

Issue 27 says redirects to an unconfigured host are not followed. It does not explicitly require manual redirect handling, origin comparison, or removal/reconstruction of the Authorization header. Automatic redirect behavior varies, and allowing same-host or configured-host redirects without a precise policy can expose a Bearer token or bypass endpoint assumptions.

**Required revision:** define the allowed origin and redirect count, require manual redirect handling, never forward Authorization across an origin change, and test scheme/host/port changes, relative redirects, redirect loops, and credential-bearing base URLs.

### Medium: Artifact lifecycle metadata is underspecified

Issue 29 requires “expected object metadata” but never defines it. Issue 27 says SVG LilyPond metadata is retained; Issue 30 commits render state; Issue 35 applies the PDF contract. The implementer cannot tell which content type, byte length, Piece ID/version, artifact kind, renderer version, or checksum must be stored and validated, or which system is authoritative for each field.

**Required revision:** define the minimum D1 and R2 metadata contract and the mismatch response. Keep physical key formatting private, but make semantic validation testable. Include the PRD's 5 MB SVG and 10 MB PDF limits in this issue or clearly delegate limits to the renderer while testing defense in depth.

### Medium: Cleanup after account deletion can lose artifact identifiers

Issue 39 relies on D1 cascade deletion while also requiring cleanup of reachable artifacts. If the user row is deleted before artifact identifiers are captured, the application loses the information needed to delete R2 objects. The issue does not specify ordering or a durable orphan record.

**Required revision:** require owner-scoped capture and revocation of artifact references before deleting/cascading rows, followed by best-effort cleanup using the captured opaque IDs. Test D1 deletion failure, cleanup failure, and a concurrent operation attempting to publish a new artifact.

## Coverage and traceability

All 68 numbered stories have at least one issue reference. The decomposition also covers the major implementation-decision sections: supported music domain, immutable Piece, persistence, routes, LilyPond, private artifacts, accessibility, health validation, and testing. Issue 12 correctly owns rhythm-catalog health validation, so its absence from Issue 1 is not a coverage gap.

Traceability is nevertheless fragile because issue references are only story numbers and broad PRD section names. Requirements reused across many routes—authentication, no-cache behavior, PRG, workflow versions, ownership, safe errors, and cleanup ordering—can be missed without an explicit applicability matrix.

**Recommendation:** add a compact PRD-requirement-to-issue matrix and a cross-cutting contract section to the issue set. Each route issue should explicitly opt into authentication/no-cache, CSRF, PRG, ownership, workflow/operation versioning, error/correlation behavior, and accessibility as applicable.

## Issue-by-issue disposition

| Issue | Disposition | Principal critique |
|---|---|---|
| 1 | Minor revision | Good configuration boundary; clarify health endpoint exposure and deployment acceptance of current LilyPond version. Catalog health is correctly delegated to Issue 12. |
| 2 | Minor revision | Strong safe-error contract; define correlation propagation into Workflow Service, renderer, artifact cleanup, and deferred work rather than only request/response handling. |
| 3 | Minor revision | Authentication and navigation are clear; specify the intended `/private` result (404, redirect, or removal) so tests do not encode an arbitrary behavior. |
| 4 | Minor revision | Add an atomic concurrent load-or-create test and explicitly require the database uniqueness constraint already implied by the PRD. |
| 5 | Revision | Setup behavior is testable, but later cross-cutting form dependencies do not inherit its validation/PRG contract. Empty/multi-value form submissions should be covered. |
| 6 | Accept with minor clarification | Exact key set and spelling tests are strong; explicitly connect key changes to Issue 11 invalidation. |
| 7 | Accept with minor clarification | Range/C7 behavior is well covered; include exact-boundary C7 cases and multi-value/unordered form input. |
| 8 | Revision | Define validation-state integrity, confidentiality as needed, bounds, encoding, expiry, and cookie-overflow fallback. |
| 9 | Revision | Make this a prerequisite/shared contract for every later form, not just setup. Specify unique IDs and behavior for repeated field errors. |
| 10 | Revision | Apply CAS requirements explicitly to all later state-changing parameter forms and define the concurrency token for non-parameter operations. |
| 11 | Minor revision | Atomic invalidation is correct; add simultaneous multi-field changes and stale-CAS interaction tests. |
| 12 | Minor revision | Strong catalog validation; define token numeric durations in the issue and decide whether duplicate patterns are rejected or deliberately allowed. |
| 13 | Revision | Depend on Issues 8-10; define “first derived” after every upstream invalidation and distinguish no-script Select all from ordinary save. |
| 14 | Revision | Depend on Issues 8-10; define stable corrective error text/semantics and behavior for duplicate/unknown duration values. |
| 15 | Minor revision / HITL | Correctly isolated client enhancement; specify accessible disabled-state explanation and initialization behavior. |
| 16 | Major dependency revision | Must depend on Issue 14 and shared form contracts. Define redirect target and corrupt-state recovery when fewer than two pitches are stored. |
| 17 | Minor revision | Shared summaries are sound; enumerate required summary fields per step and depend on the complete notes step. |
| 18 | Revision | Define the full state-to-canonical-route table, including current rendered Piece, render-failure Piece, and stale Piece states. |
| 19 | Major revision | Do not persist review completion on GET. Resolve Generate-control scope instead of allowing “inert or hidden” alternatives. |
| 20 | Major sequencing revision | Minimal Piece tracer bullet is useful for tests, but externally reachable generation must not precede locking/recovery/coherence. Define failure redirect and exact contract ownership. |
| 21 | Minor revision | Good presenter/accessibility split; define behavior for missing/corrupt Piece and make retry-state ownership explicit. |
| 22 | Minor revision | Deterministic sampling plan is strong; include exact weights locally or a normative PRD reference and define RNG range/invalid outputs. |
| 23 | Accept with minor clarification | Rest boundaries are well covered; define “fresh” precisely relative to repeat/mirror exceptions. |
| 24 | Revision | Resolve all-rest/no-current-pitch repeat eligibility and explicitly state left-hand independent repetition is handled only by Issue 25. |
| 25 | Revision | Define prior-left-bar source selection and fallback; current percentages alone do not specify the algorithm. |
| 26 | Minor revision | Good pure boundary; define invariant validation responsibility so malformed stored Piece behavior is deterministic. |
| 27 | Revision | Tight contract overall; harden redirect/origin rules and state where SVG metadata is persisted. |
| 28 | Revision | Define the sanitizer allowlist and concrete embed-time defense rather than relying on DOMPurify defaults. |
| 29 | Revision | Define semantic object metadata and byte limits; clarify whether retries delay the response or run in an execution context. |
| 30 | Major sequencing revision | Happy path is clear but must not be externally enabled before Issues 31, 33, 34, and 40. Define exact accessible SVG/text relationship. |
| 31 | Revision | Add stale-Piece rejection before retry and owner/version checks before every side effect and commit. |
| 32 | Revision | Clarify stale retry behavior and changing parameters back to identical Piece-producing values; direct stale score/PDF actions must be rejected. |
| 33 | Major revision | Add the distinct PDF lock and independent-lock tests; test crash before work and lock loss during every stage. |
| 34 | Minor revision | Good success-only cooldown; test replacement generation during the same per-user cooldown and exact boundary clock semantics. |
| 35 | Major revision | Specify PDF lock, owner/current/non-stale Piece checks, complete service error mapping, and explicit deferral/dependency on grant lifecycle. |
| 36 | Revision | Define consumption/read/response/cleanup order and failure behavior; require authentication explicitly. |
| 37 | Minor revision | State cooldown is per user, not per Piece, and test Piece replacement during the cooldown. |
| 38 | Major dependency/concurrency revision | Depend on completed lock/cooldown/grant issues and define behavior against already in-flight owners and workflow version reset/new epoch. |
| 39 | Major concurrency/order revision | Capture artifact IDs before cascade, prevent post-deletion commits, and test deletion during in-flight generation/PDF work. |
| 40 | Major dependency revision | Depend on every operation/failure mechanism it validates; add orphan cleanup requirements after R2 success followed by failed D1 commit. |

## Acceptance-criteria quality

Most acceptance criteria are concrete Given/When/Then statements and are paired with appropriate Bun or Playwright verification. The strongest examples are the exact musical boundaries, multipart limits, cleanup retry schedule, lock-owner replacement behavior, and deterministic generator branch tests.

The following criteria should be rewritten because they are ambiguous, internal-only, or not reliably observable:

- Issue 11: “never partially” should enumerate the externally visible state after injected failure.
- Issue 13: “round-trips through the server” should focus on restored selections and no unintended persistence.
- Issue 19: “Generate may be inert or hidden” is not a requirement; choose one outcome.
- Issue 20: “no random seed is persisted” is a legitimate repository invariant, but its verification should be assigned to a contract/schema-level test without coupling route tests to physical columns.
- Issue 22: “distribution matches” should be expressed as deterministic cumulative-bucket boundaries, not aggregate random sampling.
- Issue 28: “unchanged in visual meaning” needs fixed known-safe fixtures or screenshot/structural expectations.
- Issue 36: “when download completes” must be replaced with a server-observable response/claim point.
- Issue 39: “when arbitrary time passes” needs a controlled-clock test and an explicit assertion that no expiry job/path removes current state.

## Error handling and logging

The issue set correctly centralizes unexpected-error correlation and redaction in Issue 2 and typed external/storage failures in Issues 27-29. It should not require routine successful operations to be logged merely for completeness; that would create noise and possible privacy risk. What is missing is explicit propagation of the correlation identifier and typed failure category across composed boundaries, especially cleanup scheduled after the HTTP response and work that loses a lock.

Add requirements that:

1. Every unexpected or cleanup-exhausted event uses the originating correlation ID when one exists.
2. Deferred cleanup has a generated operation correlation ID if no request context remains.
3. Lost-lock and stale-operation failures are safe to students and diagnosable without logging user IDs, Piece content, LilyPond source, grants, or credentials.
4. A successful R2 write followed by failed D1 commit triggers best-effort deletion using the appropriate cleanup reason or a new explicitly allowed reason. The current cleanup-reason enum has no value for this orphan path, so Issue 40 cannot fully specify its required recovery with the existing Issue 29 contract.

That last point is a concrete inconsistency: the PRD and Issue 29 allow only `replacement`, `start_over`, `grant_consumed`, `grant_expired`, and `account_deleted`, while Issue 40 creates unreachable artifacts after failed final commits. Either add a `commit_failed`/`publish_failed` cleanup reason or explicitly map this case to a documented existing reason.

## Recommended issue-set changes before task generation

1. Introduce a cross-cutting etude route/form contract and make all route issues depend on it.
2. Fix Issue 16's missing dependency on Issue 14.
3. Remove the GET mutation from Issue 19 and define explicit review approval semantics.
4. Define separate generation/render and PDF locks in Issue 33.
5. Resolve stale retry, Start Over during work, and account deletion during work.
6. Make generation/render/PDF slices non-deployable until their safety issues are complete, or reorder/combine them.
7. Repair Issue 40's dependencies and add a cleanup reason for post-write commit failure.
8. Specify PDF grant response/consumption ordering.
9. Complete the underspecified generator cases in Issues 24-25.
10. Define concrete sanitizer, redirect, validation-state, and artifact-metadata policies.
11. Add a PRD-to-issue traceability matrix and a canonical workflow-state/route table.

## Conclusion

The decomposition has excellent breadth and generally strong verification intent. No major top-level PRD feature appears wholly absent. The remaining defects are concentrated in dependency correctness and in interactions between otherwise well-specified issues. Those interactions are exactly where production failures are likely: stale forms, overlapping operations, lost lock ownership, partial D1/R2 commits, grant consumption, cleanup after authority is revoked, and active work during destructive workflow actions.

Addressing the high- and medium-severity findings before task generation will avoid building correct components in an unsafe order and then having to retrofit transactional and concurrency guarantees across already-completed slices.
