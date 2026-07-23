// ====================================
// Tests for validators.ts password validation
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'
import {
  SignUpFormSchema,
  GatedSignUpFormSchema,
  ResetPasswordFormSchema,
  ChangePasswordFormSchema,
  validateRequest,
} from '../src/lib/validators'

describe('password max length validation', () => {
  const longPassword = 'a'.repeat(129) // 129 characters - exceeds 128 max
  const validPassword = 'validpassword123' // 16 characters - within limits

  describe('SignUpFormSchema', () => {
    it('should reject password longer than 128 characters', () => {
      const [isValid, , error] = validateRequest(
        {
          name: 'Test User',
          email: 'test@example.com',
          password: longPassword,
        },
        SignUpFormSchema,
      )
      expect(isValid).toBe(false)
      expect(error).toContain('Password must be at most 128 characters long')
    })

    it('should accept password of exactly 128 characters', () => {
      const password128 = 'a'.repeat(128)
      const [isValid, , error] = validateRequest(
        {
          name: 'Test User',
          email: 'test@example.com',
          password: password128,
        },
        SignUpFormSchema,
      )
      expect(isValid).toBe(true)
      expect(error).toBeNull()
    })

    it('should accept valid password', () => {
      const [isValid, , error] = validateRequest(
        {
          name: 'Test User',
          email: 'test@example.com',
          password: validPassword,
        },
        SignUpFormSchema,
      )
      expect(isValid).toBe(true)
      expect(error).toBeNull()
    })
  })

  describe('GatedSignUpFormSchema', () => {
    it('should reject password longer than 128 characters', () => {
      const [isValid, , error] = validateRequest(
        {
          code: 'validcode123',
          name: 'Test User',
          email: 'test@example.com',
          password: longPassword,
        },
        GatedSignUpFormSchema,
      )
      expect(isValid).toBe(false)
      expect(error).toContain('Password must be at most 128 characters long')
    })

    it('should accept password of exactly 128 characters', () => {
      const password128 = 'a'.repeat(128)
      const [isValid, , error] = validateRequest(
        {
          code: 'validcode123',
          name: 'Test User',
          email: 'test@example.com',
          password: password128,
        },
        GatedSignUpFormSchema,
      )
      expect(isValid).toBe(true)
      expect(error).toBeNull()
    })
  })

  describe('ResetPasswordFormSchema', () => {
    it('should reject password longer than 128 characters', () => {
      const [isValid, , error] = validateRequest(
        {
          token: 'valid-token',
          password: longPassword,
          confirmPassword: longPassword,
        },
        ResetPasswordFormSchema,
      )
      expect(isValid).toBe(false)
      expect(error).toContain('Password must be at most 128 characters long')
    })

    it('should accept password of exactly 128 characters', () => {
      const password128 = 'a'.repeat(128)
      const [isValid, , error] = validateRequest(
        {
          token: 'valid-token',
          password: password128,
          confirmPassword: password128,
        },
        ResetPasswordFormSchema,
      )
      expect(isValid).toBe(true)
      expect(error).toBeNull()
    })

    it('should accept valid password', () => {
      const [isValid, , error] = validateRequest(
        {
          token: 'valid-token',
          password: validPassword,
          confirmPassword: validPassword,
        },
        ResetPasswordFormSchema,
      )
      expect(isValid).toBe(true)
      expect(error).toBeNull()
    })
  })

  describe('ChangePasswordFormSchema', () => {
    it('should reject new password longer than 128 characters', () => {
      const [isValid, , error] = validateRequest(
        {
          currentPassword: 'currentpass123',
          newPassword: longPassword,
          confirmPassword: longPassword,
        },
        ChangePasswordFormSchema,
      )
      expect(isValid).toBe(false)
      expect(error).toContain('Password must be at most 128 characters long')
    })

    it('should accept new password of exactly 128 characters', () => {
      const password128 = 'a'.repeat(128)
      const [isValid, , error] = validateRequest(
        {
          currentPassword: 'currentpass123',
          newPassword: password128,
          confirmPassword: password128,
        },
        ChangePasswordFormSchema,
      )
      expect(isValid).toBe(true)
      expect(error).toBeNull()
    })

    it('should accept valid new password', () => {
      const [isValid, , error] = validateRequest(
        {
          currentPassword: 'currentpass123',
          newPassword: validPassword,
          confirmPassword: validPassword,
        },
        ChangePasswordFormSchema,
      )
      expect(isValid).toBe(true)
      expect(error).toBeNull()
    })
  })
})
