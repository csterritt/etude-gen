# Issue 7: Octave scale-range selection, contiguous expansion, and the C7 rule

*2026-08-06T15:36:45Z by Showboat 0.6.1*
<!-- showboat-id: 4799f0cf-9c62-4594-a3c2-ee4675319869 -->

This walkthrough covers the Issue 7 implementation: octave scale-range selection, contiguous expansion, and the C7 rule. It walks through (1) the music domain module with octave validation, range expansion, scale-range pitch derivation, and the C7 cap, (2) the extended form parser with the string-multi field type, (3) the extended setup validator with the octaves field, (4) the repository octave persistence and octave-change invalidation, (5) the GET setup form octave checkboxes and derived-range display, and (6) the POST handler octave validation and hostile-shape tolerance. Each section includes executable test runs as proof.

## 1. Music domain: octave validation, range expansion, and the C7 cap

The music domain module (src/lib/music-domain.ts) is the authoritative source for octave validation, contiguous range expansion, and the available-pitch derivation with the C7 cap. It exports OCTAVE_MIN (2) and OCTAVE_MAX (6), validateOctaves (which rejects non-arrays, empty arrays, non-numeric elements, and out-of-range elements, normalizing valid input to a sorted unique number[]), expandOctaveRange (which derives the contiguous min/max from the lowest and highest selected octaves), deriveScaleRangePitches (which returns the eight tonic-to-tonic pitches for a single octave, with the octave number incrementing at the B-to-C crossing), and deriveAvailablePitches (which builds the full available pitch set and applies the C7 cap: every octave-7 pitch is removed except C7, and C7 is kept only when C natural belongs to the key).

Run the music-domain unit tests to verify octave validation, range expansion, and the C7 cap:

```bash
cd /home/chris/etude-gen && bun test tests/music-domain.spec.ts 2>&1 | tail -5
```

```output

 28 pass
 0 fail
 339 expect() calls
Ran 28 tests across 1 file. [80.00ms]
```

## 2. Extended form parser with the string-multi field type

The form parser (src/lib/etude-form-parser.ts) now supports a string-multi field type for multi-value fields. A string-multi field collects all submitted values into a string[] in submission order, preserving duplicates and arbitrary order (normalization is the validator's responsibility). An absent field with zero values is a field-addressable failure. The RawValues type now allows string | string[]. The setup form declares the octave field as string-multi.

Run the form-parser unit tests to verify the string-multi field type:

```bash
cd /home/chris/etude-gen && bun test tests/etude-form-parser.spec.ts 2>&1 | tail -5
```

```output

 16 pass
 0 fail
 39 expect() calls
Ran 16 tests across 1 file. [30.00ms]
```

## 3. Extended setup validator with the octaves field

The setup validator (src/lib/setup-validator.ts) now validates five fields: measures, meter, hands, key, and octaves. The octaves field is delegated to validateOctaves from src/lib/music-domain.ts, which normalizes arbitrary order and duplicates to one ascending number[] and rejects empty/null/undefined/out-of-range/non-numeric with a typed OctaveValidationFailure. The ValidSetup interface includes octaves: number[], and the SetupValidationFailure.field union includes 'octaves'. Multiple invalid fields are reported together.

Run the setup-validator unit tests to verify the octaves field validation:

```bash
cd /home/chris/etude-gen && bun test tests/setup-validator.spec.ts 2>&1 | tail -5
```

```output

 44 pass
 0 fail
 128 expect() calls
Ran 44 tests across 1 file. [57.00ms]
```

## 4. Repository octave persistence and octave-change invalidation

The repository (src/lib/etude-params-repository.ts) now persists the selectedOctaves column (a comma-separated string like '2,4,6') and clears the notesConfirmed and splitConfirmed flags when either the key or the octaves change (Issue 11 dependency map rows for Key and Octave Range). The identical-resubmit check now includes the normalized octave string, so resubmitting the same octaves with the same other fields is a no-op (no version increment, no flag changes).

Run the repository unit tests to verify octave persistence and invalidation:

```bash
cd /home/chris/etude-gen && bun test tests/etude-params-repository.spec.ts 2>&1 | tail -5
```

```output

 28 pass
 0 fail
 92 expect() calls
Ran 28 tests across 1 file. [3.85s]
```

## 5. GET setup form octave checkboxes and derived-range display

The setup form (src/routes/build-etude.tsx) now renders five checkboxes (data-testid='octaves-field') for octaves 2 through 6, with the stored octaves pre-checked. The available range (lowest to highest pitch) is derived via deriveAvailablePitches and displayed in a data-testid='available-range' element. The form parses the octave field as string-multi via the SETUP_FIELD_SPEC.

Run the e2e tests for the octave form to verify the checkboxes and derived-range display:

```bash
cd /home/chris/etude-gen && npx playwright test e2e-tests/etude/08-etude-setup-octave-form.spec.ts --reporter=line 2>&1 | tail -5
```

```output
Database sessions cleared successfully

Database cleared successfully

  4 passed (9.3s)
```

## 6. POST handler octave validation and hostile-shape tolerance

The POST handler (src/routes/build-etude.tsx) parses the octave field as string-multi, passes raw.octaves to validateSetup, and persists the validated octaves via updateEtudeSetup. Hostile shapes (out-of-range octaves, empty submissions, arbitrary order, duplicates) are each rejected or normalized deterministically with a 303 redirect and no 500. An octave-range change increments the workflow version and clears dependent downstream flags; an identical resubmit does not increment the version.

Run the e2e tests for the octave submission to verify validation, normalization, and persistence:

```bash
cd /home/chris/etude-gen && npx playwright test e2e-tests/etude/09-etude-setup-octave-submit.spec.ts --reporter=line 2>&1 | tail -5
```

```output
Database sessions cleared successfully

Database cleared successfully

  6 passed (10.5s)
```

## 7. No regressions in existing key tests

The existing key form and key submission e2e tests (Issues 5 and 6) were updated to include the new required octaves field. They continue to pass, confirming no regressions.

Run the key form and key submission e2e tests:

```bash
cd /home/chris/etude-gen && npx playwright test e2e-tests/etude/06-etude-setup-key-form.spec.ts e2e-tests/etude/07-etude-setup-key-submit.spec.ts --reporter=line 2>&1 | tail -5
```

```output
Database sessions cleared successfully

Database cleared successfully

  10 passed (20.4s)
```
