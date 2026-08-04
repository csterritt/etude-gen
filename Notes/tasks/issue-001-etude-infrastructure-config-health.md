# Tasks for #1: Etude infrastructure configuration and health validation

Parent issue: #1
Parent PRD: `Notes/PRD-etude-generator.md`

## Tasks

### 1. Add R2 + LilyPond bindings to wrangler and types

**Type**: CONFIG
**Output**: `wrangler.jsonc` declares a private R2 binding (no public URL, no user-derived key namespace); `src/local-types.ts` `Bindings` interface includes the R2 binding plus `LILYPOND_SERVICE_URL`, `LILYPOND_API_KEY`, and `LILYPOND_TIMEOUT_MS`. `npm run cf-typegen` and `wrangler build` still succeed.
**Depends on**: none

This is a configuration-only change. Declare a private R2 bucket binding in `wrangler.jsonc` alongside the existing `d1_databases` entry — do not add a public bucket URL or any user-derived key namespace. Add `LILYPOND_TIMEOUT_MS` to the `vars` block with no default in `wrangler.jsonc` (the 30,000 default is resolved in code by the validator in task 3, not pinned in wrangler). Then extend the `Bindings` interface in `src/local-types.ts` with the new R2 binding (typed as `R2Bucket`), `LILYPOND_SERVICE_URL?: string`, `LILYPOND_API_KEY?: string`, and `LILYPOND_TIMEOUT_MS?: string`. Run `npm run cf-typegen` to confirm the generated `worker-configuration.d.ts` agrees with the manual types. Do not add any runtime behavior in this task.

---

### 2. Config validator tests

**Type**: RED
**Output**: `tests/config-validator.spec.ts` containing failing assertions that: a complete configuration passes; each individually missing value among the D1 binding, R2 binding, `LILYPOND_SERVICE_URL`, and `LILYPOND_API_KEY` fails with a message naming that value; a non-numeric `LILYPOND_TIMEOUT_MS` fails; a non-positive `LILYPOND_TIMEOUT_MS` fails; an absent `LILYPOND_TIMEOUT_MS` resolves to 30,000 milliseconds; and every defect present is reported together in one result rather than failing on the first one. No assertion reads or expects a secret value.

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, arrow functions, types, braces around all `if`/`while` bodies, kebab-case test filenames, `bun:test`).

Write `tests/config-validator.spec.ts` using `bun:test`. The validator does not exist yet, so these tests must fail. Use a small fake bindings object shaped like the `Bindings` interface from `src/local-types.ts` to feed the validator; do not touch real Cloudflare bindings. Assert the public result shape: a pass/fail flag, a resolved `lilypondTimeoutMs` (number), and a list of named defects. Assert that the defect list names every missing or malformed value when multiple are missing at once. Assert that no defect entry or pass/fail payload contains a secret value (e.g. assert the API key string never appears in any defect text). Reference `tests/validators.spec.ts` for the existing `bun:test` style in this repo.

---

### 3. Config validator implementation

**Type**: GREEN
**Output**: `src/lib/config-validator.ts` (or similarly named module under `src/lib/`) that makes the task-2 tests pass. It collects every defect in one pass, resolves `LILYPOND_TIMEOUT_MS` defaulting to 30,000 when absent, and never emits secret values in defect text.

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, early returns, RO-RO where useful, `readonly` for immutable result fields).

Implement the minimal code to make task-2 tests pass. Accept a `Bindings`-shaped input (or a focused subset typed explicitly) and return a typed result with: a healthy flag, the resolved `lilypondTimeoutMs` number, and a list of defects each naming the affected value. Check the D1 binding, the R2 binding, `LILYPOND_SERVICE_URL` (non-empty string), `LILYPOND_API_KEY` (non-empty string), and `LILYPOND_TIMEOUT_MS` (parse to a positive finite number, defaulting to 30,000 when absent). Collect all defects before returning. Defect messages must name the value but must never include the resolved secret value itself. Do not add health-route or HTTP behavior here — that is task 5. Follow the existing `src/lib/` module style (see `src/lib/validators.ts`, `src/lib/url-validation.ts`).

---

### 4. Health route tests

