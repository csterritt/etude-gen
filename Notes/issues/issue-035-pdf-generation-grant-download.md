## Issue 35: PDF generation, temporary grant, and attachment download

**Type**: AFK
**Blocked by**: Issue 30, Issue 33

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Deliver the PDF path end-to-end: `POST /etude/pdf` renders the exact stored Piece that is displayed as SVG through the LilyPond service's `/pdf` endpoint, validates the response against the PDF contract (`application/pdf`, no larger than 10 MB, bounded metadata), stores it privately in R2, creates a one-use temporary grant, and redirects to an authenticated download GET identified by an opaque grant identifier.

The download response is a bounded attachment named `etude-<piece-short-id>.pdf`, where the short id is the first eight lowercase hexadecimal characters of the server-generated Piece UUID, produced entirely by the server and never from form input. The object is never publicly exposed.

### Cross-cutting contract

`Notes/issues/etude-cross-cutting-contract.md` applies:

- Section 1 — authentication, no-cache, owner scoping, safe messages. The download GET
  requires the same authenticated session as every other etude route; a signed-out request
  for a grant identifier is denied like any other protected page.
- Section 3 — `POST /etude/pdf` is an operation POST: the workflow version is a precondition,
  never incremented.
- Section 4 — `POST /etude/pdf` uses the **PDF lock** defined in Issue 33, which is entirely
  independent of the generation/render lock. A held generation lock never blocks it and it
  never touches the generation lock's fields.

### Preconditions and per-stage verification

Before doing any external work, `POST /etude/pdf` requires all of:

1. The submitted workflow version equals the current workflow version.
2. The aggregate epoch is current.
3. There is a current Piece, identified by `pieceId`.
4. That Piece is not stale (`sourceParameterVersion` equals the current workflow version).
5. That Piece has a committed SVG render, so the PDF is provably the same music the student
   is looking at.
6. The PDF cooldown (Issue 37) has elapsed.
7. The PDF lock is acquired.

Conditions 1 through 5 are re-verified immediately before the LilyPond `/pdf` call and again
at the final commit that stores the object and creates the grant, together with the PDF lock
owner token. A failure before the call means no call, nothing stored, no grant, no cooldown
consumed, and a conditional release of the PDF lock. A failure after a successful R2 write
means the commit is rejected, no grant exists, the object is never reachable, and cleanup runs
with `cleanupReason` `commit_failed` (Issue 29).

### Failure and error mapping

| Condition                                                                                                      | Response                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Stale, missing, or tampered workflow version                                                                   | 303 to the canonical route with a safe explanatory error                                                                  |
| Stale aggregate epoch                                                                                          | 303 to the canonical route; nothing committed                                                                             |
| No current Piece, or a stale Piece, or a Piece with no committed render                                        | 303 to the canonical route for the current state with a safe message; no PDF work                                         |
| PDF cooldown active                                                                                            | 303 back to the score with the Issue 37 cooldown message; no lock acquired                                                |
| PDF lock already held                                                                                          | 303 back to the score with a concurrent-work message; no LilyPond call                                                    |
| Timeout, transport, non-success status, contract, media-type, or size failure from Issue 27's typed categories | 303 back to the score with the generic safe message and correlation identifier; no cooldown consumed                      |
| R2 write failure                                                                                               | 303 back to the score with the generic retry message; nothing granted, no cooldown consumed                               |
| Grant/commit failure after a successful R2 write                                                               | 303 back to the score with the generic retry message; object cleaned up with reason `commit_failed`; no cooldown consumed |
| Success                                                                                                        | 303 to `GET /etude/pdf/download/:grantId`                                                                                 |

### Deferred to Issue 36

This issue creates the grant and serves the first download. The grant's **lifecycle** — the
15-minute expiry, single consumption, the exact claim/read/respond/cleanup ordering, foreign
and unknown grant handling, and opportunistic revocation of expired grants — is owned by
Issue 36 and must land before the PDF path is enabled for production traffic. Until then this
slice's download GET is only expected to serve one successful response for a fresh grant.

### How to verify

- **Manual**: generate a score, request a PDF, and confirm the browser downloads a file named `etude-<eight-hex>.pdf` whose music matches the on-screen score; confirm the redirect from the POST is a 303 to a GET.
- **Automated**: Bun tests asserting the `/pdf` endpoint contract, media type and 10 MB actual-size enforcement, the short-id derivation from the Piece UUID, and that the filename is never influenced by submitted values. Playwright tests assert the POST-redirect-to-GET flow, the exact attachment filename, a successful download, and that the PDF is produced from the same Piece as the displayed SVG.

### Acceptance criteria

- [ ] Given a current Piece displayed as SVG, when a PDF is requested, then the PDF is generated from that exact stored Piece.
- [ ] Given a successful PDF, then the POST answers with a 303 redirect to an authenticated download GET identified by an opaque grant identifier.
- [ ] Given the download GET, then the response is an attachment named `etude-<piece-short-id>.pdf` using the first eight lowercase hex characters of the Piece UUID.
- [ ] Given submitted form values attempting to influence the filename, then they are ignored entirely.
- [ ] Given service output that is not `application/pdf` or exceeds 10 MB of actual bytes, then a typed failure is returned and nothing is stored or granted.
- [ ] Given the stored PDF, then it has no public URL and is reachable only through the owner's grant.
- [ ] Given a held generation/render lock, then a PDF request still acquires the PDF lock and proceeds; given a held PDF lock, then a second PDF request is refused without any LilyPond call.
- [ ] Given a PDF request, then the current non-stale Piece identity, its committed render, the workflow version, the aggregate epoch, and the PDF lock owner token are all verified before the `/pdf` call and again at the final commit.
- [ ] Given each row of the failure and error mapping table, then the stated response occurs, the PDF cooldown is not consumed, and no grant is created.
- [ ] Given a successful R2 write whose grant commit fails, then no grant exists, the object is never reachable, and cleanup runs with reason `commit_failed`.
- [ ] Given a signed-out request for the download GET, then it is denied like any other protected etude route and reveals nothing about the grant.

### User stories addressed

- User story 53: A PDF generated from the exact stored Piece displayed as SVG
- User story 56: Attachment delivered after a server redirect with a predictable safe filename

---
