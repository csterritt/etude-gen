## Issue 20: Ops hardening — correlation IDs, safe errors, PII-free logging, health checks, orphan-cleanup policy

**Type**: AFK
**Blocked by**: Issue 19

### Parent PRD

`PRD-etude-generator.md`

### What to build

The cross-cutting operational contract applied across all etude routes and modules, end-to-end. Every request receives an application-generated UUID included in structured logs and the `X-Correlation-ID` response header; unexpected user-facing errors show a safe generic message plus that correlation identifier, never sensitive technical details. Logs contain no names, email addresses, session values, Bearer tokens, secrets, service credentials, or LilyPond request bodies (extend the existing logger/sanitizer as needed). The startup health check is completed: required database, object-storage, LilyPond, and authentication configuration validated (building on Issue 13), and the rhythm catalog validated for syntax, supported tokens, exact measure lengths, and at least one pattern per supported time signature. Database or storage failures leave the last committed workflow coherent — no mismatched settings and music — producing generic retry messages. The artifact orphan policy is verified end-to-end: exhausted deletions log opaque, user-free identifiers with the exact `artifact_cleanup_exhausted` fields.

### How to verify

- **Manual**: trigger a simulated failure (test-only failure hooks, per existing database-failure prior art) and confirm the error page shows a safe message with a correlation ID that also appears in logs and the response header; scan logs for PII/secrets; boot with an invalid catalog or missing config and confirm the health check fails.
- **Automated**: Playwright tests for generic errors with correlation IDs; Bun tests for correlation-ID propagation, log sanitization coverage, health-check validation of config and catalog, and coherent-state guarantees under injected D1/R2 failures at module boundaries.

### Acceptance criteria

- [ ] Given any etude request, then it carries a correlation UUID visible in structured logs and the `X-Correlation-ID` header.
- [ ] Given an unexpected error, when the student sees the failure, then the message is safe, generic, and includes the correlation identifier.
- [ ] Given any logged event, then it contains no PII, session values, tokens, secrets, or LilyPond request bodies.
- [ ] Given missing/invalid required config or a malformed rhythm catalog, when the startup health check runs, then the application is not considered healthy.
- [ ] Given a mid-operation D1 or R2 failure, when the student retries or navigates, then the visible workflow state is the last coherent committed state with a generic retry message.

### User stories addressed

- User story 47: safe error message with correlation identifier
- User story 63: unexpected errors logged with correlation IDs, no PII or secrets
- User story 64: failed artifact deletions retried and logged as unreachable orphans
- User story 65: required configuration validated before healthy
- User story 66: rhythm catalog validated before healthy

---
