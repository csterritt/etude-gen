# Etude cross-cutting route and form contract

This document is not an implementable issue. It is the normative reference that the
numbered etude issues cite so that requirements the PRD applies to _every_ route are
not silently dropped by an individual slice.

The behaviours described here are **built** by Issues 2, 5, 8, 9, 10, 18, 33 and 38.
They are **inherited** by every later route issue. An issue is not complete until the
rows of the applicability matrix marked for it are satisfied and tested.

## 1. Universal route requirements

Every etude route, GET or POST, must:

1. Require the existing authenticated session middleware and send no-cache headers.
2. Carry an `X-Correlation-ID` response header and use that identifier in every log
   line and in any unexpected-error page (Issue 2).
3. Be owner-scoped: no request body, query value, cookie, or path segment is accepted
   as an assertion of ownership, completion, cooldown state, or Piece content.
4. Answer a handled POST with a 303 redirect to a canonical GET, produced by
   `redirectWithMessage` / `redirectWithError`, never `c.redirect`.
5. Rely on the application's existing CSRF and request-size protections; an etude POST
   adds no exemption.
6. Reveal no internal identifiers, SQL, service responses, stack traces, R2 keys, or
   another user's existence in any message.

## 2. Parameter-form contract (setup, notes, split)

A _parameter form_ is any form that writes to the `etude_params` aggregate.
Each one must:

1. Emit the current `workflowVersion` as a hidden field and update conditionally
   (compare-and-set). A missing, non-numeric, tampered, or older version is rejected
   without persisting anything (Issue 10). A successful commit increments the version.
2. On rejection, redirect 303 to the same step and redisplay the student's safe
   submitted values with field-level errors through the one-time validation state
   (Issue 8). A stale-version rejection instead redisplays the _newly current saved
   state_ with an explanatory error, because the submitted values are no longer
   trustworthy.
3. Render the accessible error summary and field-error wiring from Issue 9, focused
   programmatically on redisplay.
4. Carry native HTML constraints on every control, with independent server enforcement
   behind them.
5. Tolerate hostile shapes without a 500: an absent field, an empty string, a repeated
   field (multi-value), an unexpected extra field, and values in an arbitrary order all
   resolve to a deterministic accept or field-addressable reject.
6. Clear dependent downstream state in the same committed transition as the change
   (Issue 11).

## 3. Operation-POST contract (generate, render retry, pdf, start-over)

These POSTs do not edit parameters, so they do not increment the workflow version.
They use it as a **precondition** instead, plus the operation-specific tokens below.
Each one must:

1. Emit the current `workflowVersion` as a hidden field. If it does not match the
   current aggregate version, the request is refused with no external work, no lock
   acquisition, and no state change, and is redirected 303 to the canonical route for
   the current state with an explanatory error. A missing or tampered version is
   treated the same as a stale one.
2. Verify the **aggregate epoch** (section 4) at acquisition and again at every
   conditional commit.
3. Verify lock ownership (section 4) immediately before every side effect and before
   every commit — not once at the start.
4. Re-verify, immediately before external work and again at final commit, that the
   Piece it is acting on is still the current Piece and is not stale
   (`piece.sourceParameterVersion === params.workflowVersion`).
5. Produce no invalid-value redisplay state, because these forms submit no student
   values. Their failures are messages on the canonical GET, not field errors.

## 4. Concurrency tokens

| Operation                               | Optimistic token                                | Lock                                                                 | Cooldown           | Other preconditions                                                  |
| --------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------- |
| `POST /etude/setup`, `/notes`, `/split` | `workflowVersion` CAS, increments               | none                                                                 | none               | aggregate epoch                                                      |
| `POST /etude/generate`                  | `workflowVersion` precondition, not incremented | generation/render lock owner token                                   | new-Piece cooldown | aggregate epoch, all steps confirmed                                 |
| `POST /etude/render/retry`              | `workflowVersion` precondition                  | generation/render lock owner token                                   | none (exempt)      | aggregate epoch, current non-stale Piece identity                    |
| `POST /etude/pdf`                       | `workflowVersion` precondition                  | **PDF lock** owner token (independent of the generation/render lock) | PDF cooldown       | aggregate epoch, current non-stale Piece with a committed SVG render |
| `GET /etude/pdf/download/:grantId`      | none                                            | none                                                                 | none               | owner-scoped unexpired unconsumed grant, aggregate epoch             |
| `POST /etude/start-over`                | `workflowVersion` precondition                  | none; it does not wait for in-flight work                            | none               | aggregate epoch; **increments the epoch**                            |
| Account deletion                        | n/a                                             | none                                                                 | none               | sets the epoch to a terminal value that never matches again          |

