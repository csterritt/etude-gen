## Issue 35: PDF generation, temporary grant, and attachment download

**Type**: AFK
**Blocked by**: Issue 30, Issue 33

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Deliver the PDF path end-to-end: `POST /etude/pdf` renders the exact stored Piece that is displayed as SVG through the LilyPond service's `/pdf` endpoint, validates the response against the PDF contract (`application/pdf`, no larger than 10 MB, bounded metadata), stores it privately in R2, creates a one-use temporary grant, and redirects to an authenticated download GET identified by an opaque grant identifier.

The download response is a bounded attachment named `etude-<piece-short-id>.pdf`, where the short id is the first eight lowercase hexadecimal characters of the server-generated Piece UUID, produced entirely by the server and never from form input. PDF work uses its own in-flight lock semantics from Issue 33 so concurrent PDF requests cannot overwrite one another, and the object is never publicly exposed.

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

### User stories addressed

- User story 53: A PDF generated from the exact stored Piece displayed as SVG
- User story 56: Attachment delivered after a server redirect with a predictable safe filename

---
