/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Rhythm catalog: the authoritative, build-time-packaged source of
 * complete-measure rhythm patterns and the Music Domain functions that
 * parse it and compute eligible rhythms.
 *
 * The curated catalog at `Notes/all-rhythms.txt` is the hand-maintained
 * source of truth. Each time-signature heading is followed by one token
 * sequence per line over the tokens `W`, `H`, `D`, `Q`, `R`, and `E`.
 * Token durations are fixed in quarter-note beats: `W` = 4, `H` = 2,
 * `D` = 3, `Q` = 1, `R` = 1.5, `E` = 0.5. Measure length per supported
 * heading is fixed: 2/4 = 2, 3/4 = 3, 4/4 = 4 quarter-note beats.
 *
 * Length validation uses exact arithmetic — every duration and measure
 * length is counted in eighth-note units (quarter beats multiplied by 2)
 * so a pattern of eighths and dotted quarters is judged exactly by integer
 * comparison, never accumulated floating-point sums with a tolerance.
 *
 * Duplicate identical patterns under the same heading are deliberately
 * allowed in the curated file (it is maintained by hand and an accidental
 * repeat must not break the build). Packaging de-duplicates them, so each
 * distinct pattern appears exactly once in the parsed catalog and the
 * recency-weighted repeat selection in Issue 24 is not skewed by a
 * curation accident.
 *
 * Catalog validation contributes to the health check from Issue 1: syntax,
 * supported tokens only, supported headings only, exact measure length for
 * every pattern under its heading, and at least one pattern for each
 * supported time signature. A malformed catalog fails health validation
 * rather than failing at generation time, and the failure message names the
 * offending meter and line.
 * @module lib/rhythm-catalog
 */
import Result from 'true-myth/result'

/**
 * Token durations in quarter-note beats, fixed by Issue 12.
 *
 * `W` = whole = 4, `H` = half = 2, `D` = dotted-half = 3, `Q` = quarter = 1,
 * `R` = dotted-quarter = 1.5, `E` = eighth = 0.5.
 */
export const TOKEN_DURATIONS: Readonly<Record<string, number>> = {
  W: 4,
  H: 2,
  D: 3,
  Q: 1,
  R: 1.5,
  E: 0.5,
}

/**
 * Measure lengths in quarter-note beats per supported meter, fixed by Issue 12.
 *
 * 2/4 = 2, 3/4 = 3, 4/4 = 4 quarter-note beats.
 */
export const MEASURE_LENGTHS: Readonly<Record<string, number>> = {
  '2/4': 2,
  '3/4': 3,
  '4/4': 4,
}

/**
 * The set of supported rhythm tokens (the keys of `TOKEN_DURATIONS`).
 */
export const SUPPORTED_TOKENS: ReadonlySet<string> = new Set(Object.keys(TOKEN_DURATIONS))

/**
 * The set of supported meter headings (the keys of `MEASURE_LENGTHS`).
 */
export const SUPPORTED_METERS: ReadonlySet<string> = new Set(Object.keys(MEASURE_LENGTHS))

/**
 * A single catalog validation defect. The `meter` names the heading (or the
 * offending heading token for an unsupported-heading defect) and `line` is
 * the 1-based line number in the source text, so the health check can name
 * the offending meter and line.
 */
export interface CatalogDefect {
  /** The meter heading the defect occurred under, or the offending heading token. */
  readonly meter: string
  /** The 1-based line number in the source catalog text. */
  readonly line: number
  /** A human-readable description of the defect. */
  readonly message: string
}

/**
 * The parsed, validated, de-duplicated rhythm catalog. Each supported meter
 * maps to an ordered list of distinct complete-measure patterns.
 */
export interface RhythmCatalog {
  /** Distinct patterns per supported meter, in first-appearance order. */
  readonly meters: Readonly<Record<string, readonly string[]>>
}

/**
 * The token duration of a single character, in eighth-note units (quarter
 * beats multiplied by 2), so length validation is exact integer arithmetic.
 */
const tokenEighths = (token: string): number => TOKEN_DURATIONS[token] * 2

/**
 * Sum a pattern's tokens in eighth-note units for exact integer comparison.
 */
const patternEighthSum = (pattern: string): number => {
  let eighths = 0
  for (const token of pattern) {
    eighths += tokenEighths(token)
  }
  return eighths
}

/**
 * A heading line is a supported meter token (e.g. `2/4`, `3/4`, `4/4`).
 */
const isMeterHeading = (line: string): boolean => SUPPORTED_METERS.has(line)

/**
 * A candidate heading line that looks meter-shaped (`n/m`) but is not a
 * supported meter. Used to name the offending heading in defect messages.
 */
const looksLikeMeter = (line: string): boolean => /^\d+\/\d+$/.test(line)

