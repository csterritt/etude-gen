/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Shared accessible error-summary component.
 *
 * Renders a focused, link-based summary of field-level errors after an invalid
 * form submission. Each entry is an anchor that resolves to the offending
 * control so keyboard and screen-reader students can jump straight to it. The
 * summary uses `role="alert"` so it is announced on load, carries
 * `aria-labelledby` pointing at its heading, and has `tabindex={-1}` so it can
 * receive programmatic focus (the route renders a tiny inline focus script
 * from `src/lib/error-summary-focus.ts` to move focus to it on redisplay).
 *
 * The summary is rendered only when there are entries — it is never emitted
 * empty or hidden, per the issue's "no summary element when there are no
 * errors" rule.
 *
 * `buildErrorSummaryEntries` is a pure function so it can be unit-tested in
 * isolation and so the route can build the entries once and pass them to the
 * component.
 * @module components/error-summary
 */
import type { FieldError } from '../lib/safe-redisplay'

/**
 * Group-field configuration: maps a field name that represents a multi-value
 * group (e.g. `octaves`) to the id of its first member control. A group-level
 * error's summary entry links to that first member so activating it moves
 * focus into the group, and the entry is marked `isGroup` so the component can
 * associate the error with the group container rather than a single member.
 */
export interface GroupFieldSpec {
  firstMemberId: string
}

/**
 * A single error-summary entry. `anchorId` is the unique id placed on the
 * summary's anchor element (and on the matching field-level error element via
 * `aria-describedby`); `controlId` is the id of the control the entry links to
 * and moves focus into; `text` is the corrective message; `isGroup` marks
 * group-level errors whose `controlId` is the group's first member.
 */
export interface ErrorSummaryEntry {
  anchorId: string
  controlId: string
  text: string
  isGroup: boolean
}

/**
 * Build the ordered, deduplicated list of error-summary entries from the
 * field-addressable errors, the form's field order, and the group-field
 * configuration.
 *
 * Rules:
 * - One entry per distinct error message per field. Duplicate error text for
 *   the same field is emitted once.
 * - Entries are ordered by the field's position in `fieldOrder`. Fields not
 *   in `fieldOrder` are placed at the end, in the order they first appear in
 *   `fieldErrors`.
 * - Within a single field, the per-field error order is preserved.
 * - Each entry gets a unique `anchorId` of the form `<field>-error-<index>`,
 *   where `<index>` is the per-field error index after dedupe.
 * - A field listed in `groupFields` produces a group entry whose `controlId`
 *   is the group's `firstMemberId` and whose `isGroup` is `true`. A non-group
 *   field's `controlId` is `<field>-field` and `isGroup` is `false`.
 * @param fieldErrors - Field-addressable failures from the parser/validator
 * @param fieldOrder - Field names in the order they appear in the form
 * @param groupFields - Maps group field names to their first member control id
 * @returns Ordered, deduplicated ErrorSummaryEntry array (empty when no errors)
 */
export const buildErrorSummaryEntries = (
  fieldErrors: FieldError[],
  fieldOrder: string[],
  groupFields: Record<string, GroupFieldSpec>,
): ErrorSummaryEntry[] => {
  if (fieldErrors.length === 0) {
    return []
  }

  // Group errors by field, deduping identical messages per field while
  // preserving first-appearance order within each field.
  const byField = new Map<string, string[]>()
  for (const err of fieldErrors) {
    const messages = byField.get(err.field) ?? []
    if (!messages.includes(err.message)) {
      messages.push(err.message)
    }
    byField.set(err.field, messages)
  }

  // Order the fields: known fields in fieldOrder order, then unknown fields in
  // first-appearance order.
  const orderedFields: string[] = []
  for (const field of fieldOrder) {
    if (byField.has(field)) {
      orderedFields.push(field)
    }
  }
  for (const field of byField.keys()) {
    if (!fieldOrder.includes(field)) {
      orderedFields.push(field)
    }
  }

  // Build the entries.
  const entries: ErrorSummaryEntry[] = []
  for (const field of orderedFields) {
    const messages = byField.get(field) ?? []
    const groupSpec = groupFields[field]
    const isGroup = groupSpec !== undefined
    const controlId = isGroup ? groupSpec.firstMemberId : `${field}-field`
    messages.forEach((message, index) => {
      entries.push({
        anchorId: `${field}-error-${index}`,
        controlId,
        text: message,
        isGroup,
      })
    })
  }

  return entries
}

/**
 * Props for the {@link ErrorSummary} component.
 */
interface ErrorSummaryProps {
  entries: ErrorSummaryEntry[]
  summaryId?: string
  headingId?: string
  heading?: string
}

/**
 * Default corrective heading for the error summary.
 */
const DEFAULT_HEADING = 'Please correct the following:'

/**
 * Render the accessible error summary. Renders nothing when `entries` is empty
 * — the summary is never emitted empty or hidden. When entries are present,
 * renders a `<section role="alert" aria-labelledby>` containing a heading and
 * an ordered list of anchor links, one per entry. Each link's `href` is
 * `#<controlId>` so activating it moves focus to the offending control. The
 * section has `tabindex={-1}` so it can receive programmatic focus.
 *
 * Group entries get `data-testid='error-summary-group'` and an `aria-label`
 * indicating the group so assistive technology can distinguish them.
 * @param entries - Ordered, deduplicated summary entries
 * @param summaryId - id for the section element (default 'error-summary')
 * @param headingId - id for the heading element (default 'error-summary-heading')
 * @param heading - Heading text (default 'Please correct the following:')
 * @returns A TSX section element, or null when entries is empty
 */
export const ErrorSummary = ({
  entries,
  summaryId = 'error-summary',
  headingId = 'error-summary-heading',
  heading = DEFAULT_HEADING,
}: ErrorSummaryProps) => {
  if (entries.length === 0) {
    return null
  }

  return (
    <section
      id={summaryId}
      role='alert'
      aria-labelledby={headingId}
      tabIndex={-1}
      data-testid='error-summary'
      className='alert alert-error mx-auto mt-4 mb-4'
    >
      <div className='w-full'>
        <h2 id={headingId} className='font-bold text-lg mb-2'>
          {heading}
        </h2>
        <ol className='list-decimal list-inside'>
          {entries.map((entry) => {
            const linkProps = {
              href: `#${entry.controlId}`,
              'data-testid': entry.isGroup ? 'error-summary-group' : 'error-summary-link',
            } as const
            return (
              <li key={entry.anchorId}>
                <a
                  {...linkProps}
                  aria-label={
                    entry.isGroup ? `Group error: ${entry.text}` : entry.text
                  }
                >
                  {entry.text}
                </a>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
