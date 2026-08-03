## Issue 19: Review step showing the complete configuration

**Type**: AFK
**Blocked by**: Issue 17, Issue 18

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Deliver `GET /etude/review`: a read-only presentation of every selection — measures, time signature, key, octave ranges, hands, selected pitches, selected durations, and the split boundary where applicable — with a Back link and a Generate control, so the student approves the complete configuration before generation. Covers the PRD's review route and the requirement to review every selection before generating.

Reaching review marks the workflow as review-complete; any upstream change resets that completion through the invalidation built in Issue 11. The Generate control posts in the next slice; here it can be present and inert or hidden behind the generation slice — the review content itself is what this slice delivers.

### How to verify

- **Manual**: complete every step and confirm review lists every selection accurately, including the split boundary for two hands and its absence for one hand; change an upstream value and confirm review is no longer reachable until the affected steps are redone.
- **Automated**: Playwright tests asserting the review page lists each configured value for both a one-hand and a two-hand workflow, that Back returns to the canonical prior step, and that an upstream change makes review unreachable until the downstream steps are completed again.

### Acceptance criteria

- [ ] Given a complete configuration, when review is loaded, then every selection is displayed accurately and read-only.
- [ ] Given a two-hand workflow, then review shows the split boundary and each hand's pitches; given one hand, then no split information is shown.
- [ ] Given an incomplete workflow, when review is requested, then the prerequisite redirect from Issue 18 applies.
- [ ] Given an upstream change after review, then review completion is reset.

### User stories addressed

- User story 27: Review every selection before generation

---