/**
 * Parse and validate the rhythm catalog text.
 *
 * The text format is: a supported meter heading on its own line, followed by
 * one token sequence per line over the supported tokens, until the next
 * heading or end of text. Blank lines are ignored. Each pattern's token
 * durations must sum exactly to its heading's measure length (compared in
 * eighth-note units, never with a floating-point tolerance). Every supported
 * meter must have at least one pattern. Duplicate identical patterns under
 * the same heading are allowed in the source and de-duplicated in the parsed
 * catalog. Every defect is collected in one pass and reported together; each
 * defect names the offending meter and the 1-based line number.
 *
 * @param text - The raw rhythm catalog text.
 * @returns `Ok` with the parsed, de-duplicated catalog, or `Err` with every defect.
 */
export const parseRhythmCatalog = (
  text: string,
): Result<RhythmCatalog, readonly CatalogDefect[]> => {
  const lines = text.split('\n')
  const defects: CatalogDefect[] = []
  const meters: Record<string, string[]> = {}
  let currentMeter: string | null = null

  for (let i = 0; i < lines.length; i += 1) {
    const lineNumber = i + 1
    const raw = lines[i]
    const trimmed = raw.trim()

    if (trimmed === '') {
      continue
    }

    if (isMeterHeading(trimmed)) {
      currentMeter = trimmed
      if (!(currentMeter in meters)) {
        meters[currentMeter] = []
      }
      continue
    }

    if (looksLikeMeter(trimmed)) {
      // A meter-shaped line that is not a supported meter is an unsupported
      // heading regardless of whether a current heading is active.
      defects.push({
        meter: trimmed,
        line: lineNumber,
        message: `Unsupported meter heading "${trimmed}".`,
      })
      continue
    }

    if (currentMeter === null) {
      // A non-blank, non-meter-shaped line before any heading.
      defects.push({
        meter: '',
        line: lineNumber,
        message: `Malformed line "${trimmed}" is not a meter heading or a pattern.`,
      })
      continue
    }

    // A pattern line under the current heading. Validate each token.
    let tokenDefect = false
    for (const token of trimmed) {
      if (!SUPPORTED_TOKENS.has(token)) {
        defects.push({
          meter: currentMeter,
          line: lineNumber,
          message: `Unknown token "${token}" in pattern "${trimmed}".`,
        })
        tokenDefect = true
      }
    }

    // Validate exact measure length in eighth-note units only when every
    // token is supported, so an unknown-token defect is not doubled with a
    // wrong-length defect for the same line.
    if (!tokenDefect) {
      const patternEighths = patternEighthSum(trimmed)
      const measureEighths = MEASURE_LENGTHS[currentMeter] * 2
      if (patternEighths !== measureEighths) {
        defects.push({
          meter: currentMeter,
          line: lineNumber,
          message: `Pattern "${trimmed}" sums to ${patternEighths / 2} quarter beats; meter ${currentMeter} requires ${measureEighths / 2}.`,
        })
      }
    }

    // Record the pattern even if it has a length/token defect, so a later
    // de-duplication pass still sees it; defects already gate the result.
    meters[currentMeter].push(trimmed)
  }

  // Every supported meter must have at least one pattern.
  for (const meter of SUPPORTED_METERS) {
    if (!(meter in meters) || meters[meter].length === 0) {
      defects.push({
        meter,
        line: 0,
        message: `Meter ${meter} has no patterns.`,
      })
    }
  }

  if (defects.length > 0) {
    return Result.err(defects)
  }

  // De-duplicate identical patterns under each heading, preserving
  // first-appearance order.
  const deduped: Record<string, string[]> = {}
  for (const meter of Object.keys(meters)) {
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const pattern of meters[meter]) {
      if (!seen.has(pattern)) {
        seen.add(pattern)
        ordered.push(pattern)
      }
    }
    deduped[meter] = ordered
  }

  return Result.ok({ meters: deduped })
}

/**
 * Compute the eligible rhythms for a meter given a set of selected duration
 * tokens. A rhythm is eligible only when every token it contains is in the
 * selected set. A selection with no qualifying pattern returns an empty
 * array — never an error and never a thrown exception. An unsupported meter
 * returns an empty array. The function is pure and does not mutate its
 * arguments; because the parsed catalog is already de-duplicated, the
 * eligible set contains no duplicate patterns.
 *
 * @param catalog - The parsed, validated, de-duplicated rhythm catalog.
 * @param meter - The meter heading to filter (e.g. `2/4`).
 * @param selectedTokens - The set of duration tokens the student selected.
 * @returns The patterns for the meter whose every token is selected, or an empty array.
 */
export const computeEligibleRhythms = (
  catalog: RhythmCatalog,
  meter: string,
  selectedTokens: ReadonlySet<string>,
): readonly string[] => {
  const patterns = catalog.meters[meter]
  if (!patterns) {
    return []
  }
  const eligible: string[] = []
  for (const pattern of patterns) {
    let allSelected = true
    for (const token of pattern) {
      if (!selectedTokens.has(token)) {
        allSelected = false
        break
      }
    }
    if (allSelected) {
      eligible.push(pattern)
    }
  }
  return eligible
}
