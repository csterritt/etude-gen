# Issue 15: Progressive enhancement for duration toggles and Select all

*2026-08-11T14:30:40Z by Showboat 0.6.1*
<!-- showboat-id: e6113c19-4047-43a9-9018-cbdece3a798c -->

This walkthrough covers the Issue 15 implementation: the strictly additive client-side progressive enhancement that prevents a student from reaching review with an impossible rhythm set. It walks through (1) the pure computeDisabledDurations function (the disabled-set algorithm whose deselection would leave no eligible pattern), (2) the server-rendered enhancement hooks in build-etude-notes.tsx (embedded patterns JSON data block, per-toggle reason-text spans, polite live region, enhancement script reference), and (3) the client enhancement script public/notes-enhancement.js (first-paint disabled-set computation, aria-disabled marking, aria-describedby wiring, live-region announcements, click suppression, Select all without a round trip, and graceful init-failure). Each section includes executable test runs as proof.

## 1. computeDisabledDurations pure function

```bash
cd /home/chris/etude-gen && bun test tests/duration-disabled-set.spec.ts 2>&1 | tail -6
```

```output
(pass) computeDisabledDurations > handles a token in the selection that appears in no pattern (not disabled) [0.02ms]

 12 pass
 0 fail
 12 expect() calls
Ran 12 tests across 1 file. [15.00ms]
```

The computeDisabledDurations pure function (src/lib/duration-disabled-set.ts) returns the duration tokens whose deselection from the current selection would leave no eligible complete-measure pattern. A pattern is eligible when every token it contains is in the selected set. For each token in the selection, the function tests whether the set minus that token still admits at least one eligible pattern; if not, the token is disabled. The returned tokens are in CANONICAL_DURATION_ORDER regardless of the input set's iteration order. The function is pure: it never throws, never mutates its arguments, and does not import the catalog parser — the caller supplies the patterns. The 12-test suite above (duration-disabled-set.spec.ts) proves required-token detection, empty cases, canonical ordering, non-mutation, single-selection, multi-required, shared-dependency, no-pattern, no-selection, and irrelevant-token cases.

## 2. Server-rendered enhancement hooks in build-etude-notes.tsx

The GET /etude/notes handler now passes the current meter's catalog patterns (catalog.meters[timeSignature]) to the render function. The rendered page embeds the meter and its patterns as a non-executing JSON data block (<script type="application/json" id="notes-rhythm-data">) so the client enhancement script can compute the disabled set without a second fetch. Each duration toggle has a sibling reason-text span (id="duration-reason-<token>") that the client populates and references via aria-describedby when the toggle is disabled. A polite live region (data-testid="duration-live-region", aria-live="polite") announces state changes. The enhancement script is referenced via <script src="/notes-enhancement.js" defer> — a static asset served from public/ through the Workers ASSETS binding, permitted by the existing scriptSrc 'self' CSP directive (no new inline hash required). None of these hooks change any POST behavior or any no-script-visible control behavior.

## 3. Client enhancement script and end-to-end behavior

```bash
cd /home/chris/etude-gen && LD_LIBRARY_PATH="/tmp/libgbm-local/usr/lib/aarch64-linux-gnu:$LD_LIBRARY_PATH" npx playwright test e2e-tests/etude/17-etude-notes-duration-enhancement.spec.ts e2e-tests/etude/18-etude-notes-enhancement-select-all-bypass.spec.ts e2e-tests/etude/19-etude-notes-duration-no-script.spec.ts --reporter=line 2>&1 | tail -6
```

```output

Database sessions cleared successfully

Database cleared successfully

  16 passed (18.3s)
```

The client enhancement script (public/notes-enhancement.js) is a self-contained, guarded script served as a static asset via the Workers ASSETS binding. It reads the embedded meter patterns JSON and the server-rendered checked state from the DOM; on first paint, before any interaction, it computes the disabled set using the same algorithm as src/lib/duration-disabled-set.ts and marks each disabled toggle with aria-disabled="true" (never the native disabled attribute). It wires each disabled toggle's aria-describedby to its visible reason-text element, writes the reason text, and suppresses deselection by intercepting the click event with preventDefault. It updates the disabled set and the live region's text whenever the selection changes, announcing toggles that enter or leave the disabled state through the polite live region. It enhances Select all by checking every pitch checkbox in place and preventing the form submission (no server round trip). The entire initialization is wrapped in try/catch so that on any error no toggle is marked or suppressed and every control stays fully usable. The script adds no client-side authority over validation, ownership, or persisted state. The 16 Playwright tests above prove: aria-disabled marking and focusability (8 tests), Select all without a reload, init-failure graceful degradation, and scripted bypass still hitting the Issue 14 server rejection (4 tests), and the no-script path remaining fully usable with javaScriptEnabled: false (4 tests).
