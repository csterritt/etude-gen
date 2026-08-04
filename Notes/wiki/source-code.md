# Source Code

A catalog and summaries of all source files under `src/`.

## lib/

### config-validator.ts

Validates the etude feature's required configuration bindings in one pass, collecting every defect rather than failing on the first. Checks the D1 binding (`PROJECT_DB`), the private R2 binding (`ETUDE_GEN_STORAGE`), `LILYPOND_SERVICE_URL`, `LILYPOND_API_KEY`, and `LILYPOND_TIMEOUT_MS`. The timeout defaults to 30,000 milliseconds when absent and must be a positive finite number when present. Defect messages name the affected value but never include resolved secret values. Exports `validateEtudeConfig`, `DEFAULT_LILYPOND_TIMEOUT_MS`, and the `ConfigDefect` / `ConfigValidationResult` / `EtudeConfigInput` types.

## routes/

### build-health.tsx

The health route for the etude feature, split into two surfaces sharing one validation pass:

- **Anonymous liveness**: returns only `{ healthy: boolean }` — no value names, no resolved values, no binding names, no defect detail, no secrets.
- **Privileged detailed report**: available only to a privileged operator context (gated by `OPERATOR_TOKEN` via the `X-Operator-Token` header) and to the deployment/startup log via `logInfo`/`logError`. Names every defect and includes the resolved `lilypondTimeoutMs`, but still contains no secret values.

The rhythm-catalog health surface is a pluggable `CatalogHealthContribution` type; the catalog parsing and validation rules are owned by Issue 12. This slice only provides the surface the catalog reports through. Exports `runHealthCheck`, `buildAnonymousLiveness`, `buildDetailedReport`, and the `HealthResult` / `CatalogHealthContribution` / `AnonymousLivenessPayload` / `DetailedHealthReport` types.

## Configuration bindings

The etude feature depends on the following bindings declared in `wrangler.jsonc` and typed in `src/local-types.ts`:

| Binding | Type | Purpose |
|---|---|---|
| `PROJECT_DB` | D1Database | Existing D1 binding (authoritative for ownership and artifact reachability) |
| `ETUDE_GEN_STORAGE` | R2Bucket | Private R2 bucket for etude score/PDF artifacts — no public URL |
| `LILYPOND_SERVICE_URL` | string (secret) | Base URL of the external LilyPond engraving service |
| `LILYPOND_API_KEY` | string (secret) | Bearer token for LilyPond service authentication |
| `LILYPOND_TIMEOUT_MS` | string (var) | LilyPond request timeout in ms; defaults to 30,000 when absent |
| `OPERATOR_TOKEN` | string (secret) | Gates the privileged detailed health report |

The R2 bucket is private — no public URL, no user-derived key namespace. The reported LilyPond version is retained only with SVG render metadata for diagnosis; no permanent version string is embedded in the application or the Piece contract. Deployment acceptance checks the service-reported version against the then-current stable release as a human step.
