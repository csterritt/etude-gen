// ====================================
// Tests for url-validation.ts
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'
import { validateCallbackUrl } from '../src/lib/url-validation'

const TEST_ORIGIN = 'https://example.com'
const DEFAULT_URL = '/auth/sign-in'

describe('validateCallbackUrl function', () => {
  it('should return default URL when callbackUrl is undefined', () => {
    const result = validateCallbackUrl(undefined, TEST_ORIGIN)
    expect(result).toBe(DEFAULT_URL)
  })

  it('should return default URL when callbackUrl is empty string', () => {
    const result = validateCallbackUrl('', TEST_ORIGIN)
    expect(result).toBe(DEFAULT_URL)
  })

  it('should allow simple relative paths', () => {
    const result = validateCallbackUrl('/dashboard', TEST_ORIGIN)
    expect(result).toBe('/dashboard')
  })

  it('should allow relative paths with query strings', () => {
    const result = validateCallbackUrl('/profile?tab=settings', TEST_ORIGIN)
    expect(result).toBe('/profile?tab=settings')
  })

  it('should reject protocol-relative URLs (//evil.com)', () => {
    const result = validateCallbackUrl('//evil.com/path', TEST_ORIGIN)
    expect(result).toBe(DEFAULT_URL)
  })

  it('should reject external absolute URLs', () => {
    const result = validateCallbackUrl('https://evil.com/path', TEST_ORIGIN)
    expect(result).toBe(DEFAULT_URL)
  })

  it('should allow same-origin absolute URLs and return pathname', () => {
    const result = validateCallbackUrl('https://example.com/dashboard', TEST_ORIGIN)
    expect(result).toBe('/dashboard')
  })

  it('should reject URLs with backslashes', () => {
    const result = validateCallbackUrl('/path\\to\\evil', TEST_ORIGIN)
    expect(result).toBe(DEFAULT_URL)
  })

  it('should handle strings without leading slash via URL resolution (same-origin)', () => {
    // URL constructor resolves 'somepath' relative to origin, resulting in same-origin path
    // This is safe behavior - it stays on the same origin
    const result = validateCallbackUrl('somepath', TEST_ORIGIN)
    expect(result).toBe('/somepath')
  })

  it('should reject javascript: URLs', () => {
    const result = validateCallbackUrl('javascript:alert(1)', TEST_ORIGIN)
    expect(result).toBe(DEFAULT_URL)
  })

  it('should reject data: URLs', () => {
    const result = validateCallbackUrl('data:text/html,<script>', TEST_ORIGIN)
    expect(result).toBe(DEFAULT_URL)
  })

  it('should preserve hash fragments in relative URLs', () => {
    const result = validateCallbackUrl('/page#section', TEST_ORIGIN)
    expect(result).toBe('/page#section')
  })

  it('should preserve query and hash in same-origin absolute URLs', () => {
    const result = validateCallbackUrl('https://example.com/page?foo=bar#section', TEST_ORIGIN)
    expect(result).toBe('/page?foo=bar#section')
  })
})