**Aggregate epoch.** The aggregate carries a monotonic epoch value alongside the
workflow version. It is bumped by Start Over and moved to a terminal value by account
deletion. Every conditional write performed by an operation POST — Piece persistence,
supersession, render-state commit, cooldown timestamp, grant creation, and lock release
— requires the epoch captured at lock acquisition to still be current. Consequently a
request that was calling LilyPond or writing R2 while the student cleared the workflow
cannot publish a Piece, a render state, a grant, a cooldown, or release a replacement
lock. Any artifact it already wrote is unreachable and is cleaned up with
`cleanupReason` `commit_failed` (Issue 29).

The workflow version alone is not a sufficient guard for this, because Start Over
resets parameters to defaults and a naive version comparison could coincide.

## 5. Canonical workflow state to route table

Completion is **per-step confirmation**: a step is confirmed by a successful POST to
it, not merely by having valid default values. Defaults pre-populate controls; they do
not pre-confirm steps. The notes step is one coherent prerequisite — pitches _and_
durations must both be confirmed for it to count as complete.

Review completion is **derived**, never persisted: review is reachable exactly when
every applicable prior step is confirmed and its stored values still validate. There is
no state change on `GET /etude/review`.

| Current state                                                                        | Canonical route                                | Notes                                                                                                               |
| ------------------------------------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| No aggregate                                                                         | `/etude/setup`                                 | The aggregate is created with defaults first                                                                        |
| Setup not confirmed                                                                  | `/etude/setup`                                 |                                                                                                                     |
| Setup confirmed; pitches or durations unconfirmed                                    | `/etude/notes`                                 | Either half missing means the notes step is the earliest incomplete step                                            |
| Notes confirmed; hands = both; split unconfirmed                                     | `/etude/split`                                 |                                                                                                                     |
| Notes confirmed; hands = left or right                                               | skip split                                     | Split is never the earliest incomplete step for one hand                                                            |
| All applicable steps confirmed; no current Piece                                     | `/etude/review`                                |                                                                                                                     |
| Current Piece, not stale, SVG render committed                                       | `/etude/score`                                 | Score plus PDF controls                                                                                             |
| Current Piece, not stale, render failed or artifact missing                          | `/etude/score`                                 | Retry-rendering state, no score, no PDF control                                                                     |
| Current Piece whose `sourceParameterVersion` is older than `workflowVersion` (stale) | earliest incomplete step, else `/etude/review` | Score and PDF controls hidden; `GET /etude/score` and direct `POST /etude/pdf` or `/etude/render/retry` are refused |
| Stored values no longer validate after an upstream change                            | earliest step whose values are now invalid     |                                                                                                                     |

`GET /etude` redirects to the row above that matches the saved state. Any direct GET
for a step that is not reachable in the current state redirects to that same canonical
route with a safe message.

## 6. Applicability matrix

`B` = this issue builds the behaviour. `I` = this issue inherits it and must test it.

