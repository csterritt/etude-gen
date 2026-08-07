# Issue 10: Workflow version compare-and-set rejects stale submissions

*2026-08-07T11:54:12Z by Showboat 0.6.1*
<!-- showboat-id: 7d3fa81a-540d-4258-ad96-5603164bf680 -->

This walkthrough covers the Issue 10 implementation: optimistic concurrency control for workflow submissions using a workflowVersion compare-and-set token and an aggregateEpoch precondition check. It walks through (1) the EtudeUpdateError typed conflict and the expectedWorkflowVersion CAS in updateEtudeSetup, (2) the parseWorkflowVersionField pure parser, (3) the checkOperationPrecondition pure precondition checker and the OperationPreconditionFailure type, (4) the setup-route stale-version redisplay path, (5) the test-only operation-POST route, and (6) the two-tab Playwright scenarios. Each section includes executable test runs as proof.

## 1. EtudeUpdateError typed conflict and expectedWorkflowVersion CAS in updateEtudeSetup

The updateEtudeSetup function (src/lib/etude-params-repository.ts) now takes an expectedWorkflowVersion parameter and checks it in the conditional where clause alongside aggregateEpoch. The where clause matches userId, aggregateEpoch === expectedEpoch, and workflowVersion === expectedWorkflowVersion, so a stale submission (one carrying an older, newer, or tampered version) updates zero rows. On a zero-row update the function re-loads the current row to disambiguate the conflict kind: if the stored aggregateEpoch no longer equals expectedEpoch, it returns { kind: 'epoch-mismatch' }; otherwise it returns { kind: 'version-mismatch' }. A missing aggregate is a safe version-mismatch, never a 500. The identical-resubmit no-op path now verifies the version matches before returning Ok — a stale version on an identical resubmit is a version-mismatch, not a silent success. The function no longer uses withRetry because CAS conflicts are deterministic and retrying them would lose the typed conflict information. Transient DB errors are wrapped as { kind: 'db-error', error }.

```bash
bun test tests/etude-params-repository.spec.ts 2>&1 | tail -10
```

```output
(pass) updateEtudeSetup workflowVersion compare-and-set > succeeds and increments the version when the expected version matches the stored version [1.27ms]
(pass) updateEtudeSetup workflowVersion compare-and-set > rejects with a typed version-mismatch when the expected version is older than the stored version and persists nothing [1.84ms]
(pass) updateEtudeSetup workflowVersion compare-and-set > rejects with a typed version-mismatch when the expected version is newer than the stored version and persists nothing [1.66ms]
(pass) updateEtudeSetup workflowVersion compare-and-set > rejects at most one of two concurrent updates with the same expected version [1.96ms]
(pass) updateEtudeSetup workflowVersion compare-and-set > rejects an identical resubmit with a stale version as a version-mismatch [1.46ms]

 33 pass
 0 fail
 115 expect() calls
Ran 33 tests across 1 file. [89.00ms]
```

## 2. parseWorkflowVersionField pure parser

The parseWorkflowVersionField function (src/lib/workflow-version-field.ts) is a pure arrow function that extracts a non-negative integer from the raw string submitted by a parameter form or operation POST. It trims surrounding whitespace before validating against /^\d+$/. A missing, empty, non-numeric, negative, or non-integer value is a field-addressable ParseFailure — never a thrown error. The field parameter is not hardcoded so the parser can be reused by forms with different field names (setup, notes, split, and operation POSTs).

```bash
bun test tests/workflow-version-field.spec.ts 2>&1 | tail -5
```

```output

 12 pass
 0 fail
 12 expect() calls
Ran 12 tests across 1 file. [17.00ms]
```

## 3. checkOperationPrecondition pure precondition checker

