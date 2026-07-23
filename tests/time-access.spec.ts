// ====================================
// Tests for time-access.ts
// To run this, cd to this directory and type 'bun test'
// ====================================

import { beforeEach, describe, it, expect } from 'bun:test'
import { setTimeout } from 'timers/promises'
import { Context } from 'hono'
import { getCurrentTime, setCurrentDelta, clearCurrentDelta } from '../src/lib/time-access'

const approximatelyEqual = (v1: number, v2: number, epsilon = 0.001) => Math.abs(v1 - v2) < epsilon

interface FakeContext {
  req: {
    raw: {
      headers: {
        get: (name: string) => string | undefined
      }
    }
  }
  header: (name: string, value: string, options?: unknown) => void
}

const makeFakeContext = (): FakeContext => {
  const storage = new Map<string, string>()
  const cookieStorage = {
    get: (name: string): string | undefined => {
      return storage.get(name)
    },
    set: (name: string, value: string): void => {
      storage.set(name, value)
    },
  }

  return {
    req: {
      raw: {
        headers: {
          get: (name: string): string | undefined => {
            if (name === 'Cookie' || name === 'cookie') {
              return cookieStorage.get('Cookie')
            }
            return undefined
          },
        },
      },
    },
    header: (name: string, value: string): void => {
      if (name === 'Set-Cookie') {
        cookieStorage.set('Cookie', value)
      } else {
        throw new Error(`Unknown header ${name}`)
      }
    },
  }
}

describe('getCurrentTime function', () => {
  let c: FakeContext
  beforeEach(() => {
    c = makeFakeContext()
  })

  it('should return the current no-args time when no time has been set', () => {
    expect(
      approximatelyEqual(getCurrentTime(c as unknown as Context).getTime(), new Date().getTime(), 5),
    ).toBe(true)
  })

  it('should return the correct no-args time when a time has been set in the past', () => {
    setCurrentDelta(c as unknown as Context, -50_000)
    expect(
      approximatelyEqual(
        getCurrentTime(c as unknown as Context).getTime(),
        new Date().getTime() - 50_000,
        5,
      ),
    ).toBe(true)
  })

  it('should return the correct no-args time when a time has been set in the future', () => {
    setCurrentDelta(c as unknown as Context, 50_000)
    expect(
      approximatelyEqual(
        getCurrentTime(c as unknown as Context).getTime(),
        new Date().getTime() + 50_000,
        5,
      ),
    ).toBe(true)
  })

  it('should return the correct no-args time with a delay when a time has been set in the past', async () => {
    setCurrentDelta(c as unknown as Context, -50_000)
    await setTimeout(100)
    expect(
      approximatelyEqual(
        getCurrentTime(c as unknown as Context).getTime(),
        new Date().getTime() - 50_000,
        105,
      ),
    ).toBe(true)
  })

  it('should return the correct no-args time with a delay when a time has been set in the future', async () => {
    setCurrentDelta(c as unknown as Context, 50_000)
    await setTimeout(100)
    expect(
      approximatelyEqual(
        getCurrentTime(c as unknown as Context).getTime(),
        new Date().getTime() + 50_000,
        105,
      ),
    ).toBe(true)
  })

  it('should return the correct with-args time based in the past', () => {
    setCurrentDelta(c as unknown as Context, -50_000)
    const futureDate = new Date(new Date().getTime() + 100_000)
    expect(
      approximatelyEqual(
        getCurrentTime(c as unknown as Context, futureDate).getTime(),
        new Date().getTime() + 50_000,
        5,
      ),
    ).toBe(true)
  })

  it('should return the correct with-args time based in the future', () => {
    setCurrentDelta(c as unknown as Context, 50_000)
    const futureDate = new Date(new Date().getTime() + 100_000)
    expect(
      approximatelyEqual(
        getCurrentTime(c as unknown as Context, futureDate).getTime(),
        new Date().getTime() + 150_000,
        5,
      ),
    ).toBe(true)
  })

  it('should allow resetting the time properly', () => {
    setCurrentDelta(c as unknown as Context, -50_000)
    clearCurrentDelta(c as unknown as Context)
    expect(
      approximatelyEqual(getCurrentTime(c as unknown as Context).getTime(), new Date().getTime(), 5),
    ).toBe(true)
  })
})
