# Issue 11: Upstream changes clear dependent downstream choices

*2026-08-07T17:22:12Z by Showboat 0.6.1*
<!-- showboat-id: 0ff307df-e132-49ee-8568-e093e1f023b1 -->

This walkthrough covers the Issue 11 implementation: dependent-downstream invalidation when upstream setup parameters change. It walks through (1) the new selectedPitches/selectedDurations/splitBoundary columns and the drizzle migration, (2) the computeDownstreamInvalidation pure function and InvalidationPlan type (each dependency-map row, the two-hand revalidation, the union of dependents), (3) the isReviewReachable derived predicate and the absence of a stored review flag, (4) the updateEtudeSetupActual change applying the plan inside the single CAS write (the identical-resubmit short-circuit and the stale-version-first rejection), and (5) the test-only seed/inspection routes and the Playwright end-to-end scenario. Each section includes executable test runs as proof.

## 1. New downstream data columns and drizzle migration

The etude_params table (src/db/schema.ts) has three new nullable text columns: selectedPitches, selectedDurations, and splitBoundary. They hold the downstream pitch-selection, duration-selection, and split-boundary data written by the notes and split steps (Issues 13, 14, 16). They are nullable with no default because those steps arrive in later slices — at this stage they are always null until a step (or a test) writes them. The EtudeParams domain interface and mapToDomain in src/lib/etude-params-repository.ts include the new fields as string | null. A new drizzle migration (drizzle/0003_worthless_hedge_knight.sql) adds the columns via ALTER TABLE, and schema.sql is regenerated.

```bash
cat drizzle/0003_worthless_hedge_knight.sql
```

```output
ALTER TABLE `etude_params` ADD `selectedPitches` text;--> statement-breakpoint
ALTER TABLE `etude_params` ADD `selectedDurations` text;--> statement-breakpoint
ALTER TABLE `etude_params` ADD `splitBoundary` text;```
```

## 2. computeDownstreamInvalidation pure function and InvalidationPlan type

The computeDownstreamInvalidation function (src/lib/etude-invalidation.ts) is a pure arrow function encoding the Issue 11 dependency map. It compares each upstream setup field (key, octaves, meter, measure count, hands) of the submitted ValidSetup against the stored EtudeParams and returns an InvalidationPlan naming the downstream state to clear: clearPitches (key or octaves changed), clearDurations (meter changed), clearSplit (key, octaves, or hands changed), unconfirmNotes (clearPitches || clearDurations || handsRevalidationFailed), unconfirmSplit (clearSplit). The two-hand revalidation: when handChanged and submitted.hand === 'both', the function counts the stored selectedPitches; if fewer than two, handsRevalidationFailed is true (the notes step is unconfirmed but the pitch selection is retained, not cleared). Multiple changes in one submission clear the union of their dependents. The function is pure: no DB, no side effects, no mutation, no throws.

```bash
bun test tests/etude-invalidation.spec.ts 2>&1 | tail -10
```

```output
(pass) isReviewReachable > is false when notes are not confirmed [0.02ms]
(pass) isReviewReachable > is false when split is not confirmed for both hands [0.02ms]
(pass) isReviewReachable > is false when setup is not confirmed [0.01ms]
(pass) isReviewReachable > is false after an invalidation that clears notesConfirmed (recomputed from flags, not a stored review flag) [0.04ms]
(pass) isReviewReachable > does not consult a stored review flag (EtudeParams has no reviewConfirmed field) [0.03ms]

 21 pass
 0 fail
 50 expect() calls
Ran 21 tests across 1 file. [23.00ms]
```

## 3. isReviewReachable derived predicate

The isReviewReachable function (src/lib/etude-invalidation.ts) is a pure predicate deriving review reachability from the confirmation flags and hand selection — true exactly when setupConfirmed && notesConfirmed && (hand !== 'both' || splitConfirmed). It does not consult any stored review flag (none exists; cross-cutting contract section 5). After an invalidation that unconfirms the notes or split step, isReviewReachable returns false. The actual canonical-route redirect to the earliest incomplete step is wired by Issue 18 once the notes, split, and review routes exist; until then, the derived predicate and the flag states are verified directly.

## 4. updateEtudeSetupActual applies the invalidation plan inside the single CAS write

The updateEtudeSetupActual function (src/lib/etude-params-repository.ts) now calls computeDownstreamInvalidation(stored, values) and applies the resulting InvalidationPlan inside the existing conditional .set(...) — the same compare-and-set write that increments the workflow version. The plan's clearPitches/clearDurations/clearSplit booleans spread selectedPitches: null / selectedDurations: null / splitBoundary: null into the set, and unconfirmNotes/unconfirmSplit spread notesConfirmed: false / splitConfirmed: false. The old inline keyChanged || octavesChanged logic is removed. The identical-resubmit short-circuit (which compares the five setup fields and returns Ok with no write when all match and the version matches) is unchanged, so identical resubmits retain all downstream state. The CAS where clause is unchanged, so a stale version rejects before any invalidation. The invalidating write is the same committed transition as the version increment (cross-cutting contract section 4) — there is no second update.

```bash
bun test tests/etude-params-repository.spec.ts 2>&1 | tail -10
```

```output
(pass) updateEtudeSetup full dependent-downstream invalidation (Issue 11) > clears splitBoundary but keeps notes confirmed when switching to one hand [2.28ms]
(pass) updateEtudeSetup full dependent-downstream invalidation (Issue 11) > clears the union of dependents when key and meter both change in one submission [2.99ms]
(pass) updateEtudeSetup full dependent-downstream invalidation (Issue 11) > retains all downstream state on an identical resubmit [3.06ms]
(pass) updateEtudeSetup full dependent-downstream invalidation (Issue 11) > rejects a stale version alongside upstream changes before any invalidation takes place [3.84ms]
(pass) updateEtudeSetup full dependent-downstream invalidation (Issue 11) > returns a db-error and persists nothing when the invalidating write throws [2.78ms]

 44 pass
 0 fail
 179 expect() calls
Ran 44 tests across 1 file. [248.00ms]
```

## 5. Test-only seed/inspection routes and Playwright end-to-end scenario

Two test-only routes (src/routes/test/etude-downstream-state.ts) support the e2e test: POST /test/etude/seed-downstream-state sets the downstream data fields and confirmation flags on the owner's aggregate (simulating the notes and split steps), and GET /test/etude/aggregate-state returns the aggregate as JSON including the derived isReviewReachable flag. Both are gated by isTestRouteEnabled and wrapped in PRODUCTION:REMOVE markers. The Playwright test (e2e-tests/etude/14-etude-downstream-invalidation.spec.ts) signs in, submits a valid setup, seeds downstream state, changes the key via the real setup form, and inspects the aggregate to confirm pitches and split are cleared, durations are retained, and review is unreachable. A second case resubmits identical values and confirms all downstream state is retained.

```bash
npx playwright test --reporter=line e2e-tests/etude/14-etude-downstream-invalidation.spec.ts 2>&1 | tail -10
```

```output
e2e-tests/etude/14-etude-downstream-invalidation.spec.ts:130:3 › Issue 11: upstream changes clear dependent downstream choices › an identical setup resubmit retains all downstream state
Database cleared successfully

Database seeded successfully: 2 users, 2 accounts, 5 codes

Database sessions cleared successfully

Database cleared successfully

  2 passed (4.2s)
```
