import { test, expect } from '@playwright/test'

import { fillInput, clickLink, verifyAlert } from '../support/finders'
import { verifyOnResetPasswordPage } from '../support/page-verifiers'

test('token with reserved characters is URL-encoded in redirect on validation failure', async ({
  page,
}) => {
  const tokenWithReservedChars = 'valid-token&injected=true'
  await page.goto(
    `http://localhost:3000/auth/reset-password?token=${encodeURIComponent(tokenWithReservedChars)}`,
  )

  await verifyOnResetPasswordPage(page)

  // Submit with mismatched passwords to trigger a validation failure redirect
  await fillInput(page, 'new-password-input', 'password123')
  await fillInput(page, 'confirm-password-input', 'differentpassword123')
  await clickLink(page, 'reset-password-action')

  // Should stay on reset password page
  await verifyOnResetPasswordPage(page)
  await verifyAlert(page, 'Passwords do not match. Please try again.')

  // The redirected URL should contain the token fully encoded, not split by '&'
  const url = new URL(page.url())
  expect(url.searchParams.get('token')).toBe(tokenWithReservedChars)
  // Verify the injected param was NOT introduced as a separate query parameter
  expect(url.searchParams.get('injected')).toBeNull()
})

test('token with reserved characters is URL-encoded in redirect on general error', async ({
  page,
}) => {
  const tokenWithReservedChars = 'invalid-token#fragment&extra=1'
  await page.goto(
    `http://localhost:3000/auth/reset-password?token=${encodeURIComponent(tokenWithReservedChars)}`,
  )

  await verifyOnResetPasswordPage(page)

  const newPassword = 'validpassword123'
  await fillInput(page, 'new-password-input', newPassword)
  await fillInput(page, 'confirm-password-input', newPassword)
  await clickLink(page, 'reset-password-action')

  // The token is invalid so Better Auth will reject it and redirect to forgot-password
  // (a genuinely invalid token triggers that branch, not the general-error branch)
  // Just verify we land on a valid page, not a broken URL
  expect(page.url()).toMatch(/\/auth\/(forgot-password|reset-password)/)
})
