## Issue 18: PDF flow — grants, one-use 15-minute download, attachment filename, PDF cooldown

**Type**: AFK
**Blocked by**: Issue 16

### Parent PRD

`PRD-etude-generator.md`

### What to build

The complete PDF download loop, end-to-end. `POST /etude/pdf` renders a PDF from the exact stored Piece displayed as SVG (never from stale parameters), stores it in private R2 for the grant lifecycle only, creates a one-time grant owned by the authenticated user, and 303-redirects to an authenticated download GET identified by an opaque grant identifier. The download GET prepares the bounded attachment named `etude-<piece-short-id>.pdf` (first eight lowercase hex characters of the server-generated Piece UUID), atomically consumes the grant, and initiates object cleanup. Grants expire after 15 minutes and permit exactly one download; expired, consumed, foreign, or missing grants never expose object details and redirect the owner to the score with a safe, actionable error. The PDF cooldown is an independent 60-second clock starting only after the PDF is persisted and its grant committed; service, validation, or storage failures never consume it, so a PDF can be created immediately after SVG generation. Later owner activity detects expired grants, atomically revokes them, and attempts physical cleanup without a background job.

### How to verify

- **Manual**: from a score, request the PDF and confirm the browser downloads `etude-<id>.pdf` after a redirect with the same music as the SVG; request the same download URL again and confirm the safe error; immediately request another PDF and confirm the independent cooldown message; generate a fresh SVG and confirm a PDF can be created immediately after.
- **Automated**: Bun tests for grant expiration, single consumption, owner scoping, opportunistic revocation/cleanup on later activity, and the independent success-only PDF cooldown; Playwright tests for the exact attachment filename, POST-redirect-to-GET, download, expiry and consumption errors, and cooldown messages.

### Acceptance criteria

- [ ] Given a current score, when the student requests a PDF, then the downloaded attachment is `etude-<piece-short-id>.pdf` containing the same music as the displayed SVG, delivered after a server redirect.
- [ ] Given a grant, when it is consumed once or 15 minutes pass, then further use redirects to the score with a safe actionable error and no object details.
- [ ] Given a successful PDF, when another is requested within 60 seconds, then a cooldown message appears; given a failed PDF attempt, then no cooldown is consumed.
- [ ] Given an SVG generation just succeeded, when a PDF is requested, then the SVG cooldown does not block it.
- [ ] Given an expired grant, when the owner next acts anywhere in the etude workflow, then the grant is revoked and cleanup attempted.

### User stories addressed

- User story 53: PDF generated from the exact stored Piece
- User story 54: independent one-per-minute PDF limit
- User story 55: failed PDF attempts do not consume the cooldown
- User story 56: redirect-delivered attachment with the safe predictable filename
- User story 57: 15-minute, one-download temporary grant
- User story 58: expired/consumed/missing grant redirects with actionable safe error

---
