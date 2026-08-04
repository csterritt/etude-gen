# Wiki Log

A chronological, append-only log of ingests, queries, and lint passes.

## [2026-08-04] ingest | issue-001 etude infrastructure config and health

Ingested the configuration and health validation surface for the etude feature (issue #1).

New source files:
- `src/lib/config-validator.ts` — validates etude configuration bindings (D1, R2, LilyPond secrets, timeout) and collects all defects in one pass.
- `src/routes/build-health.tsx` — split health route with anonymous liveness and privileged detailed report; pluggable rhythm-catalog health surface.

Modified source files:
- `wrangler.jsonc` — added private R2 bucket binding (`ETUDE_GEN_STORAGE`) and LilyPond vars (`LILYPOND_SERVICE_URL`, `LILYPOND_API_KEY`, `LILYPOND_TIMEOUT_MS`).
- `src/local-types.ts` — extended `Bindings` with R2 binding, LilyPond vars, and `OPERATOR_TOKEN`.
- `src/constants.ts` — added `PATHS.HEALTH`.
- `src/index.ts` — wired `buildHealth` route.

New test files:
- `tests/config-validator.spec.ts` — 16 tests covering complete config, missing values, timeout validation, aggregate defects, and no-secret-leak guarantees.
- `tests/health-route.spec.ts` — 13 tests covering anonymous liveness, privileged detailed report, catalog contribution surface, and no-secret-leak guarantees.
- `tests/no-hardcoded-lilypond-version.spec.ts` — 1 guardrail test ensuring no permanent LilyPond version string in `src/`.
