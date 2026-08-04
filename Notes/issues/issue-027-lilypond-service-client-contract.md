## Issue 27: LilyPond service client contract for SVG

**Type**: AFK
**Blocked by**: Issue 1, Issue 26

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Implement the authenticated, bounded client for the external LilyPond service's `/generate` endpoint, exactly as specified in the PRD's "LilyPond and artifact contracts" section: HTTP POST to the configured base URL joined with `/generate`, JSON content type, a JSON string field named `lilypond`, Bearer authentication from the secret binding, the configured timeout defaulting to 30 seconds, and no redirects followed to an unconfigured host.

Responses are multipart with exactly one required `output` part and one required JSON `metadata` part; unknown bounded parts may be ignored and duplicate required parts are rejected. `/generate` requires `image/svg+xml` output no larger than 5 MB, enforced against actual bytes read rather than a declared content length. Metadata is limited to 128 KB, at most 100 warnings, and at most 1 KB per warning; the version string is retained for diagnosis and warnings are never shown to students. Non-success responses are JSON with a string `error` field, read only up to a bounded size, sanitized for logs, and surfaced to the student as a generic message with the correlation identifier.

Every failure mode is a distinct typed category — timeout, transport, service response, contract, size — and no failure may leak the Bearer token, the service URL credentials, or the request body into logs.

### Redirect and credential policy

"Redirects to an unconfigured host are not followed" is not implementable as stated,
because automatic redirect behaviour varies and a followed redirect can carry the
Authorization header somewhere it does not belong. The precise policy is:

- Redirects are handled **manually**. The fetch is issued with redirect following disabled,
  so a 3xx response is observed by the client rather than resolved by the runtime.
- The **allowed origin** is exactly the scheme, host, and port of the configured
  `LILYPOND_SERVICE_URL`. A redirect whose resolved target differs from that origin in
  scheme, host, or port is not followed and returns a typed service-response failure.
- At most **one** redirect is followed, and only within the allowed origin. A second
  redirect is a typed failure, so redirect loops terminate immediately.
- The Authorization header is **never** carried across an origin change. Because
  cross-origin redirects are not followed at all, the header is only ever reconstructed for
  the same allowed origin; it is never copied from the previous request's header list.
- Relative `Location` values are resolved against the request URL before the origin
  comparison, and a `Location` that is absent, empty, or unparseable is a typed failure.
- If the configured base URL itself contains userinfo credentials, configuration validation
  rejects it (Issue 1) rather than the client stripping them at call time. The base URL is
  joined with `/generate` by path concatenation that cannot escape the configured path
  prefix, so a configured path is preserved and traversal segments are rejected.
- Every redirect refusal is logged with the typed category and the resolved target's origin
  only — never the full URL, never any header, never any credential.

### Where SVG metadata is persisted

The renderer returns the metadata it validated; it persists nothing itself. The LilyPond
version string and the bounded warning count are written to the **current-Piece record's
render metadata** (Issue 20's record) as part of the final conditional render-state commit
in Issue 30, under the artifact metadata contract in Issue 29. Warnings are never shown to
students, and the raw warning text is not persisted — only the count and, when diagnosis is
needed, a log entry bounded by the same limits.

### How to verify

- **Manual**: point the client at the real service in development and confirm a valid Piece round-trips to an SVG with a version string recorded, and that an intentionally bad API key produces a generic student-facing error with a correlation identifier.
- **Automated**: Bun tests against a fake fetch boundary asserting the exact method, URL join, content type, `lilypond` field, and Authorization header; the configured timeout aborting a slow response; a valid multipart response parsing correctly; missing `output`, missing `metadata`, duplicate required parts, wrong media type, and an ignored unknown part; output exceeding 5 MB of actual bytes rejected even when the declared length is small; metadata over 128 KB, more than 100 warnings, and an oversized single warning rejected; non-JSON, oversized, and non-success error bodies handled; and log payloads containing no secret or request body. Redirect tests cover a same-origin redirect followed once, a second redirect refused, a redirect loop terminating, a scheme change, a host change, a port change, a relative `Location` resolved before comparison, an absent or unparseable `Location`, and an assertion that no request in any redirect scenario carries the Authorization header to a different origin.

### Acceptance criteria

- [ ] Given a serialized Piece, when SVG is requested, then the request is a POST to the configured base URL plus `/generate` with JSON content type, a `lilypond` string field, and Bearer authentication.
- [ ] Given a service that does not respond within the configured timeout, then the call aborts and returns a typed timeout failure.
- [ ] Given a multipart response with exactly one `output` and one `metadata` part of the correct media types and sizes, then a successful result with the SVG bytes and metadata is returned.
- [ ] Given a missing, duplicated, or wrongly typed required part, then a typed contract failure is returned and no output is used.
- [ ] Given output exceeding 5 MB of actual bytes, then reading is bounded and a typed size failure is returned.
- [ ] Given any failure, then logs contain no Bearer token, secret, or LilyPond request body.
- [ ] Given a 3xx response, then it is observed by the client rather than followed automatically, and at most one same-origin redirect is followed.
- [ ] Given a redirect whose resolved target changes scheme, host, or port, then it is not followed and a typed service-response failure is returned.
- [ ] Given any redirect scenario, then no request carries the Authorization header to an origin other than the configured one.
- [ ] Given a second redirect or a redirect loop, then the call terminates with a typed failure rather than continuing.
- [ ] Given a relative, absent, empty, or unparseable `Location`, then it is resolved before comparison or rejected as a typed failure.
- [ ] Given a successful SVG render, then the LilyPond version string and bounded warning count are returned for persistence in the current-Piece render metadata, and raw warning text is never persisted or shown to a student.

### User stories addressed

- User story 67: Authenticated, bounded, well-formed requests at the documented endpoints
- User story 68: Strict multipart response and media-type validation

---