The checkOperationPrecondition function (src/lib/operation-precondition.ts) is a pure arrow function that verifies the workflowVersion precondition and the aggregateEpoch check for operation POSTs (generate, render retry, pdf, start-over). It parses the submitted version string via parseWorkflowVersionField; a missing, non-numeric, tampered, or negative value is treated the same as a stale version — a version-mismatch (cross-cutting contract section 3 rule 1). Then compares the parsed version to current.workflowVersion; on inequality returns version-mismatch. Then compares capturedEpoch to current.aggregateEpoch; on inequality returns epoch-mismatch. Otherwise returns Ok with the parsed workflow version. The workflow version alone is not sufficient because Start Over resets parameters to defaults and a naive version comparison could coincide; the epoch check guards against this. The function is pure: no DB, no side effects, no mutation, no throws.

```bash
bun test tests/operation-precondition.spec.ts 2>&1 | tail -5
```

```output

 11 pass
 0 fail
 16 expect() calls
Ran 11 tests across 1 file. [12.00ms]
```

## 4. Setup-route stale-version redisplay path

The setup POST handler in src/routes/build-etude.tsx now parses the hidden workflowVersion field from the submitted form via parseWorkflowVersionField before the parameter-form parser. A missing, non-numeric, or tampered version is a safe stale-form rejection — redirectWithError to /etude/setup with an explanatory message. On parse success, the parsed version is passed to updateEtudeSetup as expectedWorkflowVersion alongside the existing expectedEpoch from the loaded aggregate. When updateResult.isErr, the handler inspects the typed conflict kind: for version-mismatch and epoch-mismatch it redirects with redirectWithError (NOT redirectWithValidationState) so the GET redisplays the committed aggregate — the newly current saved state — rather than the rejected submitted values; for db-error it logs via logError/sanitizeError and returns handleUnexpectedError. The GET handler already renders the committed aggregate values when no validation-state record is consumed, so the stale-version redirect automatically shows the newly current saved state.

## 5. Test-only operation-POST precondition route

The test-only route POST /test/etude/operation-precondition (src/routes/test/etude-operation-precondition.ts) exercises the checkOperationPrecondition gate. It requires the signedInAccess middleware so it mirrors a real operation POST's universal route requirements. It loads the owner's aggregate, reads workflowVersion and aggregateEpoch from the submitted form, and calls checkOperationPrecondition. On any failure it redirects 303 to the canonical route with redirectWithError — no lock, no external call, no state change. On success it redirects 303 to the canonical route with a confirmation message (no real work performed). The route is gated by isTestRouteEnabled and wrapped in PRODUCTION:REMOVE markers; never available in production. It is mounted in src/index.ts inside the existing if (isTestRouteEnabledFlag) block.

## 6. Two-tab Playwright scenarios

Two Playwright e2e tests verify the optimistic-concurrency behavior end-to-end:

- e2e-tests/etude/12-etude-setup-stale-version.spec.ts: Two tabs load /etude/setup (both see version 1); tab A submits a change (measures 16, meter 3/4, hands both) and succeeds (version becomes 2); tab B submits a different change (measures 12) carrying the stale version 1 and is rejected with a 303 to /etude/setup; on reload tab B sees the newly current saved state (tab A's values) with an explanatory error, NOT tab B's submitted values.

- e2e-tests/etude/13-etude-operation-precondition-stale.spec.ts: Two tabs load /etude/setup; tab A submits a setup change (version becomes 2); tab B POSTs to the test-only operation route with stale version 1 and captured epoch 1; the route refuses with a 303 to the canonical route, no state change; the aggregate is unchanged (still tab A's values, version still 2).

```bash
npx playwright test --reporter=line e2e-tests/etude/12-etude-setup-stale-version.spec.ts e2e-tests/etude/13-etude-operation-precondition-stale.spec.ts 2>&1 | tail -10
```

```output
e2e-tests/etude/13-etude-operation-precondition-stale.spec.ts:30:3 › POST /test/etude/operation-precondition stale-version refusal (two-tab scenario) › a stale operation POST from a second tab is refused with a 303 to the canonical route and no state change
Database cleared successfully

Database seeded successfully: 2 users, 2 accounts, 5 codes

Database sessions cleared successfully

Database cleared successfully

  2 passed (3.0s)
```
