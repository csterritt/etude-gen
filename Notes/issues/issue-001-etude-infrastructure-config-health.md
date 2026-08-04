## Issue 1: Etude infrastructure configuration and health validation

**Type**: HITL
**Blocked by**: None — can start immediately

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Add the infrastructure configuration the etude feature depends on and make missing or invalid configuration fail a health check rather than surface as an action-time error to a student. Covers the "Configuration and health" section of the PRD: the private R2 binding, the `LILYPOND_SERVICE_URL` and `LILYPOND_API_KEY` secrets, and the numeric `LILYPOND_TIMEOUT_MS` variable defaulting to 30,000, alongside the existing D1 and authentication configuration.

The binding must be declared in `wrangler.jsonc`, added to the `Bindings` type in `src/local-types.ts`, and covered by a configuration validator that reports every missing or malformed value together rather than failing on the first one. The R2 bucket is private — no public URL, no user-derived key namespace.

The health check is exposed as a route, and that route is not publicly informative. It is split in two. The unauthenticated liveness response carries only a healthy or unhealthy result: no value names, no resolved values, no secret values, no binding names, and no defect detail. The detailed report that names every missing or malformed value is available only to a privileged operator context and to the deployment/startup log; anonymous users cannot reach it in production. Names appear in the detailed report only where an operator needs them to fix the defect, and secret values never appear in either form.

The external service's reported LilyPond version is not pinned in code and is not part of the Piece contract. No permanent version string is embedded anywhere in the application: the reported version is retained with SVG render metadata for diagnosis, and deployment acceptance checks it against the then-current stable release as a human step in this slice.

The rhythm catalog contributes to the same health result, but the catalog parsing and its validation rules are owned by Issue 12; this slice only provides the health surface the catalog reports through.

This slice is HITL because a human must create the Cloudflare R2 bucket, provision the LilyPond service secrets, confirm the local development story for both, and perform the deployment-acceptance LilyPond version check.

### How to verify

- **Manual**: run the dev server with a required secret removed and confirm the detailed operator report names it and the application is not considered healthy, while the anonymous liveness response says only unhealthy; restore it and confirm both pass. Query the external service and confirm its reported LilyPond version matches the current stable release at deployment acceptance.
- **Automated**: Bun tests over the configuration validator asserting that a complete configuration passes, that each individually missing value fails with a message naming the value, that a non-numeric or non-positive `LILYPOND_TIMEOUT_MS` fails, and that an absent `LILYPOND_TIMEOUT_MS` defaults to 30,000. Further tests assert the anonymous liveness payload contains only the healthy or unhealthy result, and a repository-wide check asserts no hard-coded LilyPond version string exists in application source.

### Acceptance criteria

- [ ] Given a complete configuration, when the health check runs, then it reports healthy, and the detailed operator report includes the resolved timeout value.
- [ ] Given a missing D1 binding, R2 binding, `LILYPOND_SERVICE_URL`, or `LILYPOND_API_KEY`, when the health check runs, then it fails and names every missing value.
- [ ] Given a `LILYPOND_TIMEOUT_MS` that is not a positive number, when the health check runs, then it fails.
- [ ] Given no `LILYPOND_TIMEOUT_MS`, when configuration is resolved, then the timeout is 30,000 milliseconds.
- [ ] Given the health check output, then it contains no secret values.
- [ ] Given an anonymous request to the health route in production, then the response reports only healthy or unhealthy and names no binding, configuration value, or defect.
- [ ] Given a privileged operator context or the deployment/startup log, when a required value is missing, then the detailed report names every missing value and still contains no secret values.
- [ ] Given the deployment-acceptance step, then the external service's reported LilyPond version is checked against the then-current stable release, and no permanent LilyPond version string is embedded in the application or the Piece contract.
- [ ] Given a malformed rhythm catalog, then the same health result is unhealthy, with the catalog validation rules owned by Issue 12.

### User stories addressed

- User story 65: Required configuration validated before the application is healthy

---
