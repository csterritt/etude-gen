/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Duration-disabled-set computation for the Issue 15 progressive
 * enhancement.
 *
 * `computeDisabledDurations` is a pure function that, given the currently
 * selected duration tokens and the meter's complete-measure patterns, returns
 * the tokens whose deselection would leave no eligible pattern. A pattern is
 * eligible when every token it contains is in the selected set.
 *
 * The client enhancement script mirrors this logic to mark toggles with
 * `aria-disabled="true"` so a student cannot reach review with an impossible
 * rhythm set. The server-side validation from Issue 14 remains authoritative;
 * this module adds no client-side authority over validation, ownership, or
 * persisted state.
 *
 * The function does not import the catalog parser — the caller supplies the
 * patterns — so the module stays free of catalog I/O and can be unit-tested
 * with synthetic patterns.
 * @module lib/duration-disabled-set
 */

import { CANONICAL_DURATION_ORDER } from './duration-selection-validator'

/**
 * Determine whether at least one pattern is eligible for the given token set.
 * A pattern is eligible when every token it contains is in `tokens`.
 * @param patterns - The meter's complete-measure patterns (each an array of tokens)
 * @param tokens - The set of selected duration tokens to test against
 * @returns `true` when at least one pattern's tokens are all in `tokens`
 */
const hasEligiblePattern = (
  patterns: ReadonlyArray<ReadonlyArray<string>>,
  tokens: ReadonlySet<string>,
): boolean => {
  for (const pattern of patterns) {
    let allSelected = true
    for (const token of pattern) {
      if (!tokens.has(token)) {
        allSelected = false
        break
      }
    }
    if (allSelected) {
      return true
    }
  }
  return false
}

/**
 * Compute the set of duration tokens whose deselection from `selectedTokens`
 * would leave no eligible complete-measure pattern.
 *
 * For each token in `selectedTokens`, the function tests whether the set
 * minus that token still admits at least one eligible pattern (a pattern whose
 * every token is in the reduced set). If not, the token is disabled — the
 * student must not be able to deselect it, because doing so would make the
 * rhythm set impossible.
 *
 * The returned tokens are in canonical order (descending duration: whole, half,
 * dotted half, quarter, dotted quarter, eighth), regardless of the iteration
 * order of `selectedTokens`.
 *
 * The function is pure: it never throws and never mutates its arguments. An
 * empty selection or an empty pattern list yields an empty disabled set.
 * @param selectedTokens - The currently selected duration tokens
 * @param meterPatterns - The meter's complete-measure patterns (each an array of tokens)
 * @returns The disabled duration tokens in canonical order
 */
export const computeDisabledDurations = (
  selectedTokens: ReadonlySet<string>,
  meterPatterns: ReadonlyArray<ReadonlyArray<string>>,
): string[] => {
  if (selectedTokens.size === 0 || meterPatterns.length === 0) {
    return []
  }

  const disabled: string[] = []
  for (const token of selectedTokens) {
    const reduced = new Set(selectedTokens)
    reduced.delete(token)
    if (!hasEligiblePattern(meterPatterns, reduced)) {
      disabled.push(token)
    }
  }

  // Return in canonical order regardless of the Set's iteration order.
  return CANONICAL_DURATION_ORDER.filter((token) => disabled.includes(token))
}
