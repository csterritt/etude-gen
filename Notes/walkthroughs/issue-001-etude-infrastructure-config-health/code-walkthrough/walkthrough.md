# Issue 001: Etude Infrastructure Config and Health

*2026-08-04T15:43:57Z by Showboat 0.6.1*
<!-- showboat-id: 2ccc9342-05d3-4ffb-8437-5dec27710552 -->

This walkthrough demonstrates the implementation of issue #1: etude infrastructure configuration and health validation. It covers the new R2 binding, LilyPond secrets, the configuration validator, the split health route, and the no-hardcoded-LilyPond-version guardrail.

## Task 1: Configuration bindings in wrangler.jsonc

```bash
grep -A5 'r2_buckets' wrangler.jsonc
```

```output
	"r2_buckets": [
		{
			"bucket_name": "etude-gen-storage",
			"binding": "ETUDE_GEN_STORAGE"
		}
	],
```

## Task 1: Bindings type in local-types.ts

```bash
grep -A3 'ETUDE_GEN_STORAGE\|LILYPOND_SERVICE_URL\|LILYPOND_API_KEY\|LILYPOND_TIMEOUT_MS\|OPERATOR_TOKEN' src/local-types.ts
```

```output
  ETUDE_GEN_STORAGE: R2Bucket
  Session: Maybe<SignInSession>
  db?: string
  signUpType?: string
--
  LILYPOND_SERVICE_URL?: string
  /** Bearer token used to authenticate LilyPond service requests. */
  LILYPOND_API_KEY?: string
  /** LilyPond request timeout in milliseconds; defaults to 30,000 when absent. */
  LILYPOND_TIMEOUT_MS?: string
  /** Operator token gating the privileged detailed health report. */
  OPERATOR_TOKEN?: string
}

/**
```

## Tasks 2-3: Config validator tests and implementation

Running the config validator tests:

```bash
bun test tests/config-validator.spec.ts 2>&1 | tail -5
```

```output

 16 pass
 0 fail
 37 expect() calls
Ran 16 tests across 1 file. [8.00ms]
```

## Tasks 4-5: Health route tests and implementation

Running the health route tests:

```bash
bun test tests/health-route.spec.ts 2>&1 | tail -5
```

```output

 13 pass
 0 fail
 33 expect() calls
Ran 13 tests across 1 file. [8.00ms]
```

## Tasks 6-7: No hard-coded LilyPond version guardrail

Running the guardrail test:

```bash
bun test tests/no-hardcoded-lilypond-version.spec.ts 2>&1 | tail -5
```

```output

 1 pass
 0 fail
 1 expect() calls
Ran 1 test across 1 file. [15.00ms]
```

## All unit tests pass

Running all unit test files in tests/:

```bash
bun test tests/*.spec.ts 2>&1 | tail -5
```

```output

 86 pass
 0 fail
 164 expect() calls
Ran 86 tests across 11 files. [3.52s]
```

## Wrangler build succeeds

```bash
npx wrangler build 2>&1 | tail -12
```

```output
Binding                                           Resource                  
env.PROJECT_DB (etude-gen-db)                     D1 Database               
env.ETUDE_GEN_STORAGE (etude-gen-storage)         R2 Bucket                 
env.ASSETS                                        Assets                    
env.Session ("")                                  Environment Variable      
env.db ("")                                       Environment Variable      
env.signUpType ("")                               Environment Variable      
env.LILYPOND_SERVICE_URL ("")                     Environment Variable      
env.LILYPOND_API_KEY ("")                         Environment Variable      
env.LILYPOND_TIMEOUT_MS ("")                      Environment Variable      

--dry-run: exiting now.
```
