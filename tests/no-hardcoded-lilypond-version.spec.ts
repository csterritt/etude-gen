// ====================================
// Tests: no hard-coded LilyPond version string in application source.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * A LilyPond version literal looks like `2.x.y` (or `2.x.y-1`), typically
 * embedded as a string constant. We scan for these near the word "lilypond"
 * (case-insensitive) to avoid flagging unrelated numeric strings.
 */
const LILYPOND_VERSION_PATTERN = /2\.\d+\.\d+(?:-\d+)?/gi
const LILYPOND_CONTEXT_PATTERN = /lilypond/i

/**
 * Recursively collect all source files under a directory, excluding
 * node_modules, tests, and non-source extensions.
 */
const collectSourceFiles = (dir: string): string[] => {
  const files: string[] = []
  const entries = readdirSync(dir)
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist') {
      continue
    }
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(fullPath))
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      files.push(fullPath)
    }
  }
  return files
}

describe('no hard-coded LilyPond version string in application source', () => {
  it('should not embed a permanent LilyPond version in src/ application source', () => {
    const srcDir = join(import.meta.dir, '..', 'src')
    const files = collectSourceFiles(srcDir)
    const offenders: string[] = []
    for (const file of files) {
      const content = readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Skip lines that are comments only
        const trimmed = line.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          continue
        }
        if (LILYPOND_VERSION_PATTERN.test(line) && LILYPOND_CONTEXT_PATTERN.test(line)) {
          offenders.push(`${relative(process.cwd(), file)}:${i + 1}: ${line.trim()}`)
        }
        LILYPOND_VERSION_PATTERN.lastIndex = 0
      }
    }
    expect(offenders).toEqual([])
  })
})
