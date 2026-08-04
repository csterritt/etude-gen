# Unit Tests

A catalog and summaries of all unit tests under `tests/`.

## config-validator.spec.ts

16 tests covering `validateEtudeConfig` from `src/lib/config-validator.ts`:

- Complete configuration passes and includes the resolved timeout.
- Each individually missing value (`PROJECT_DB`, `ETUDE_GEN_STORAGE`, `LILYPOND_SERVICE_URL`, `LILYPOND_API_KEY`) fails and names that value.
- `LILYPOND_TIMEOUT_MS` validation: defaults to 30,000 when absent; fails when non-numeric, zero, or negative; passes when positive.
- Aggregate defect reporting: all defects reported together, not first-only.
- No secret values in output: API key value never appears in any defect text.

## health-route.spec.ts

13 tests covering `runHealthCheck`, `buildAnonymousLiveness`, and `buildDetailedReport` from `src/routes/build-health.tsx`:

- Config contribution: healthy when complete, unhealthy when incomplete.
- Rhythm catalog contribution surface: unhealthy when catalog is unhealthy, healthy when both pass, aggregates defects, healthy when no catalog contribution.
- Anonymous liveness: only a healthy flag; no binding names, value names, defect detail, resolved values, or secrets.
- Privileged detailed report: names every missing value, includes resolved timeout, never contains secret values.

## no-hardcoded-lilypond-version.spec.ts

1 guardrail test scanning `src/` for any hard-coded LilyPond version string (e.g. `2.x.y` near "lilypond" context). Ensures no permanent version is embedded in application source; the reported version is retained only with SVG render metadata for diagnosis.
