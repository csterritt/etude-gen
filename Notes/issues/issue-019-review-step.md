## Issue 19: Review step showing the complete configuration

**Type**: AFK
**Blocked by**: Issue 17, Issue 18

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Deliver `GET /etude/review`: a read-only presentation of every selection — measures, time signature, key, octave ranges, hands, selected pitches, selected durations, and the split boundary where applicable — with a Back link and a Generate control, so the student approves the complete configuration before generation. Covers the PRD's review route and the requirement to review every selection before generating.

### Review completion is derived, never persisted

`GET /etude/review` is a safe, side-effect-free request. It **must not** mark anything,
write anything, or increment the workflow version. A cacheable navigation request that
mutates persisted state would let browser prefetching, retries, multiple tabs, or
automated link checking change the workflow merely by reading it, and the PRD's route
contract defines review only as a GET.

Instead, "review complete" is a derived predicate over the snapshot: every applicable
prior step is confirmed and its stored values still validate. That predicate is computed by
the same resolver Issue 18 builds and is the generation precondition. There is no stored
review flag anywhere in the aggregate, so there is also nothing for Issue 11 to clear —
review simply stops being reachable when a downstream step loses its confirmation.

### The Generate control

The Generate control is **rendered here and is a real form**: a `POST /etude/generate` form
carrying the hidden workflow version, with a submit button. It is not inert and it is not
hidden. Until Issue 20 implements the route, the route exists and answers by redirecting
back to review with a safe "not available yet" message; the form, its method, its action,
and its version field are asserted by this slice's tests. Choosing this over "present but
inert or hidden" keeps the review page's contract stable and testable across both slices.

### Cross-cutting contract

`Notes/issues/etude-cross-cutting-contract.md` applies:

- Section 1 — authentication, no-cache, owner scoping, safe messages.
- Section 3 — the Generate form is an operation POST, so it carries the workflow version
  as a precondition rather than a compare-and-set that increments.
- Section 5 — review is reachable exactly when the derived predicate holds; otherwise the
  Issue 18 redirect applies.

### How to verify

- **Manual**: complete every step and confirm review lists every selection accurately, including the split boundary for two hands and its absence for one hand; change an upstream value and confirm review is no longer reachable until the affected steps are redone.
- **Automated**: Playwright tests asserting the review page lists each configured value for both a one-hand and a two-hand workflow, that Back returns to the canonical prior step, that an upstream change makes review unreachable until the downstream steps are completed again, and that the Generate control is a POST form to `/etude/generate` carrying the current workflow version. A dedicated test loads `GET /etude/review` twice and asserts the workflow version, the aggregate epoch, and every stored value are byte-for-byte unchanged, and that a `HEAD` or repeated prefetch-style request changes nothing either. A Bun test asserts the derived review predicate is computed from the snapshot and that no review flag exists in the aggregate.

### Acceptance criteria

- [ ] Given a complete configuration, when review is loaded, then every selection is displayed accurately and read-only.
- [ ] Given a two-hand workflow, then review shows the split boundary and each hand's pitches; given one hand, then no split information is shown.
- [ ] Given an incomplete workflow, when review is requested, then the prerequisite redirect from Issue 18 applies.
- [ ] Given `GET /etude/review` requested any number of times, then no persisted state changes: the workflow version, the aggregate epoch, and every stored value are identical before and after.
- [ ] Given the aggregate, then it contains no persisted review-completion flag and review reachability is computed from step confirmations and current value validity.
- [ ] Given an upstream change, then review stops being reachable without any review flag being written or cleared.
- [ ] Given the review page, then the Generate control is a POST form to `/etude/generate` carrying the current workflow version, and it is neither inert nor hidden.

### User stories addressed

- User story 27: Review every selection before generation

---
