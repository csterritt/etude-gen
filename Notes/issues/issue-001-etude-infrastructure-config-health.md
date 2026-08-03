## Issue 1: Etude infrastructure configuration and health validation

**Type**: HITL
**Blocked by**: None — can start immediately

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Add the infrastructure configuration the etude feature depends on and make missing or invalid configuration fail a health check rather than surface as an action-time error to a student. Covers the "Configuration and health" section of the PRD: the private R2 binding, the `LILYPOND_SERVICE_URL` and `LILYPOND_API_KEY` secrets, and the numeric `LILYPOND_TIMEOUT_MS` variable defaulting to 30,000, alongside the existing D1 and authentication configuration.

The binding must be declared in `wrangler.jsonc`, added to the `Bindings` type in `src/local-types.ts`, and covered by a configuration validator that reports every missing or malformed value together rather than failing on the first one. The R2 bucket is private — no public URL, no user-derived key namespace.

This slice is HITL because a human must create the Cloudflare R2 bucket, provision the LilyPond service secrets, and confirm the local development story for both.

### How to verify

- **Manual**: run the dev server with a required secret removed and confirm the health check reports it by name and the application is not considered healthy; restore it and confirm the health check passes.
- **Automated**: Bun tests over the configuration validator asserting that a complete configuration passes, that each individually missing value fails with a message naming the value, that a non-numeric or non-positive `LILYPOND_TIMEOUT_MS` fails, and that an absent `LILYPOND_TIMEOUT_MS` defaults to 30,000.

### Acceptance criteria

- [ ] Given a complete configuration, when the health check runs, then it reports healthy and the resolved timeout value.
- [ ] Given a missing D1 binding, R2 binding, `LILYPOND_SERVICE_URL`, or `LILYPOND_API_KEY`, when the health check runs, then it fails and names every missing value.
- [ ] Given a `LILYPOND_TIMEOUT_MS` that is not a positive number, when the health check runs, then it fails.
- [ ] Given no `LILYPOND_TIMEOUT_MS`, when configuration is resolved, then the timeout is 30,000 milliseconds.
- [ ] Given the health check output, then it contains no secret values.

### User stories addressed

- User story 65: Required configuration validated before the application is healthy

---
