## Issue 2: Correlation IDs, safe error responses, and PII-free structured logging

**Type**: AFK
**Blocked by**: None — can start immediately

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Give every request an application-generated UUID, expose it on the `X-Correlation-ID` response header, include it in structured logs, and show it in the generic message a student sees for an unexpected error. Covers the correlation and logging decisions in the PRD's "Validation, errors, logging, and accessibility" section.

Extend the existing structured logging utilities in `src/lib/logger.ts` rather than creating a parallel logging system. Logs must never contain names, email addresses, session values, Bearer tokens, secrets, service credentials, or LilyPond request bodies.

### How to verify

- **Manual**: visit any page and confirm the `X-Correlation-ID` response header is present; trigger an unexpected server error and confirm the page shows a generic safe message plus the same identifier that appears in the server log line.
- **Automated**: Bun tests asserting a generated identifier is a UUID, that the log payload redacts each sensitive field category, and that the user-facing error text carries the identifier but no technical detail. A Playwright test asserts the header is present and that a forced unexpected error renders the safe message with a visible identifier.

### Acceptance criteria

- [ ] Given any request, when a response is returned, then it carries an `X-Correlation-ID` header containing a generated UUID.
- [ ] Given an unexpected error, when the error page renders, then it shows a generic message and the request's correlation identifier and no stack trace, SQL, or service detail.
- [ ] Given a log entry for that error, then it contains the same correlation identifier and no PII or secret values.
- [ ] Given two separate requests, then their correlation identifiers differ.

### User stories addressed

- User story 47: Safe message and correlation identifier for unexpected errors
- User story 63: Unexpected errors logged with a correlation identifier and no PII or secrets

---
