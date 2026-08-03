## Issue 37: Independent PDF cooldown that only successes consume

**Type**: AFK
**Blocked by**: Issue 35

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Add the PDF-specific last-success timestamp so PDF generation is limited to one successful result per minute, on a clock entirely independent of the new-Piece cooldown from Issue 34. A student can therefore create a PDF immediately after generating an SVG while repeated PDF work stays controlled.

The cooldown starts only after a valid PDF is persisted privately and its one-time grant is committed. Service, validation, and storage failures do not consume it, so a student can recover immediately from a failed attempt. A refused request explains when a PDF can be requested again.

### How to verify

- **Manual**: generate an etude and immediately request a PDF, confirming no generation cooldown blocks it; request a second PDF straight away and confirm the refusal message; force a PDF failure and confirm an immediate retry is allowed.
- **Automated**: Bun tests asserting the PDF timestamp is recorded only after persistence and grant commit, that a request within 60 seconds is refused, that one after 60 seconds succeeds, that the PDF and new-Piece clocks are independent in both directions, and that each failure category leaves the PDF timestamp untouched. Playwright tests cover the immediate-PDF-after-generation path and the PDF cooldown message.

### Acceptance criteria

- [ ] Given a successful PDF with a committed grant, then the PDF cooldown timestamp is recorded at that moment.
- [ ] Given a PDF request within 60 seconds of the last successful PDF, then it is refused with an informative message and no PDF is created.
- [ ] Given an active new-Piece cooldown, then a PDF request is not blocked by it, and vice versa.
- [ ] Given a service, validation, or storage failure during PDF work, then the PDF cooldown timestamp is unchanged and an immediate retry is allowed.

### User stories addressed

- User story 54: PDF generation independently limited to one successful result per minute
- User story 55: Failed PDF attempts do not consume the PDF cooldown

---
