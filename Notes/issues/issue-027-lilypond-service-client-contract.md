## Issue 27: LilyPond service client contract for SVG

**Type**: AFK
**Blocked by**: Issue 1, Issue 26

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Implement the authenticated, bounded client for the external LilyPond service's `/generate` endpoint, exactly as specified in the PRD's "LilyPond and artifact contracts" section: HTTP POST to the configured base URL joined with `/generate`, JSON content type, a JSON string field named `lilypond`, Bearer authentication from the secret binding, the configured timeout defaulting to 30 seconds, and no redirects followed to an unconfigured host.

Responses are multipart with exactly one required `output` part and one required JSON `metadata` part; unknown bounded parts may be ignored and duplicate required parts are rejected. `/generate` requires `image/svg+xml` output no larger than 5 MB, enforced against actual bytes read rather than a declared content length. Metadata is limited to 128 KB, at most 100 warnings, and at most 1 KB per warning; the version string is retained for diagnosis and warnings are never shown to students. Non-success responses are JSON with a string `error` field, read only up to a bounded size, sanitized for logs, and surfaced to the student as a generic message with the correlation identifier.

Every failure mode is a distinct typed category — timeout, transport, service response, contract, size — and no failure may leak the Bearer token, the service URL credentials, or the request body into logs.

### How to verify

- **Manual**: point the client at the real service in development and confirm a valid Piece round-trips to an SVG with a version string recorded, and that an intentionally bad API key produces a generic student-facing error with a correlation identifier.
- **Automated**: Bun tests against a fake fetch boundary asserting the exact method, URL join, content type, `lilypond` field, and Authorization header; the configured timeout aborting a slow response; a redirect to an unconfigured host not being followed; a valid multipart response parsing correctly; missing `output`, missing `metadata`, duplicate required parts, wrong media type, and an ignored unknown part; output exceeding 5 MB of actual bytes rejected even when the declared length is small; metadata over 128 KB, more than 100 warnings, and an oversized single warning rejected; non-JSON, oversized, and non-success error bodies handled; and log payloads containing no secret or request body.

### Acceptance criteria

- [ ] Given a serialized Piece, when SVG is requested, then the request is a POST to the configured base URL plus `/generate` with JSON content type, a `lilypond` string field, and Bearer authentication.
- [ ] Given a service that does not respond within the configured timeout, then the call aborts and returns a typed timeout failure.
- [ ] Given a multipart response with exactly one `output` and one `metadata` part of the correct media types and sizes, then a successful result with the SVG bytes and metadata is returned.
- [ ] Given a missing, duplicated, or wrongly typed required part, then a typed contract failure is returned and no output is used.
- [ ] Given output exceeding 5 MB of actual bytes, then reading is bounded and a typed size failure is returned.
- [ ] Given any failure, then logs contain no Bearer token, secret, or LilyPond request body.

### User stories addressed

- User story 67: Authenticated, bounded, well-formed requests at the documented endpoints
- User story 68: Strict multipart response and media-type validation

---
