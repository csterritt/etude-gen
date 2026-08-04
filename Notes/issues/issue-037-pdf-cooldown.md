## Issue 37: Independent PDF cooldown that only successes consume

**Type**: AFK
**Blocked by**: Issue 35

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Add the PDF-specific last-success timestamp so PDF generation is limited to one successful result per minute, on a clock entirely independent of the new-Piece cooldown from Issue 34. A student can therefore create a PDF immediately after generating an SVG while repeated PDF work stays controlled.

The cooldown starts only after a valid PDF is persisted privately and its one-time grant is committed. Service, validation, and storage failures do not consume it, so a student can recover immediately from a failed attempt. A refused request explains when a PDF can be requested again.

The PDF cooldown is per user and per aggregate, not per Piece. Generating a replacement Piece during an active PDF cooldown does not reset it, so a student who regenerates must still wait out the remaining PDF cooldown before requesting a PDF of the new Piece. Start Over clearing the PDF timestamp is owned by Issue 38 and is the single exception.

Boundary semantics match Issue 34 exactly: a PDF request is refused when the elapsed time since the recorded PDF success timestamp is strictly less than 60,000 milliseconds, and is allowed at exactly 60,000 milliseconds. Tests use a controlled, injected clock with cases at 59,999 ms, exactly 60,000 ms, and 60,001 ms rather than real waiting.

A refused request does no work: it acquires no PDF lock, makes no LilyPond call, stores nothing in R2 or D1, and creates no grant.

### Cross-cutting contract

Inherits `Notes/issues/etude-cross-cutting-contract.md`:

- Section 1: universal route requirements — authenticated, no-cache, owner-scoped, and a 303 redirect with a safe message on refusal.
- Section 3: operation-POST contract — `workflowVersion` is a precondition and is not incremented, and a refusal performs no external work, acquires no lock, and changes no state.
- Section 4: concurrency tokens — `POST /etude/pdf` carries the PDF cooldown alongside the independent PDF lock owner token, the aggregate epoch, and a current non-stale Piece with a committed SVG render.

### How to verify

- **Manual**: generate an etude and immediately request a PDF, confirming no generation cooldown blocks it; request a second PDF straight away and confirm the refusal message; force a PDF failure and confirm an immediate retry is allowed.
- **Automated**: Bun tests with an injected clock asserting the PDF timestamp is recorded only after persistence and grant commit, refusal at 59,999 ms, permission at exactly 60,000 ms and at 60,001 ms, that generating a replacement Piece during an active PDF cooldown leaves the PDF timestamp untouched so a PDF request for the new Piece is still refused, that a refused request acquires no PDF lock, makes no LilyPond call, stores nothing, and creates no grant, that the PDF and new-Piece clocks are independent in both directions, and that each failure category leaves the PDF timestamp untouched. Playwright tests cover the immediate-PDF-after-generation path and the PDF cooldown message.

### Acceptance criteria

- [ ] Given a successful PDF with a committed grant, then the PDF cooldown timestamp is recorded at that moment.
- [ ] Given elapsed time strictly less than 60,000 ms since the last successful PDF, then the request is refused with an informative message and no PDF is created; at exactly 60,000 ms and beyond it is allowed.
- [ ] Given a controlled clock in tests, then the 59,999 ms, 60,000 ms, and 60,001 ms cases are all covered without real waiting.
- [ ] Given a replacement Piece is generated during an active PDF cooldown, then the cooldown is not reset and a PDF request for the new Piece must still wait out the remainder; only Start Over clears it, and that clearing is owned by Issue 38.
- [ ] Given a refused PDF request, then it acquires no PDF lock, performs no LilyPond call, stores nothing, and creates no grant.
- [ ] Given an active new-Piece cooldown, then a PDF request is not blocked by it, and vice versa.
- [ ] Given a service, validation, or storage failure during PDF work, then the PDF cooldown timestamp is unchanged and an immediate retry is allowed.

### User stories addressed

- User story 54: PDF generation independently limited to one successful result per minute
- User story 55: Failed PDF attempts do not consume the PDF cooldown

---
