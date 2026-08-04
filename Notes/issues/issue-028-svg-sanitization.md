## Issue 28: SVG sanitization before storage

**Type**: AFK
**Blocked by**: Issue 27

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Sanitize service SVG output with DOMPurify in a jsdom-compatible environment before it is stored, and treat the result as untrusted presentation data again when it is embedded. Scripts, event handlers, external resource loads, foreign interactive content, and unsafe links are removed or rejected. Sanitization that cannot produce a valid inert SVG is a typed failure, not a degraded result.

Add the DOMPurify and jsdom-compatible dependencies noted in the PRD's "Further Notes" — they are not currently in the project. Malformed SVG that does not parse is also a typed failure.

DOMPurify's defaults are not the policy. The allowlist below is the policy, configured
explicitly so an upstream default change cannot widen what the application accepts.

### Sanitizer policy

**Parser mode.** The document is parsed inert, as XML/SVG, in a jsdom document that never
executes script, never resolves external references, and has no network or file access. The
sanitizer is configured for the SVG profile with the allowlists below, not with
`ALLOWED_TAGS`/`ALLOWED_ATTR` left at their defaults.

**Structure.** The result must be exactly one `<svg>` root element with no sibling content,
no XML processing instructions, no DOCTYPE, no comments, and no elements outside the SVG
namespace. Namespace changes and namespace-prefixed foreign elements are rejected, not
stripped, because a document that needed them was not the engraving output.

**Allowed elements.** `svg`, `g`, `defs`, `path`, `line`, `polyline`, `polygon`, `rect`,
`circle`, `ellipse`, `text`, `tspan`, `title`, `desc`, `symbol`, `use`, `clipPath`,
`marker`, `metadata`. Everything else — including `script`, `style`, `foreignObject`,
`image`, `a`, `animate` and every other SMIL animation element, `iframe`, `embed`,
`object`, `audio`, `video`, `set`, `handler`, `filter` and its children — is removed or, for
`script` and `foreignObject`, treated as a rejection rather than a silent strip, because
their presence means the output is not engraving markup.

**Allowed attributes.** Geometry and drawing attributes (`d`, `x`, `y`, `x1`, `y1`, `x2`,
`y2`, `cx`, `cy`, `r`, `rx`, `ry`, `width`, `height`, `points`, `transform`, `viewBox`,
`preserveAspectRatio`), presentation attributes (`fill`, `fill-rule`, `fill-opacity`,
`stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `stroke-dasharray`,
`stroke-opacity`, `opacity`, `color`, `font-family`, `font-size`, `font-style`,
`font-weight`, `text-anchor`, `dominant-baseline`, `letter-spacing`, `xml:space`),
identity/reference attributes (`id`, `class`, `clip-path`, `href` restricted as below,
`markerWidth`, `markerHeight`, `refX`, `refY`, `orient`, `markerUnits`), and
`xmlns`/`xmlns:xlink` on the root only.

**Explicitly disallowed.** Every `on*` event handler attribute. `style` attributes and
`<style>` elements are removed entirely — CSS is not sanitized, it is forbidden, so
`url()`, `@import`, and CSS-driven behaviour cannot appear. `tabindex`, `focusable`,
`role`, `aria-*`, and `xml:base` are removed; accessibility semantics for the score come
from the structured text in Issue 21, not from inside the SVG, and allowing them would
create duplicate screen-reader content.

**URL policy.** No absolute or scheme-relative URL of any kind survives. `href`/`xlink:href`
is allowed only on `<use>` and only as a same-document fragment reference matching
`^#[A-Za-z][-A-Za-z0-9_.]*$` that resolves to an `id` present in the same sanitized
document; a dangling fragment is removed along with its `<use>`. `data:` URLs are
disallowed everywhere, including inside `<use>`, so no inline payload can be smuggled in.
`javascript:`, `blob:`, `filesystem:`, and protocol-relative `//host` values are
rejections rather than strips.

**Embed-time treatment.** "Treated as untrusted again at embed time" means concretely: the
bytes fetched from R2 are re-validated before being written into the response — they parse
as a single SVG root, they contain no disallowed element or attribute from the lists above,
and their byte length matches the persisted length from Issue 29 — and only then are they
inlined. A failed re-validation is a retryable render failure (Issue 31), not a degraded
page. The inlined root carries `aria-hidden="true"` and `focusable="false"` and no
`tabindex`, so it contributes nothing to the accessibility tree or the tab order.

**Fidelity testing.** Fidelity is asserted against a small set of committed, known-safe
LilyPond output fixtures — one per supported meter, one flat key, one sharp key, one
one-hand and one two-hand score — by comparing the sanitized output to a committed expected
sanitized document. "Same visual meaning" is not an assertion; the fixtures are.

### How to verify

- **Manual**: feed a crafted SVG containing a script element and an external image reference through the sanitizer and confirm both are gone from the stored output.
- **Automated**: Bun tests asserting the policy element by element: each disallowed element removed or rejected as specified, every `on*` attribute removed, `style` attributes and `<style>` elements removed, `foreignObject` and `script` rejected rather than stripped, `image` and `a` removed, SMIL animation elements removed, `xml:base` removed, `role`/`aria-*`/`tabindex`/`focusable` removed, a namespace-prefixed foreign element rejected, a DOCTYPE and an XML processing instruction rejected, more than one root element rejected, a `<use>` with a valid same-document fragment preserved, a `<use>` with a dangling fragment removed, and `data:`, `javascript:`, `blob:`, absolute `https:`, and protocol-relative `href` values rejected. Fixture tests compare each committed known-safe LilyPond fixture to its committed expected sanitized output byte-for-byte. Further tests cover malformed SVG, a document that cannot be reduced to a valid inert SVG, and the embed-time re-validation rejecting bytes that were tampered with in storage.

### Acceptance criteria

- [ ] Given SVG containing a script element, event handler attribute, `style` attribute or element, or unsafe link, then the document is rejected or those constructs are removed per the policy, and the result contains no executable, styled-by-CSS, or navigable content.
- [ ] Given SVG referencing any external, absolute, protocol-relative, or `data:` URL, then the reference is removed or the document is rejected, and no `data:` payload survives anywhere.
- [ ] Given an element or attribute not on the allowlist, then it does not appear in the output, and the allowlists are configured explicitly rather than inherited from sanitizer defaults.
- [ ] Given a document with more than one root element, a DOCTYPE, an XML processing instruction, or a foreign namespace, then it is rejected.
- [ ] Given a `<use>` element, then it survives only with a same-document fragment reference that resolves to an id in the same sanitized document, and is removed otherwise.
- [ ] Given each committed known-safe LilyPond fixture, then its sanitized output matches the committed expected sanitized document exactly.
- [ ] Given malformed SVG, then a typed sanitization failure is returned and nothing is stored.
- [ ] Given a document that cannot be reduced to a valid inert SVG, then a typed failure is returned rather than partial output.
- [ ] Given stored bytes at embed time, then they are re-validated against the same policy and their persisted byte length before being inlined, and a failure is treated as a retryable render failure.
- [ ] Given the inlined SVG, then it carries `aria-hidden="true"` and `focusable="false"`, has no `tabindex`, and contributes no accessible name, role, or focus stop.

### User stories addressed

- User story 41: The embedded SVG contains no unsafe or inaccessible interactive content

---
