# Issue 12: Rhythm catalog packaging, health validation, and eligible-rhythm calculation

*2026-08-07T18:39:13Z by Showboat 0.6.1*
<!-- showboat-id: d3a1207d-b808-4e4c-92e3-8459950b9e5b -->

This walkthrough covers the Issue 12 implementation: the rhythm catalog parser, validator, eligible-rhythm calculation, build-time packaging, and health-route catalog wiring. It walks through (1) the token-duration and measure-length tables and the supported token/meter sets, (2) the parseRhythmCatalog pure function with exact eighth-note-unit arithmetic, syntax/heading validation naming the meter and line, and de-duplication of duplicate patterns, (3) the computeEligibleRhythms pure function returning only patterns whose every token is selected, (4) the build-time packaging step that reads Notes/all-rhythms.txt and emits a generated, gitignored src/lib/rhythm-catalog-data.ts bundled into the worker, and (5) the health-route catalog wiring via buildCatalogHealthContribution. Each section includes executable test runs as proof.

## 1. Token durations, measure lengths, and supported sets

The rhythm catalog module (src/lib/rhythm-catalog.ts) exports the fixed token-duration and measure-length tables. Token durations are in quarter-note beats: W=4 (whole), H=2 (half), D=3 (dotted-half), Q=1 (quarter), R=1.5 (dotted-quarter), E=0.5 (eighth). Measure lengths per supported meter: 2/4=2, 3/4=3, 4/4=4 quarter-note beats. The supported token and meter sets are derived from these tables.

```bash
bun test tests/rhythm-catalog.spec.ts 2>&1 | grep -E 'TOKEN_DURATIONS|MEASURE_LENGTHS|SUPPORTED' | head -10
```

```output
(pass) TOKEN_DURATIONS - exact quarter-note-beat values > maps each supported token to its exact duration in quarter-note beats [0.14ms]
(pass) TOKEN_DURATIONS - exact quarter-note-beat values > contains exactly the six supported tokens [0.10ms]
(pass) MEASURE_LENGTHS - exact quarter-note-beat values per meter > maps each supported meter to its exact measure length in quarter-note beats [0.05ms]
(pass) MEASURE_LENGTHS - exact quarter-note-beat values per meter > contains exactly the three supported meters [0.04ms]
(pass) SUPPORTED_TOKENS and SUPPORTED_METERS > exposes the supported token set matching the duration table keys [0.03ms]
(pass) SUPPORTED_TOKENS and SUPPORTED_METERS > exposes the supported meter set matching the measure-length table keys [0.03ms]
```

## 2. parseRhythmCatalog: exact arithmetic, syntax/heading validation, de-duplication

The parseRhythmCatalog function is a pure arrow function returning Result<RhythmCatalog, readonly CatalogDefect[]>. It validates syntax (supported tokens only, supported headings only), exact measure length for every pattern under its heading, and at least one pattern per supported meter, collecting every defect in one pass. Length validation uses exact arithmetic: every duration and measure length is counted in eighth-note units (quarter beats multiplied by 2) and compared as integers, never accumulated floating-point sums with a tolerance, so a pattern of eighths and dotted quarters is judged exactly. Each CatalogDefect names the offending meter and the 1-based line number. Duplicate identical patterns under the same heading are deliberately allowed in the curated file; the parsed catalog de-duplicates them, preserving first-appearance order, so each distinct pattern appears exactly once.

```bash
bun test tests/rhythm-catalog.spec.ts 2>&1 | tail -25
```

