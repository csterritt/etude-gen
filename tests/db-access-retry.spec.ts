// ====================================
// Tests for db-access.ts retry behavior
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'
import Result from 'true-myth/result'

import { withRetry } from '../src/lib/db-access'
import { STANDARD_RETRY_OPTIONS } from '../src/constants'

const unwrap = <T, E>(result: Result<T, E>): T => {
  if (!result.isOk) {
    throw new Error(`Expected Ok, got Err: ${result.error}`)
  }
  return result.value
}

const unwrapErr = <T, E>(result: Result<T, E>): E => {
  if (!result.isErr) {
    throw new Error(`Expected Err, got Ok: ${result.value}`)
  }
  return result.error
}

describe('withRetry function', () => {
  it('should return success on first try when operation succeeds', async () => {
    let callCount = 0
    const operation = async (): Promise<Result<string, Error>> => {
      callCount++
      return Result.ok('success')
    }

    const result = await withRetry('test', operation)

    expect(unwrap(result)).toBe('success')
    expect(callCount).toBe(1)
  })

  it('should retry on Result.err and eventually succeed', async () => {
    let callCount = 0
    const operation = async (): Promise<Result<string, Error>> => {
      callCount++
      if (callCount < 3) {
        return Result.err(new Error('transient failure'))
      }
      return Result.ok('success after retries')
    }

    const result = await withRetry('test', operation)

    expect(unwrap(result)).toBe('success after retries')
    expect(callCount).toBe(3)
  })

  it('should return Result.err after exhausting all retries', async () => {
    let callCount = 0
    const operation = async (): Promise<Result<string, Error>> => {
      callCount++
      return Result.err(new Error('persistent failure'))
    }

    const result = await withRetry('test', operation)

    expect(unwrapErr(result).message).toBe('persistent failure')
    expect(callCount).toBe(STANDARD_RETRY_OPTIONS.retries + 1) // 1 initial + N retries
  })

  it('should retry on thrown exceptions', async () => {
    let callCount = 0
    const operation = async (): Promise<Result<string, Error>> => {
      callCount++
      if (callCount < 2) {
        throw new Error('thrown error')
      }
      return Result.ok('recovered')
    }

    const result = await withRetry('test', operation)

    expect(unwrap(result)).toBe('recovered')
    expect(callCount).toBe(2)
  })

  it('should preserve the original error after retries exhaust', async () => {
    const originalError = new Error('original error message')
    const operation = async (): Promise<Result<string, Error>> => {
      return Result.err(originalError)
    }

    const result = await withRetry('test', operation)

    expect(unwrapErr(result)).toBe(originalError)
  })
})
