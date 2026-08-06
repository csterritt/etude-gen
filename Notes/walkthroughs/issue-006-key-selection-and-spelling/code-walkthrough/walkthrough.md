# Issue 6: Key selection with key-signature pitch spelling

*2026-08-05T20:16:11Z by Showboat 0.6.1*
<!-- showboat-id: 97859d75-2ba7-4d73-9198-8c2b6497f681 -->

This walkthrough covers the Issue 6 implementation: key selection with key-signature pitch spelling. It walks through (1) the key domain catalog and pitch derivation, (2) the extended setup validator with the key field, (3) the repository key persistence and key-change invalidation with identical-resubmit detection, (4) the GET setup form key control and derived-pitch display, and (5) the POST handler key validation and hostile-shape tolerance. Each section includes executable test runs as proof.

## 1. Key domain catalog and pitch derivation

The key domain module (src/lib/key-domain.ts) is the authoritative source for the eighteen supported keys and their diatonic pitch spellings. It exports SUPPORTED_KEYS (a readonly array of eighteen strings), validateKey (which rejects unsupported and over-four-accidental keys with a typed failure and never coerces to a default), and deriveKeyPitches (which returns the seven diatonic pitch names using the key signature's conventional spelling from a static lookup table). Natural-minor keys use the natural minor scale.

Run the key-domain unit tests to verify the catalog and pitch derivation:

```bash
cd /home/chris/etude-gen && bun test tests/key-domain.spec.ts 2>&1 | tail -5
```

```output

 21 pass
 0 fail
 166 expect() calls
Ran 21 tests across 1 file. [55.00ms]
```

## 2. Extended setup validator with the key field

The setup validator (src/lib/setup-validator.ts) now validates four fields: measures, meter, hands, and key. The key field is delegated to validateKey from src/lib/key-domain.ts. The ValidSetup interface includes keySignature: string, and the SetupValidationFailure.field union includes 'key'. Multiple invalid fields are reported together.

Run the setup-validator unit tests to verify the key field validation:

```bash
cd /home/chris/etude-gen && bun test tests/setup-validator.spec.ts 2>&1 | tail -5
```

```output

 33 pass
 0 fail
 105 expect() calls
Ran 33 tests across 1 file. [24.00ms]
```

## 3. Repository key persistence and key-change invalidation

The repository (src/lib/etude-params-repository.ts) updateEtudeSetup function now persists keySignature, compares submitted values against stored values (no-op when all identical — no version increment, no write, no flag changes), and clears notesConfirmed and splitConfirmed only when the key actually changed (Issue 11 dependency map row for Key). The epoch-mismatch rejection still works and performs no invalidation.

Run the repository unit tests to verify key persistence and invalidation:

```bash
cd /home/chris/etude-gen && bun test tests/etude-params-repository.spec.ts 2>&1 | tail -5
```

```output

 22 pass
 0 fail
 68 expect() calls
Ran 22 tests across 1 file. [2.64s]
```

## 4. GET setup form key control and derived-pitch display

The setup form (src/routes/build-etude.tsx renderEtudeSetupForm) now renders a key <select> (data-testid='key-field') offering exactly the eighteen supported keys with the stored key pre-selected, plus a derived-pitch display (data-testid='key-pitches') showing the seven diatonic pitch names via deriveKeyPitches. The form is purely server-rendered — the student submits the form to see updated pitches (no client-side JavaScript).

Run the GET setup form e2e tests (the server must be running on localhost:3000):

```bash
cd /home/chris/etude-gen && npx playwright test e2e-tests/etude/06-etude-setup-key-form.spec.ts --reporter=line 2>&1 | tail -5
```

```output
Database sessions cleared successfully

Database cleared successfully

  3 passed (5.3s)
```

## 5. POST handler key validation and hostile-shape tolerance

The POST handler (src/routes/build-etude.tsx) adds 'key' to SETUP_FIELD_SPEC (no repeated-field normalization, so a repeated key field is a reject), passes raw.key as keySignature to validateSetup, and on validation success passes the validated keySignature through to updateEtudeSetup (which handles persistence, key-change invalidation, and identical-resubmit no-increment). Unsupported and hostile-shape key submissions are rejected with a field-addressable error and a 303 redirect, never a 500.

Run the POST key submission e2e tests:

```bash
cd /home/chris/etude-gen && npx playwright test e2e-tests/etude/07-etude-setup-key-submit.spec.ts --reporter=line 2>&1 | tail -5
```

```output
Database sessions cleared successfully

Database cleared successfully

  7 passed (8.0s)
```

## Full test suite

Run the full unit and etude e2e test suites to confirm no regressions:

```bash
cd /home/chris/etude-gen && bun test tests/* 2>&1 | tail -5
```

```output

 221 pass
 0 fail
 644 expect() calls
Ran 221 tests across 23 files. [6.43s]
```

```bash
cd /home/chris/etude-gen && npx playwright test e2e-tests/etude/ --reporter=line 2>&1 | tail -5
```

```output
Database sessions cleared successfully

Database cleared successfully

  28 passed (27.3s)
```
