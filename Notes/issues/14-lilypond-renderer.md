## Issue 14: LilyPond renderer — serialization, authenticated client, multipart validation, SVG sanitization

**Type**: AFK — verifiable entirely with a fake service; the external LilyPond application itself is out of scope
**Blocked by**: Issue 13

### Parent PRD

`PRD-etude-generator.md`

### What to build

The LilyPond Renderer module end-to-end behind one rendering boundary, with DOMPurify + jsdom added as dependencies. Serialize the authoritative Piece to LilyPond source: grand staff with fixed treble/right and bass/left mapping, selected key and time signature, upward right-hand stems, downward left-hand stems, the unused staff showing signatures but no notes or rests, and no v1 metadata (title, composer, tempo, etc.). Call the configured service: POST with JSON body field `lilypond`, Bearer auth, the configured timeout, and no redirect-following to unconfigured hosts; `/generate` for SVG and `/pdf` for PDF. Validate responses strictly: multipart with exactly one `output` file part and one JSON `metadata` part (duplicate required parts rejected, unknown bounded parts ignored), media types `image/svg+xml` ≤ 5 MB and `application/pdf` ≤ 10 MB enforced on actual bytes, metadata ≤ 128 KB with bounded warnings, version string retained as render metadata. Sanitize SVG with DOMPurify in a jsdom environment — scripts, event handlers, external resource loads, foreign interactive content, and unsafe links removed or rejected — treating unrecoverable sanitization as failure. Failures are typed by category (timeout, transport, service response, contract, size, serialization, sanitization) without exposing secrets.

### How to verify

- **Manual**: not separately demoable; verified through contract tests and consumed by Issues 15–18.
- **Automated**: Bun contract tests against a fake service covering exact request method/endpoints/authorization/JSON field/timeout/redirect handling, valid multipart responses, missing/duplicate parts, strict media types, actual size limits, bounded metadata/warnings, non-JSON and oversized errors, malformed SVG, sanitizer rejection, and safe inert SVG output; serialization snapshot tests for grand-staff mapping, stems, key/time signatures, and the one-hand empty staff.

### Acceptance criteria

- [ ] Given a Piece, when serialized, then the LilyPond source encodes the grand staff, hand/stem mapping, key, and time signature per the PRD.
- [ ] Given malformed, oversized, mistyped, timed-out, or unsafe service output, when the renderer processes it, then it is a typed failure and nothing crosses the boundary for embedding.
- [ ] Given a valid response, when processed, then the result is a sanitized inert SVG (or bounded PDF) plus retained version/warnings metadata.
- [ ] Given any failure path, then no secret, token, or request body appears in errors or logs.

### User stories addressed

- User story 41: embedded SVG contains no unsafe or inaccessible interactive content (sanitization half)
- User story 46: bad service output handled as retryable rendering failure (classification half)
- User story 67: authenticated, bounded, well-formed requests at the documented endpoints
- User story 68: strict multipart response and media-type validation

---
