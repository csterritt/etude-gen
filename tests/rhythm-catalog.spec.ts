// ====================================
// Tests for the rhythm catalog: token durations, measure lengths,
// exact-arithmetic length validation, syntax/heading validation,
// de-duplication on packaging, and parsing of the real curated catalog
// at Notes/all-rhythms.txt.
// Verifies that token durations in quarter-note beats are W=4, H=2, D=3,
// Q=1, R=1.5, E=0.5 and measure lengths are 2 for 2/4, 3 for 3/4, and 4
// for 4/4; that length validation uses exact integer or rational
// arithmetic (a pattern of eighths and dotted quarters validates exactly
// at the measure length and is rejected one eighth short or long, with no
// floating-point tolerance); that an unknown token, a missing heading, an
// unsupported heading, and a malformed heading each fail validation with a
// message naming the offending meter and line; that every supported meter
// has at least one pattern; that two identical patterns under the same
// heading pass validation and the parsed catalog contains that pattern
// exactly once; and that the real Notes/all-rhythms.txt validates with all
// three supported meters present and every pattern's token durations sum
// exactly to its heading's measure length.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'
import Result from 'true-myth/result'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  TOKEN_DURATIONS,
  MEASURE_LENGTHS,
  SUPPORTED_TOKENS,
  SUPPORTED_METERS,
  parseRhythmCatalog,
} from '../src/lib/rhythm-catalog'

const unwrap = <T, E>(result: Result<T, E>): T => {
  if (!result.isOk) {
    throw new Error(`Expected Ok, got Err: ${JSON.stringify(result.error)}`)
  }
  return result.value
}

