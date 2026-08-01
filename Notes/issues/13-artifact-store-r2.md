## Issue 13: Artifact store + R2 binding and secrets configuration

**Type**: HITL — a human must decide/confirm the Cloudflare resource setup (R2 bucket provisioning, `wrangler.jsonc` bindings, and secret names/values) before or during implementation
**Blocked by**: Issue 1

### Parent PRD

`PRD-etude-generator.md`

### What to build

The Artifact Store module over private R2 plus the configuration it needs, end-to-end from binding to typed operations. Add the private R2 binding to `wrangler.jsonc` (no public URL ever), the `LILYPOND_SERVICE_URL` and `LILYPOND_API_KEY` secrets, and `LILYPOND_TIMEOUT_MS` (default 30,000 ms); missing or invalid required configuration fails the startup health check. The Artifact Store stores and retrieves bounded SVG (5 MB) and PDF (10 MB) data under opaque identifiers containing no user identifier, validates expected object metadata, deletes with the defined retry policy (initial attempt plus retries at 100/200/400 ms), and returns typed missing/size/storage/cleanup-exhausted failures. Exhausted cleanup emits the structured `artifact_cleanup_exhausted` log with the exact PRD field set while the user operation proceeds and the object stays unreachable.

### How to verify

- **Manual**: deploy/dev-run with a missing secret and confirm the health check fails; with valid config, store and fetch an object through a test-only diagnostic and confirm no public URL exists.
- **Automated**: Bun tests against a fake R2 boundary covering privacy, actual byte limits, missing objects, metadata mismatch, retry delays, and the exact structured orphan-cleanup log event and fields after exhausted cleanup; config-validation tests for each required variable.

### Acceptance criteria

- [ ] Given missing or invalid required configuration, when the deployment/startup health check runs, then it fails.
- [ ] Given stored artifacts, then they are reachable only through the authenticated binding under opaque, user-independent identifiers with enforced byte limits.
- [ ] Given deletion failures, when retries exhaust, then the exact `artifact_cleanup_exhausted` structured log is emitted and the user operation still completes with the object unreachable.

### User stories addressed

- User story 65: required configuration validated before healthy (partial; full check completed in Issue 20)

---
