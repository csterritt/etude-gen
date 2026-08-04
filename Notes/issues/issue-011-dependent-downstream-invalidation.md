## Issue 11: Upstream changes clear dependent downstream choices

**Type**: AFK
**Blocked by**: Issue 7

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Make a successful setup change clear all dependent note, duration, and split confirmation state, so previously valid downstream selections cannot silently become invalid. Covers the PRD decision that changing setup selections invalidates dependent state and that any retained Piece becomes stale with its score and PDF controls hidden.

The Workflow Service owns this invalidation, driven by which upstream fields actually changed — resubmitting identical values must not discard downstream work. At this stage the downstream fields exist in the aggregate even where their steps arrive in later slices; hiding a stale Piece is wired in when generation exists.

Review completion is **derived, not stored** (section 5 of the cross-cutting contract),
so there is no review flag to clear: review simply stops being reachable once a
downstream step loses its confirmation. This issue must not introduce a persisted review
flag.

### Cross-cutting contract

`Notes/issues/etude-cross-cutting-contract.md` applies:

- Section 2 — this invalidation is the parameter-form contract's clause 6 and runs in the
  same committed transition as the version increment.
- Section 4 — the invalidating write is the same compare-and-set write as the parameter
  change; there is no second, separate transition.
- Section 5 — the canonical route after invalidation is the earliest step that is now
  unconfirmed.

### Dependency map

| Changed upstream field | Cleared downstream state                                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key                    | pitch selection, split boundary; duration selection retained                                                                                                                  |
| Octave ranges          | pitch selection, split boundary; duration selection retained                                                                                                                  |
| Meter                  | duration selection; pitch selection and split boundary retained                                                                                                               |
| Measure count          | nothing downstream; the Piece still becomes stale                                                                                                                             |
| Hands                  | split boundary; pitch selection retained but revalidated against the two-hand minimum, and an existing selection that no longer satisfies it makes the notes step unconfirmed |

Every one of these changes also increments the workflow version, which makes any retained
Piece stale by definition.

### How to verify

- **Manual**: complete setup, make downstream selections, then change the key or octave range and confirm the downstream selections are cleared and must be made again; resubmit setup with unchanged values and confirm nothing is cleared.
- **Automated**: Bun tests over the Workflow Service asserting invalidation for each row of the dependency map, no invalidation when values are unchanged, that a single submission changing several upstream fields at once clears the union of their dependents exactly once, that switching from one hand to both makes the notes step unconfirmed when fewer than two pitches are stored, and that review reachability is recomputed rather than read from a stored flag. A further test submits a stale workflow version together with upstream changes and asserts the compare-and-set rejection happens first so nothing is invalidated. A Playwright test walks forward, changes an upstream value, and asserts the downstream step no longer reports completion.

### Acceptance criteria

- [ ] Given saved downstream selections, when the key, octave range, meter, or hand selection changes, then exactly the dependent state listed in the dependency map is cleared and unrelated downstream state is retained.
- [ ] Given a setup submission whose values are identical to the saved ones, then downstream state is preserved.
- [ ] Given one submission that changes several upstream fields, then the union of their dependents is cleared in that single committed transition.
- [ ] Given cleared downstream state, then the workflow's earliest incomplete step moves back accordingly and review is no longer reachable, without any stored review flag being consulted.
- [ ] Given an injected failure during the invalidating write, then the externally visible state is unchanged: the prior upstream values are still saved, the prior downstream selections are still saved, the workflow version has not incremented, and the student sees a generic retry message with a correlation identifier.
- [ ] Given a submission carrying a stale workflow version alongside upstream changes, then the compare-and-set rejection occurs first and no invalidation takes place.

### User stories addressed

- User story 26: Upstream changes clear dependent downstream choices

---
