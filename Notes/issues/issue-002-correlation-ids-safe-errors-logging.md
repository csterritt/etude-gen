## Issue 2: Correlation IDs, safe error responses, and PII-free structured logging

**Type**: AFK
**Blocked by**: None — can start immediately

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Give every request an application-generated UUID, expose it on the `X-Correlation-ID` response header, include it in structured logs, and show it in the generic message a student sees for an unexpected error. Covers the correlation and logging decisions in the PRD's "Validation, errors, logging, and accessibility" section.

Extend the existing structured logging utilities in `src/lib/logger.ts` rather than creating a parallel logging system. Logs must never contain names, email addresses, session values, Bearer tokens, secrets, service credentials, or LilyPond request bodies.

Correlation propagation does not stop at the response. The identifier is threaded into every Workflow Service operation, renderer call, repository call, and artifact-store call a request triggers, and into work that outlives the response, including artifact cleanup and deferred cleanup. Deferred work that runs with no remaining request context generates its own operation correlation identifier and labels it as such, so an operation-originated line is distinguishable from a request-originated one.

Refusals carry a typed category rather than free prose: lost-lock, stale-operation, stale-epoch, and stale-Piece refusals are logged with that category and enough context to diagnose them without a user identifier, Piece content, LilyPond source, grant identifier, or credential. Routine successful operations are not logged merely for completeness; volume is reserved for failures, refusals, and cleanup outcomes.

### Cross-cutting contract

Inherits `Notes/issues/etude-cross-cutting-contract.md`:

- Section 1: universal route requirements — this slice builds the `X-Correlation-ID` header and the identifier every other route relies on.
- Section 7: correlation and logging propagation — this slice builds all four rules, and later issues inherit them.

### How to verify

- **Manual**: visit any page and confirm the `X-Correlation-ID` response header is present; trigger an unexpected server error and confirm the page shows a generic safe message plus the same identifier that appears in the server log line.
- **Automated**: Bun tests asserting a generated identifier is a UUID, that the log payload redacts each sensitive field category, and that the user-facing error text carries the identifier but no technical detail. Further tests assert that a request's identifier reaches stub Workflow Service, renderer, repository, and artifact-store calls; that deferred cleanup started by a request carries the originating identifier; that deferred cleanup with no request context generates its own identifier labelled as an operation identifier; that each of the four refusal categories is logged with its typed category and none of the forbidden fields; and that a routine successful operation emits no log line. A Playwright test asserts the header is present and that a forced unexpected error renders the safe message with a visible identifier.

### Acceptance criteria

- [ ] Given any request, when a response is returned, then it carries an `X-Correlation-ID` header containing a generated UUID.
- [ ] Given an unexpected error, when the error page renders, then it shows a generic message and the request's correlation identifier and no stack trace, SQL, or service detail.
- [ ] Given a log entry for that error, then it contains the same correlation identifier and no PII or secret values.
- [ ] Given two separate requests, then their correlation identifiers differ.
- [ ] Given a request that triggers a Workflow Service operation, renderer call, repository call, or artifact-store call, then that call receives the request's correlation identifier.
- [ ] Given work that outlives the response, such as artifact cleanup or deferred cleanup, then it logs the originating correlation identifier.
- [ ] Given deferred work with no remaining request context, then it generates its own operation correlation identifier and labels it as an operation identifier rather than a request one.
- [ ] Given a lost-lock, stale-operation, stale-epoch, or stale-Piece refusal, then it is logged with a typed category and no user identifier, Piece content, LilyPond source, grant identifier, or credential.
- [ ] Given a routine successful operation, then no log line is emitted merely for completeness.

### User stories addressed

- User story 47: Safe message and correlation identifier for unexpected errors
- User story 63: Unexpected errors logged with a correlation identifier and no PII or secrets

---