**Type**: RED
**Output**: `tests/health-route.spec.ts` (and/or an e2e test under `e2e-tests/` if HTTP behavior is easier to assert there) containing failing assertions that: an anonymous request to the health route returns a payload carrying only a healthy or unhealthy result with no binding names, configuration value names, defect detail, or secret values; a privileged operator context (and the deployment/startup log path) receives the detailed report naming every missing value while still containing no secret values; and the rhythm-catalog health surface is pluggable so a catalog validator owned by Issue 12 can contribute to the same health result without this slice implementing catalog rules.

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test` for unit tests, Playwright for e2e, kebab-case filenames, `data-testid` attributes named `name-action` for any actionable elements).

Write failing tests for the health route. The anonymous liveness response must be a small fixed shape — assert it contains only a healthy/unhealthy indicator and nothing else (no value names, no resolved values, no binding names, no defect detail, no secrets). The privileged detailed report must include every named defect from the config validator and must still contain no secret values. Include a test that simulates a malformed rhythm-catalog contribution and asserts the aggregate health result is unhealthy, while leaving the actual catalog parsing rules stubbed (they are owned by Issue 12) — this slice only provides the surface the catalog reports through. Prefer a `bun:test` unit test invoking the route handler directly with a fake `Bindings` and a fake operator-context discriminator; add an e2e test under `e2e-tests/` only if the anonymous-vs-privileged split is best asserted over HTTP. Look in `e2e-tests/support` and `e2e-tests/sign-in` for helpers and examples before writing e2e.

---

### 5. Health route implementation

**Type**: GREEN
**Output**: `src/routes/build-health.tsx` (split anonymous liveness + privileged detailed report) wired into `src/index.ts`, making the task-4 tests pass. Anonymous responses carry only healthy/unhealthy; privileged operator context and the deployment/startup log receive the named-defect report; secret values never appear in either form.

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, Hono route style matching existing routes, `data-testid` naming for any actionable elements).

Implement the health route as two surfaces sharing one config-validator call. The anonymous liveness response returns only a healthy/unhealthy result — no value names, no resolved values, no binding names, no defect detail, no secrets. The detailed report is reachable only from a privileged operator context and the deployment/startup log path; it names every missing or malformed value from the validator and still contains no secret values. Provide the rhythm-catalog health surface as a pluggable contribution point (a typed slot the catalog validator from Issue 12 can fill) without implementing catalog parsing rules here. Wire the route into `src/index.ts` following the pattern of the existing `buildPrivate`/`buildRoot` route registrations. Use the existing `src/lib/logger.ts` for the startup/deployment log path. Do not embed any permanent LilyPond version string in this code.

---

### 6. No hard-coded LilyPond version check tests

**Type**: RED
**Output**: `tests/no-hardcoded-lilypond-version.spec.ts` containing a failing assertion that no permanent LilyPond version string exists in application source under `src/`.

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, `bun:test`, kebab-case test filenames).

Write a failing `bun:test` test that scans `src/` for any hard-coded LilyPond version string (e.g. `2.x.y`-shaped literals paired with `lilypond`/`LilyPond` context, or any constant intended to pin a permanent version) and asserts none exists. The test should not flag the SVG render metadata field that retains the service-reported version for diagnosis — only a permanent version embedded in application source or the Piece contract. This test fails initially only if such a string already exists; otherwise it serves as a guardrail and passes immediately, in which case treat the GREEN task as a no-op verification.

---

### 7. No hard-coded LilyPond version check implementation

**Type**: GREEN
**Output**: A repo-wide scan (either the test itself or a small helper it calls) making the task-6 test pass and serving as a permanent guardrail against embedded LilyPond version strings.

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md`.

If task 6 already passes, record that no implementation is needed beyond the test as a guardrail. If a hard-coded version string is found in `src/`, remove or replace it so the test passes — the reported version is retained only with SVG render metadata for diagnosis, never embedded as a permanent version in application source or the Piece contract. Keep the test in place as the permanent guardrail.

---

### 8. Document configuration and health surface

**Type**: DOCUMENT
**Output**: Wiki/Notes updates describing the private R2 binding, the `LILYPOND_SERVICE_URL`/`LILYPOND_API_KEY` secrets, the `LILYPOND_TIMEOUT_MS` variable defaulting to 30,000, the split health route contract (anonymous liveness vs. privileged detailed report), the rhythm-catalog health surface reserved for Issue 12, and the deployment-acceptance LilyPond version check. Follow `Notes/wiki/wiki-rules.md` and `Notes/wiki/AGENTS.md` for wiki ingestion.

Update the relevant wiki pages (`Notes/wiki/source-code.md`, `Notes/wiki/index.md`, `Notes/wiki/log.md`) and any Notes README/AGENTS files that list configuration. Append a `## [YYYY-MM-DD] ingest | issue-001 config and health` entry to `Notes/wiki/log.md`. Do not modify the parent issue or the parent PRD.

---

### 9. Code walkthrough

**Type**: CODE WALKTHROUGH
**Output**: `Notes/walkthroughs/issue-001-etude-infrastructure-config-health/code-walkthrough/` containing the files generated by `uvx showboat` for this implementation.

Run `uvx showboat --help` for current usage, then generate a walkthrough of the issue-001 implementation into a new directory `Notes/walkthroughs/issue-001-etude-infrastructure-config-health/code-walkthrough/`. Place all generated files there.

---

### 10. Human: provision R2 bucket, LilyPond secrets, confirm local dev story

**Type**: REVIEW
**Output**: A human creates the private Cloudflare R2 bucket, provisions the `LILYPOND_SERVICE_URL` and `LILYPOND_API_KEY` secrets, and confirms the local development story for both R2 and the LilyPond service (e.g. local miniflare/wrangler binding and a reachable dev LilyPond endpoint or stub).

This is a human-in-the-loop step. The human must: create the private R2 bucket referenced by the binding declared in task 1; provision `LILYPOND_SERVICE_URL` and `LILYPOND_API_KEY` as Worker secrets (never commit them); confirm the local development story for both the R2 binding and the LilyPond service so a developer can run `npm run dev-open-sign-up` with the etude config available. Do not commit secrets. Do not modify repository security policies to work around provisioning.

---

### 11. Human: deployment-acceptance LilyPond version check

**Type**: REVIEW
**Output**: At deployment acceptance, a human queries the external LilyPond service, confirms its reported version matches the then-current stable LilyPond release, and confirms no permanent LilyPond version string is embedded in the application or the Piece contract.

This is a human-in-the-loop step. The human must: query the external LilyPond service for its reported version; check that version against the then-current stable LilyPond release; confirm the application embeds no permanent version string (the task-6/7 guardrail passes) and that the reported version is retained only with SVG render metadata for diagnosis. Record the result in the deployment acceptance notes. Do not pin a permanent version in code.

---
