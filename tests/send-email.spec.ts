// ====================================
// Tests for send-email.ts
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'
import { sendOtpToUserViaEmail } from '../src/lib/send-email'
import { isOk } from 'true-myth/result'
import type { Bindings } from '../src/local-types'

interface CapturedEmailArgs {
  env: Bindings
  fromAddress: string
  toAddress: string
  subject: string
  content: string
}

const fakeEnv = {} as unknown as Bindings

describe('sendOtpToUserViaEmail', () => {
  it('sends email with correct content and OTP code', async () => {
    // Mock data
    const testEmail = 'test@example.com'
    const testOtp = '123456'
    let capturedArgs: CapturedEmailArgs | null = null

    // Create mock email agent that captures arguments and returns successfully
    const mockEmailAgent = async (
      env: Bindings,
      fromAddress: string,
      toAddress: string,
      subject: string,
      content: string,
    ): Promise<void> => {
      capturedArgs = { env, fromAddress, toAddress, subject, content }
      return Promise.resolve()
    }

    // Call the function with our mock
    const result = await sendOtpToUserViaEmail(fakeEnv, testEmail, testOtp, mockEmailAgent)

    // Verify result is successful
    expect(isOk(result)).toBe(true)

    // Verify email was "sent" with correct parameters
    // TypeScript doesn't see the callback assignment, so we assert after runtime check
    expect(capturedArgs !== null).toBe(true)
    const args = capturedArgs as unknown as CapturedEmailArgs
    expect(args.fromAddress).toBe('noreply@cls.cloud')
    expect(args.toAddress).toBe(testEmail)
    expect(args.subject).toBe('Your Mini-Auth Verification Code')

    // Verify email content contains the OTP
    expect(args.content).toContain(`<strong>${testOtp}</strong>`)
    expect(args.content).toContain('<h1>Verification Code</h1>')
    expect(args.content).toContain('This code will expire in 15 minutes')
  })

  it('handles email sending failure', async () => {
    // Mock data
    const testEmail = 'test@example.com'
    const testOtp = '123456'

    // Create mock email agent that fails
    const mockFailingEmailAgent = async (
      _env: Bindings,
      _fromAddress: string,
      _toAddress: string,
      _subject: string,
      _content: string,
    ): Promise<void> => {
      throw new Error('Email sending failed')
    }

    // Call the function with our failing mock
    const result = await sendOtpToUserViaEmail(fakeEnv, testEmail, testOtp, mockFailingEmailAgent)

    // Verify result is an error
    expect(result.isErr).toBe(true)
    if (result.isErr) {
      expect(result.error.message).toContain('Email sending failed')
    }
  })
})