```output
(pass) TOKEN_DURATIONS - exact quarter-note-beat values > contains exactly the six supported tokens [0.04ms]
(pass) MEASURE_LENGTHS - exact quarter-note-beat values per meter > maps each supported meter to its exact measure length in quarter-note beats [0.03ms]
(pass) MEASURE_LENGTHS - exact quarter-note-beat values per meter > contains exactly the three supported meters [0.02ms]
(pass) SUPPORTED_TOKENS and SUPPORTED_METERS > exposes the supported token set matching the duration table keys [0.02ms]
(pass) SUPPORTED_TOKENS and SUPPORTED_METERS > exposes the supported meter set matching the measure-length table keys [0.02ms]
(pass) parseRhythmCatalog - valid catalogs > parses a catalog with one pattern per supported meter into an Ok catalog [0.78ms]
(pass) parseRhythmCatalog - valid catalogs > every parsed pattern sums exactly to its heading measure length in eighth-note units [0.28ms]
(pass) parseRhythmCatalog - exact arithmetic, no floating-point tolerance > accepts a pattern of eighths and dotted quarters exactly at the measure length [0.06ms]
(pass) parseRhythmCatalog - exact arithmetic, no floating-point tolerance > rejects the same fractional pattern one eighth-note short of the measure length [0.28ms]
(pass) parseRhythmCatalog - exact arithmetic, no floating-point tolerance > rejects the same fractional pattern one eighth-note long of the measure length [0.09ms]
(pass) parseRhythmCatalog - syntax and heading defects > rejects an unknown token under a supported heading, naming the meter and line [0.05ms]
(pass) parseRhythmCatalog - syntax and heading defects > rejects a missing heading (a supported meter with no patterns), naming the meter [0.04ms]
(pass) parseRhythmCatalog - syntax and heading defects > rejects an unsupported heading, naming the heading [0.23ms]
(pass) parseRhythmCatalog - syntax and heading defects > rejects a malformed heading line, naming the line [0.08ms]
(pass) parseRhythmCatalog - syntax and heading defects > reports every defect together rather than failing on the first one [0.07ms]
(pass) parseRhythmCatalog - de-duplication on packaging > passes validation with two identical patterns under the same heading [0.25ms]
(pass) parseRhythmCatalog - de-duplication on packaging > contains a duplicated pattern exactly once in the parsed catalog [0.08ms]
(pass) parseRhythmCatalog - real curated catalog at Notes/all-rhythms.txt > validates the real catalog with all three supported meters present [1.06ms]
(pass) parseRhythmCatalog - real curated catalog at Notes/all-rhythms.txt > every pattern in the real catalog sums exactly to its heading measure length [0.81ms]
(pass) parseRhythmCatalog - real curated catalog at Notes/all-rhythms.txt > the real catalog contains no duplicate patterns after packaging [0.33ms]

 21 pass
 0 fail
 195 expect() calls
Ran 21 tests across 1 file. [44.00ms]
```

## 3. computeEligibleRhythms: token-selection filter

The computeEligibleRhythms function is a pure arrow function returning the patterns for the given meter whose every token is in the selected set. A selection with no qualifying pattern returns an empty array (never an error and never a thrown exception). An unsupported meter returns an empty array. Because the parsed catalog is already de-duplicated, the eligible set contains no duplicate patterns. The function does not mutate its arguments.

```bash
bun test tests/rhythm-catalog-eligible.spec.ts 2>&1 | tail -15
```

```output

tests/rhythm-catalog-eligible.spec.ts:
(pass) computeEligibleRhythms - token-selection filter > returns only patterns whose every token is in the selected set [2.31ms]
(pass) computeEligibleRhythms - token-selection filter > returns multiple patterns when all their tokens are selected [0.27ms]
(pass) computeEligibleRhythms - token-selection filter > returns a single-token pattern when only that token is selected [0.16ms]
(pass) computeEligibleRhythms - token-selection filter > returns an empty array when no pattern qualifies, rather than throwing [0.14ms]
(pass) computeEligibleRhythms - token-selection filter > returns an empty array for a meter with patterns but a disjoint selection [0.71ms]
(pass) computeEligibleRhythms - token-selection filter > returns an empty array for an unsupported meter rather than throwing [0.13ms]
(pass) computeEligibleRhythms - token-selection filter > the eligible set contains no duplicate patterns [0.09ms]
(pass) computeEligibleRhythms - token-selection filter > does not mutate its arguments [0.20ms]

 8 pass
 0 fail
 9 expect() calls
Ran 8 tests across 1 file. [30.00ms]
```

## 4. Build-time packaging of the real catalog

The curated catalog at Notes/all-rhythms.txt is the hand-maintained source of truth. A build-time script (scripts/package-rhythm-catalog.ts) reads that file and emits a generated, gitignored src/lib/rhythm-catalog-data.ts exporting the catalog text as the RHYTHM_CATALOG_TEXT string constant. The prebuild npm hook regenerates this module before every wrangler build, so the runtime parser imports the string with no runtime file-system read. The generated module is gitignored like schema.sql because it is a build artifact.

```bash
bun scripts/package-rhythm-catalog.ts && head -16 src/lib/rhythm-catalog-data.ts
```