| Issue              | Auth + no-cache | PRG 303 | Version token    | Safe redisplay (8) | A11y errors (9)        | Invalidation (11) | Lock owner   | Epoch        |
| ------------------ | --------------- | ------- | ---------------- | ------------------ | ---------------------- | ----------------- | ------------ | ------------ |
| 3 `/etude`         | B               | –       | –                | –                  | –                      | –                 | –            | –            |
| 4 aggregate        | I               | –       | B                | –                  | –                      | –                 | –            | B            |
| 5 setup            | I               | B       | I                | –                  | B (native constraints) | –                 | –            | I            |
| 6 key              | I               | I       | I                | I                  | I                      | I                 | –            | I            |
| 7 octaves          | I               | I       | I                | I                  | I                      | I                 | –            | I            |
| 8 redisplay        | I               | I       | I                | B                  | I                      | –                 | –            | –            |
| 9 a11y errors      | I               | I       | I                | I                  | B                      | –                 | –            | –            |
| 10 version CAS     | I               | I       | B                | I                  | I                      | –                 | –            | I            |
| 11 invalidation    | I               | I       | I                | I                  | I                      | B                 | –            | I            |
| 13 notes pitches   | I               | I       | I                | I                  | I                      | I                 | –            | I            |
| 14 notes durations | I               | I       | I                | I                  | I                      | I                 | –            | I            |
| 16 split           | I               | I       | I                | I                  | I                      | I                 | –            | I            |
| 17 summaries       | I               | –       | –                | –                  | –                      | –                 | –            | –            |
| 18 prerequisites   | I               | –       | –                | –                  | –                      | I                 | –            | I            |
| 19 review          | I               | –       | –                | –                  | –                      | I                 | –            | I            |
| 20 generate        | I               | I       | I (precondition) | –                  | –                      | I                 | I            | I            |
| 30 render          | I               | I       | I                | –                  | –                      | I                 | I            | I            |
| 31 retry           | I               | I       | I                | –                  | –                      | I                 | I            | I            |
| 32 staleness       | I               | I       | I                | –                  | –                      | I                 | I            | I            |
| 33 locks           | I               | I       | I                | –                  | –                      | –                 | B            | I            |
| 34 cooldown        | I               | I       | I                | –                  | –                      | –                 | I            | I            |
| 35 pdf             | I               | I       | I                | –                  | –                      | I                 | I (PDF lock) | I            |
| 36 grant           | I               | –       | –                | –                  | –                      | –                 | –            | I            |
| 37 pdf cooldown    | I               | I       | I                | –                  | –                      | –                 | I            | I            |
| 38 start over      | I               | I       | I                | –                  | –                      | –                 | I            | B            |
| 39 deletion        | I               | –       | –                | –                  | –                      | –                 | I            | B (terminal) |

## 7. Correlation and logging propagation

1. The request correlation identifier is passed into every Workflow Service operation,
   renderer call, repository call, and artifact-store call it triggers.
2. Cleanup or other work that outlives the response carries the originating correlation
   identifier; if no request context remains, it generates its own operation
   correlation identifier and logs it as such.
3. Lost-lock, stale-operation, stale-epoch, and stale-Piece refusals are logged with a
   typed category and are diagnosable without logging user identifiers, Piece content,
   LilyPond source, grant identifiers, or credentials.
4. Routine successful operations are not logged merely for completeness.

## 8. PRD user story to issue traceability

| Story | Issue | Story | Issue | Story | Issue  | Story | Issue |
| ----- | ----- | ----- | ----- | ----- | ------ | ----- | ----- |
| 1     | 3     | 18    | 14    | 35    | 25     | 52    | 10    |
| 2     | 3     | 19    | 15    | 36    | 26, 30 | 53    | 35    |
| 3     | 4     | 20    | 14    | 37    | 26, 30 | 54    | 37    |
| 4     | 4     | 21    | 16    | 38    | 26     | 55    | 37    |
| 5     | 5     | 22    | 16    | 39    | 21     | 56    | 35    |
| 6     | 5     | 23    | 17    | 40    | 21     | 57    | 36    |
| 7     | 6     | 24    | 17    | 41    | 28, 30 | 58    | 36    |
| 8     | 6     | 25    | 18    | 42    | 20     | 59    | 38    |
| 9     | 7     | 26    | 11    | 43    | 32     | 60    | 39    |
| 10    | 7     | 27    | 19    | 44    | 32     | 61    | 39    |
| 11    | 7     | 28    | 8     | 45    | 31     | 62    | 40    |
| 12    | 5     | 29    | 9     | 46    | 31     | 63    | 2     |
| 13    | 13    | 30    | 9     | 47    | 2      | 64    | 29    |
| 14    | 13    | 31    | 20    | 48    | 33     | 65    | 1     |
| 15    | 13    | 32    | 24    | 49    | 34     | 66    | 12    |
| 16    | 21    | 33    | 22    | 50    | 34     | 67    | 27    |
| 17    | 14    | 34    | 23    | 51    | 33     | 68    | 27    |