const unwrapErr = <T, E>(result: Result<T, E>): E => {
  if (!result.isErr) {
    throw new Error(`Expected Err, got Ok: ${JSON.stringify(result.value)}`)
  }
  return result.error
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const REAL_CATALOG_PATH = join(__dirname, '..', 'Notes', 'all-rhythms.txt')

describe('TOKEN_DURATIONS - exact quarter-note-beat values', () => {
  it('maps each supported token to its exact duration in quarter-note beats', () => {
    expect(TOKEN_DURATIONS.W).toBe(4)
    expect(TOKEN_DURATIONS.H).toBe(2)
    expect(TOKEN_DURATIONS.D).toBe(3)
    expect(TOKEN_DURATIONS.Q).toBe(1)
    expect(TOKEN_DURATIONS.R).toBe(1.5)
    expect(TOKEN_DURATIONS.E).toBe(0.5)
  })

  it('contains exactly the six supported tokens', () => {
    expect(new Set(Object.keys(TOKEN_DURATIONS))).toEqual(
      new Set(['W', 'H', 'D', 'Q', 'R', 'E']),
    )
  })
})

describe('MEASURE_LENGTHS - exact quarter-note-beat values per meter', () => {
  it('maps each supported meter to its exact measure length in quarter-note beats', () => {
    expect(MEASURE_LENGTHS['2/4']).toBe(2)
    expect(MEASURE_LENGTHS['3/4']).toBe(3)
    expect(MEASURE_LENGTHS['4/4']).toBe(4)
  })

  it('contains exactly the three supported meters', () => {
    expect(new Set(Object.keys(MEASURE_LENGTHS))).toEqual(
      new Set(['2/4', '3/4', '4/4']),
    )
  })
})

describe('SUPPORTED_TOKENS and SUPPORTED_METERS', () => {
  it('exposes the supported token set matching the duration table keys', () => {
    expect(SUPPORTED_TOKENS).toEqual(new Set(['W', 'H', 'D', 'Q', 'R', 'E']))
  })

  it('exposes the supported meter set matching the measure-length table keys', () => {
    expect(SUPPORTED_METERS).toEqual(new Set(['2/4', '3/4', '4/4']))
  })
})

describe('parseRhythmCatalog - valid catalogs', () => {
  it('parses a catalog with one pattern per supported meter into an Ok catalog', () => {
    const text = ['2/4', 'QQ', '3/4', 'QQQ', '4/4', 'QQQQ'].join('\n')
    const result = parseRhythmCatalog(text)
    const catalog = unwrap(result)
    expect(catalog.meters['2/4']).toEqual(['QQ'])
    expect(catalog.meters['3/4']).toEqual(['QQQ'])
    expect(catalog.meters['4/4']).toEqual(['QQQQ'])
  })

  it('every parsed pattern sums exactly to its heading measure length in eighth-note units', () => {
    const text = ['2/4', 'QQ', 'ER', 'H', '3/4', 'QQQ', 'D', '4/4', 'QQQQ', 'W'].join('\n')
    const catalog = unwrap(parseRhythmCatalog(text))
    for (const meter of Object.keys(catalog.meters)) {
      const measureEighths = MEASURE_LENGTHS[meter] * 2
      for (const pattern of catalog.meters[meter]) {
        const patternEighths = patternEighthSum(pattern)
        expect(patternEighths).toBe(measureEighths)
      }
    }
  })
})

describe('parseRhythmCatalog - exact arithmetic, no floating-point tolerance', () => {
  it('accepts a pattern of eighths and dotted quarters exactly at the measure length', () => {
    // ER under 2/4: E=0.5, R=1.5 -> 2.0 quarter beats exactly.
    const text = ['2/4', 'ER', '3/4', 'QQQ', '4/4', 'QQQQ'].join('\n')
    const result = parseRhythmCatalog(text)
    expect(result.isOk).toBe(true)
  })

  it('rejects the same fractional pattern one eighth-note short of the measure length', () => {
    // R under 2/4: R=1.5 quarter beats, one eighth-note (0.5) short of 2.0.
    const text = ['2/4', 'R', '3/4', 'QQQ', '4/4', 'QQQQ'].join('\n')
    const defects = unwrapErr(parseRhythmCatalog(text))
    expect(defects.length).toBeGreaterThan(0)
    expect(defects.some((d) => d.meter === '2/4' && d.line === 2)).toBe(true)
  })

  it('rejects the same fractional pattern one eighth-note long of the measure length', () => {
    // EER under 2/4: 0.5+0.5+1.5 = 2.5 quarter beats, one eighth-note (0.5) long of 2.0.
    const text = ['2/4', 'EER', '3/4', 'QQQ', '4/4', 'QQQQ'].join('\n')
    const defects = unwrapErr(parseRhythmCatalog(text))
    expect(defects.length).toBeGreaterThan(0)
    expect(defects.some((d) => d.meter === '2/4' && d.line === 2)).toBe(true)
  })
})

describe('parseRhythmCatalog - syntax and heading defects', () => {
  it('rejects an unknown token under a supported heading, naming the meter and line', () => {
    const text = ['2/4', 'QX'].join('\n')
    const defects = unwrapErr(parseRhythmCatalog(text))
    expect(defects.some((d) => d.meter === '2/4' && d.line === 2)).toBe(true)
  })

  it('rejects a missing heading (a supported meter with no patterns), naming the meter', () => {
    const text = ['2/4', 'QQ', '3/4', 'QQQ'].join('\n') // 4/4 missing
    const defects = unwrapErr(parseRhythmCatalog(text))
    expect(defects.some((d) => d.meter === '4/4')).toBe(true)
  })

  it('rejects an unsupported heading, naming the heading', () => {
    const text = ['2/4', 'QQ', '3/4', 'QQQ', '4/4', 'QQQQ', '5/4', 'QQQQQ'].join('\n')
    const defects = unwrapErr(parseRhythmCatalog(text))
    expect(defects.some((d) => d.meter === '5/4')).toBe(true)
  })

  it('rejects a malformed heading line, naming the line', () => {
    const text = ['2/4', 'QQ', 'garbage line', 'QQ'].join('\n')
    const defects = unwrapErr(parseRhythmCatalog(text))
    expect(defects.some((d) => d.line === 3)).toBe(true)
  })

  it('reports every defect together rather than failing on the first one', () => {
    const text = [
      '2/4',
      'QX', // unknown token, line 2
      '3/4',
      'QQ', // wrong length, line 4
      '4/4',
      'QQQQ',
    ].join('\n')
    const defects = unwrapErr(parseRhythmCatalog(text))
    expect(defects.length).toBeGreaterThanOrEqual(2)
    expect(defects.some((d) => d.line === 2)).toBe(true)
    expect(defects.some((d) => d.line === 4)).toBe(true)
  })
})

describe('parseRhythmCatalog - de-duplication on packaging', () => {
  it('passes validation with two identical patterns under the same heading', () => {
    const text = ['2/4', 'QQ', 'QQ', '3/4', 'QQQ', '4/4', 'QQQQ'].join('\n')
    const result = parseRhythmCatalog(text)
    expect(result.isOk).toBe(true)
  })

  it('contains a duplicated pattern exactly once in the parsed catalog', () => {
    const text = ['2/4', 'QQ', 'QQ', 'ER', '3/4', 'QQQ', '4/4', 'QQQQ'].join('\n')
    const catalog = unwrap(parseRhythmCatalog(text))
    expect(catalog.meters['2/4']).toEqual(['QQ', 'ER'])
  })
})

describe('parseRhythmCatalog - real curated catalog at Notes/all-rhythms.txt', () => {
  it('validates the real catalog with all three supported meters present', () => {
    const text = readFileSync(REAL_CATALOG_PATH, 'utf8')
    const catalog = unwrap(parseRhythmCatalog(text))
    expect(catalog.meters['2/4'].length).toBeGreaterThan(0)
    expect(catalog.meters['3/4'].length).toBeGreaterThan(0)
    expect(catalog.meters['4/4'].length).toBeGreaterThan(0)
  })

  it('every pattern in the real catalog sums exactly to its heading measure length', () => {
    const text = readFileSync(REAL_CATALOG_PATH, 'utf8')
    const catalog = unwrap(parseRhythmCatalog(text))
    for (const meter of Object.keys(catalog.meters)) {
      const measureEighths = MEASURE_LENGTHS[meter] * 2
      for (const pattern of catalog.meters[meter]) {
        expect(patternEighthSum(pattern)).toBe(measureEighths)
      }
    }
  })

  it('the real catalog contains no duplicate patterns after packaging', () => {
    const text = readFileSync(REAL_CATALOG_PATH, 'utf8')
    const catalog = unwrap(parseRhythmCatalog(text))
    for (const meter of Object.keys(catalog.meters)) {
      const patterns = catalog.meters[meter]
      expect(new Set(patterns).size).toBe(patterns.length)
    }
  })
})

/**
 * Sum a pattern's tokens in eighth-note units (quarter beats * 2) so the
 * comparison is exact integer arithmetic, never accumulated floats.
 */
const patternEighthSum = (pattern: string): number => {
  let eighths = 0
  for (const token of pattern) {
    eighths += TOKEN_DURATIONS[token] * 2
  }
  return eighths
}