```output
Packaged rhythm catalog: /home/chris/etude-gen/Notes/all-rhythms.txt -> /home/chris/etude-gen/src/lib/rhythm-catalog-data.ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * GENERATED by scripts/package-rhythm-catalog.ts — do not edit by hand.
 *
 * The packaged rhythm catalog text, copied from Notes/all-rhythms.txt at
 * build time. The runtime parser in src/lib/rhythm-catalog.ts imports this
 * string so the catalog is bundled into the worker with no runtime
 * file-system read. Notes/all-rhythms.txt remains the hand-curated source
 * of truth; rerun `npm run package-rhythm-catalog` (or `npm run build`,
 * which runs it via prebuild) to regenerate after editing the catalog.
 */
export const RHYTHM_CATALOG_TEXT: string = "2/4\nEEEE\nEEQ\nEQE\nER\nQEE\nQQ\nRE\nH\n\n3/4\nEEEEEE\nEEEEQ\nEEEQE\nEEER\nEEQEE\nEEQQ\nEERE\nEEH\nEQEEE\nEQEQ\nEQQE\nEQR\nEREE\nERQ\nEHE\nQEEEE\nQEEQ\nQEQE\nQER\nQQEE\nQQQ\nQRE\nQH\nREEE\nREQ\nRQE\nRR\nHEE\nHQ\nD\n\n4/4\nEEEEEEEE\nEEEEEEQ\nEEEEEQE\nEEEEER\nEEEEQEE\nEEEEQQ\nEEEERE\nEEEEH\nEEEQEEE\nEEEQEQ\nEEEQQE\nEEEQR\nEEEREE\nEEERQ\nEEEHE\nEEQEEEE\nEEQEEQ\nEEQEQE\nEEQER\nEEQQEE\nEEQQQ\nEEQRE\nEEQH\nEEREEE\nEEREQ\nEERQE\nEERR\nEEHEE\nEEHQ\nEED\nEQEEEEE\nEQEEEQ\nEQEEQE\nEQEER\nEQEQEE\nEQEQQ\nEQERE\nEQEH\nEQQEEE\nEQQEQ\nEQQQE\nEQQR\nEQREE\nEQRQ\nEQHE\nEREEEE\nEREEQ\nEREQE\nERER\nERQEE\nERQQ\nERRE\nERH\nEHEEE\nEHEQ\nEHQE\nEHR\nEDE\nQEEEEEE\nQEEEEQ\nQEEEQE\nQEEER\nQEEQEE\nQEEQQ\nQEERE\nQEEH\nQEQEEE\nQEQEQ\nQEQQE\nQEQR\nQEREE\nQERQ\nQEHE\nQQEEEE\nQQEEQ\nQQEQE\nQQER\nQQQEE\nQQQQ\nQQRE\nQQH\nQREEE\nQREQ\nQRQE\nQRR\nQHEE\nQHQ\nQD\nREEEEE\nREEEQ\nREEQE\nREER\nREQEE\nREQQ\nRERE\nREH\nRQEEE\nRQEQ\nRQQE\nRQR\nRREE\nRRQ\nRHE\nHEEEE\nHEEQ\nHEQE\nHER\nHQEE\nHQQ\nHRE\nHH\nDEE\nDQ\nW\n"
```

```bash
npm run build 2>&1 | tail -6
```

```output
env.signUpType ("")                               Environment Variable      
env.LILYPOND_SERVICE_URL ("")                     Environment Variable      
env.LILYPOND_API_KEY ("")                         Environment Variable      
env.LILYPOND_TIMEOUT_MS ("")                      Environment Variable      

--dry-run: exiting now.
```

## 5. Health-route catalog wiring

The health route (src/routes/build-health.tsx) builds a CatalogHealthContribution from the packaged catalog via buildCatalogHealthContribution, which runs RHYTHM_CATALOG_TEXT through parseRhythmCatalog and maps any CatalogDefects to ConfigDefect entries with valueName 'rhythm-catalog' and a message naming the offending meter and line. The health route handler passes the contribution to runHealthCheck, so a malformed catalog makes the aggregate health result unhealthy with defects naming the meter and line, while the anonymous liveness payload still carries only the healthy flag and leaks no defect detail. A healthy catalog yields a healthy contribution with no defects.

```bash
bun test tests/health-route-catalog.spec.ts tests/health-route.spec.ts 2>&1 | tail -12
```

```output
(pass) buildAnonymousLiveness - no sensitive information > should contain only a healthy flag when healthy [0.07ms]
(pass) buildAnonymousLiveness - no sensitive information > should contain only a healthy flag when unhealthy [0.03ms]
(pass) buildAnonymousLiveness - no sensitive information > should not expose binding names, value names, defect detail, or resolved values [0.08ms]
(pass) buildDetailedReport - privileged operator view > should name every missing value when configuration is incomplete [0.08ms]
(pass) buildDetailedReport - privileged operator view > should include the resolved timeout value when healthy [0.04ms]
(pass) buildDetailedReport - privileged operator view > should never contain secret values in defect text [0.05ms]
(pass) buildDetailedReport - privileged operator view > should never contain secret values in defect text when the key is missing [0.03ms]

 22 pass
 0 fail
 56 expect() calls
Ran 22 tests across 2 files. [47.00ms]
```

## 6. Full unit test suite

All unit tests pass, confirming the new rhythm-catalog modules and the health-route wiring integrate cleanly with the existing suite.

```bash
bun test tests/* 2>&1 | tail -6
```

```output
(pass) createTestDb > enforces the user email uniqueness constraint [1.53ms]

 424 pass
 0 fail
 1752 expect() calls
Ran 424 tests across 35 files. [6.05s]
```
