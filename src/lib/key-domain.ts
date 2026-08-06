/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Key domain catalog and pitch derivation.
 *
 * Authoritative source for the supported musical keys and their diatonic
 * pitch spellings. The setup validator and the setup form depend on this
 * module so the route never trusts a submitted key and the form always
 * displays the key signature's conventional spelling.
 *
 * The supported domain is the eighteen keys listed in the PRD's "Supported
 * musical domain" section: nine major keys (C, G, D, A, E, F, B-flat,
 * E-flat, A-flat) and nine natural-minor keys (A, E, B, F-sharp, C-sharp,
 * D, G, C, F). No supported key has more than four sharps or flats, so the
 * student never sees a key signature with more than four accidentals.
 *
 * Pitch spellings come from a static lookup table keyed by the supported
 * key string, so flat keys spell flats as flats and sharp keys spell
 * sharps as sharps with no enharmonic duplicates. Natural-minor keys use
 * the natural minor scale (flat third, flat sixth, flat seventh relative
 * to the relative major), never harmonic or melodic minor.
 * @module lib/key-domain
 */
import Result from 'true-myth/result'

/**
 * Supported major keys for v1, per the PRD. Ordered by accidental count
 * from zero to four so the catalog reads naturally.
 */
const SUPPORTED_MAJOR_KEYS = [
  'C major',
  'G major',
  'D major',
  'A major',
  'E major',
  'F major',
  'B-flat major',
  'E-flat major',
  'A-flat major',
] as const

/**
 * Supported natural-minor keys for v1, per the PRD. Each uses the natural
 * minor scale. Ordered by accidental count from zero to four.
 */
const SUPPORTED_MINOR_KEYS = [
  'A minor',
  'E minor',
  'B minor',
  'F-sharp minor',
  'C-sharp minor',
  'D minor',
  'G minor',
  'C minor',
  'F minor',
] as const

/**
 * The eighteen supported keys as a readonly array. The setup form iterates
 * this to render its key control and the setup validator membership-tests
 * against it.
 */
export const SUPPORTED_KEYS: readonly string[] = [
  ...SUPPORTED_MAJOR_KEYS,
  ...SUPPORTED_MINOR_KEYS,
]

/**
 * Maximum number of accidentals (sharps or flats) in any supported key
 * signature. No supported key exceeds this cap.
 */
export const MAX_ACCIDENTALS = 4

/**
 * Typed validation failure for a submitted key. The shape mirrors the
 * setup validator's field-addressable failures so the route can wire a
 * rejection to the key control uniformly.
 */
export interface KeyValidationFailure {
  field: 'key'
  reason: string
}

const KEY_REASON = `Key must be one of the eighteen supported keys (no more than four accidentals).`

/**
 * Static lookup table of the seven diatonic pitch names for every supported
 * key, in scale order, using the key signature's conventional spelling.
 * Flat keys spell flats as flats, sharp keys spell sharps as sharps, and
 * no enharmonic duplicates appear. Natural-minor keys use the natural
 * minor scale.
 */
const KEY_PITCHES: Record<string, string[]> = {
  'C major': ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  'G major': ['G', 'A', 'B', 'C', 'D', 'E', 'F-sharp'],
  'D major': ['D', 'E', 'F-sharp', 'G', 'A', 'B', 'C-sharp'],
  'A major': ['A', 'B', 'C-sharp', 'D', 'E', 'F-sharp', 'G-sharp'],
  'E major': ['E', 'F-sharp', 'G-sharp', 'A', 'B', 'C-sharp', 'D-sharp'],
  'F major': ['F', 'G', 'A', 'B-flat', 'C', 'D', 'E'],
  'B-flat major': ['B-flat', 'C', 'D', 'E-flat', 'F', 'G', 'A'],
  'E-flat major': ['E-flat', 'F', 'G', 'A-flat', 'B-flat', 'C', 'D'],
  'A-flat major': ['A-flat', 'B-flat', 'C', 'D-flat', 'E-flat', 'F', 'G'],
  'A minor': ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
  'E minor': ['E', 'F-sharp', 'G', 'A', 'B', 'C', 'D'],
  'B minor': ['B', 'C-sharp', 'D', 'E', 'F-sharp', 'G', 'A'],
  'F-sharp minor': ['F-sharp', 'G-sharp', 'A', 'B', 'C-sharp', 'D', 'E'],
  'C-sharp minor': ['C-sharp', 'D-sharp', 'E', 'F-sharp', 'G-sharp', 'A', 'B'],
  'D minor': ['D', 'E', 'F', 'G', 'A', 'B-flat', 'C'],
  'G minor': ['G', 'A', 'B-flat', 'C', 'D', 'E-flat', 'F'],
  'C minor': ['C', 'D', 'E-flat', 'F', 'G', 'A-flat', 'B-flat'],
  'F minor': ['F', 'G', 'A-flat', 'B-flat', 'C', 'D-flat', 'E-flat'],
}

/**
 * Validate a submitted key. Accepts exactly one of the supported keys
 * (after trimming) and rejects anything else — an empty string, null,
 * undefined, a wrong type, an unsupported key, or an over-four-accidental
 * key — returning a typed failure. Never coerces an invalid or empty key
 * into a default.
 * @param value - Untrusted submitted key value
 * @returns Result<string, KeyValidationFailure>
 */
export const validateKey = (value: unknown): Result<string, KeyValidationFailure> => {
  if (typeof value !== 'string') {
    return Result.err({ field: 'key', reason: KEY_REASON })
  }
  const trimmed = value.trim()
  if (trimmed === '') {
    return Result.err({ field: 'key', reason: KEY_REASON })
  }
  if (!SUPPORTED_KEYS.includes(trimmed)) {
    return Result.err({ field: 'key', reason: KEY_REASON })
  }
  return Result.ok(trimmed)
}

/**
 * Derive the seven diatonic pitch names for a supported key, in scale
 * order, using the key signature's conventional spelling. The caller is
 * responsible for passing a supported key (typically one already accepted
 * by `validateKey`); an unsupported key throws since it indicates a
 * programmer error rather than a user submission.
 * @param key - A supported key string
 * @returns The seven diatonic pitch names in scale order
 */
export const deriveKeyPitches = (key: string): string[] => {
  const pitches = KEY_PITCHES[key]
  if (pitches === undefined) {
    throw new Error(`deriveKeyPitches: unsupported key ${key}`)
  }
  // Return a defensive copy so callers cannot mutate the lookup table.
  return [...pitches]
}
