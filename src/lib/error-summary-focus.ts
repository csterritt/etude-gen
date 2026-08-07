/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Error-summary focus-on-load script builder.
 *
 * Returns a minimal, server-rendered inline `<script>` that moves focus to the
 * error summary element after an invalid submission reloads the step. This is
 * the first and only client-side script in the project; it exists solely to
 * satisfy the issue's "error summary receives programmatic focus on load"
 * acceptance criterion, which cannot be achieved with HTML alone.
 *
 * The script is guarded so it never throws when the summary is absent (e.g. on
 * a clean step). It contains only the summary id and DOM focus logic — no
 * field name, submitted value, or error text.
 * @module lib/error-summary-focus
 */

/**
 * Build a guarded inline `<script>` that focuses the error summary by id on
 * load. The script resolves `document.getElementById(summaryId)` and, if
 * present, calls `.focus()` on it. When the element is absent the script does
 * nothing.
 * @param summaryId - The id of the error-summary element to focus
 * @returns A string containing a `<script>` element
 */
export const buildErrorSummaryFocusScript = (summaryId: string): string => {
  return `<script>(function(){var el=document.getElementById('${summaryId}');if(el){el.focus();}})();</script>`
}
