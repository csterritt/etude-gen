import { expect, test, type APIResponse, type Page } from '@playwright/test'

import { signInUser } from '../support/auth-helpers'
import { testWithDatabase } from '../support/test-helpers'
import { navigateToHome } from '../support/navigation-helpers'
import { TEST_USERS, SERVER_BASE_URL } from '../support/test-data'

const ETUDE_PATH = '/etude'
const ETUDE_SETUP_PATH = '/etude/setup'
const ETUDE_NOTES_PATH = '/etude/notes'

/**
 * Offerable duration tokens for 2/4 (canonical order H, Q, R, E).
 */
const OFFERABLE_2_4 = ['H', 'Q', 'R', 'E']

/**
 * The available pitches for C major, octave 4 (C4 through C5), in order.
 */
const C_MAJOR_OCTAVE_4_PITCHES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']

/**
 * Parse a Set-Cookie header value into the cookie name, value, and attribute
 * map. Mirrors the helper in 16-etude-notes-duration-selection.spec.ts.
 */
const parseSetCookie = (header: string): { name: string; value: string; attrs: Record<string, string> } => {
  const parts = header.split(';').map((p) => p.trim())
  const first = parts[0] ?? ''
  const eq = first.indexOf('=')
  const name = eq >= 0 ? first.slice(0, eq) : first
  const value = eq >= 0 ? first.slice(eq + 1) : first
  const attrs: Record<string, string> = {}
  for (let i = 1; i < parts.length; i += 1) {
    const part = parts[i] ?? ''
    const aeq = part.indexOf('=')
    if (aeq >= 0) {
      attrs[part.slice(0, aeq).toLowerCase()] = part.slice(aeq + 1)
    } else {
      attrs[part.toLowerCase()] = 'true'
    }
  }
  return { name, value, attrs }
}

/**
 * Submit a multipart POST to /etude/setup using the authenticated browser
 * context.
 */
const postSetupViaBrowser = async (
  page: Page,
  body: Record<string, string>,
): Promise<APIResponse> => {
  return page.request.post(`${SERVER_BASE_URL}${ETUDE_SETUP_PATH}`, {
    multipart: { ...body },
    maxRedirects: 0,
    failOnStatusCode: false,
    headers: { Origin: SERVER_BASE_URL },
  })
}

/**
 * Submit a multipart POST to /etude/notes using the authenticated browser
 * context.
 */
const postNotesViaBrowser = async (
  page: Page,
  body: Record<string, string | string[]>,
): Promise<APIResponse> => {
  const formData = new FormData()
  for (const [key, value] of Object.entries(body)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        formData.append(key, v)
      }
    } else {
      formData.append(key, value as string)
    }
  }
  return page.request.post(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`, {
    multipart: formData as any,
    maxRedirects: 0,
    failOnStatusCode: false,
    headers: { Origin: SERVER_BASE_URL },
  })
}

/**
 * Confirm the setup step by submitting a valid setup form.
 */
const confirmSetup = async (
  page: Page,
  overrides: Record<string, string> = {},
): Promise<void> => {
  const versionBefore = await page.getByTestId('workflow-version-field').inputValue()
  const response = await postSetupViaBrowser(page, {
    measures: '16',
    meter: '2/4',
    hands: 'right',
    key: 'C major',
    octaves: '4',
    workflowVersion: versionBefore,
    ...overrides,
  })
  expect(response.status()).toBe(303)
}

/**
 * Sign in, create the aggregate, and confirm setup with the given meter so
 * the notes step is reachable. Uses the page's request context for POSTs so
 * it works even with JavaScript disabled.
 */
const reachNotesStep = async (
  page: Page,
  setupOverrides: Record<string, string> = {},
): Promise<void> => {
  await navigateToHome(page)
  await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
  await page.goto(ETUDE_PATH)
  expect(page.url()).toContain(ETUDE_SETUP_PATH)

  await confirmSetup(page, setupOverrides)
  await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
  expect(page.url()).toContain(ETUDE_NOTES_PATH)
}

/**
 * GET the test-only aggregate-state inspection route.
 */
const getAggregateState = async (page: Page): Promise<Record<string, unknown>> => {
  const response = await page.request.get(`${SERVER_BASE_URL}/test/etude/aggregate-state`, {
    failOnStatusCode: false,
  })
  expect(response.status()).toBe(200)
  return (await response.json()) as Record<string, unknown>
}

// All tests in this describe block run with JavaScript disabled, locking in
// the guarantee that the enhancement is strictly additive and the no-script
// path works unchanged through the server.
test.describe('Issue 15: no-script path unchanged (JavaScript disabled)', () => {
  test.use({ javaScriptEnabled: false })

  test(
    'every duration toggle is usable without scripting (no aria-disabled, no native disabled)',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '2/4' })

      for (const token of OFFERABLE_2_4) {
        const toggle = page.getByTestId(`duration-field-${token}`)
        await expect(toggle).toBeVisible()
        await expect(toggle).not.toHaveAttribute('aria-disabled', 'true')
        await expect(toggle).not.toHaveAttribute('disabled', '')
      }
    }),
  )

  test(
    'deselecting a duration and submitting works through the server without scripting',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '2/4' })

      // All offerable durations are checked by default.
      for (const token of OFFERABLE_2_4) {
        await expect(page.getByTestId(`duration-field-${token}`)).toBeChecked()
      }

      // Submit a valid narrowed set {Q, E} via the real form.
      // Uncheck H and R, then click Save.
      await page.getByTestId('duration-field-H').uncheck()
      await page.getByTestId('duration-field-R').uncheck()
      await page.getByTestId('notes-save-action').click()
      await page.waitForLoadState('networkidle')

      // Reload: the stored selection {Q, E} is shown.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
      await expect(page.getByTestId('duration-field-Q')).toBeChecked()
      await expect(page.getByTestId('duration-field-E')).toBeChecked()
      await expect(page.getByTestId('duration-field-H')).not.toBeChecked()
      await expect(page.getByTestId('duration-field-R')).not.toBeChecked()

      const state = await getAggregateState(page)
      expect(state['selectedDurations']).toBe('Q,E')
    }),
  )

  test(
    'an impossible duration set is rejected by the server with corrective guidance without scripting',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '2/4' })

      // POST an impossible set {R} directly — the server rejects it.
      const version = await page.getByTestId('workflow-version-field').inputValue()
      const response = await postNotesViaBrowser(page, {
        action: 'save',
        workflowVersion: version,
        pitches: ['C4'],
        durations: ['R'],
      })
      expect(response.status()).toBe(303)

      // Capture the nonce cookie and navigate to see the error.
      const setCookie = response.headers()['set-cookie']
      if (setCookie) {
        const parsed = parseSetCookie(setCookie)
        if (parsed.name === 'VALIDATION_STATE_NONCE' && parsed.value.length > 0) {
          await page.context().addCookies([
            {
              name: parsed.name,
              value: parsed.value,
              domain: 'localhost',
              path: '/etude',
            },
          ])
        }
      }

      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)

      // The server rejection provides the corrective guidance.
      const error = page.getByTestId('durations-error')
      await expect(error).toBeVisible()
      await expect(error).toContainText('duration')
      await expect(error).toContainText('2/4')
      await expect(error).toContainText('the half duration')

      // Nothing was persisted.
      const state = await getAggregateState(page)
      expect(state['selectedDurations']).toBeNull()
    }),
  )

  test(
    'Select all works through the server without scripting (persists the full pitch set)',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '2/4' })

      // Uncheck a pitch first so Select all has work to do.
      await page.getByTestId('pitch-field-C4').uncheck()
      await expect(page.getByTestId('pitch-field-C4')).not.toBeChecked()

      // Click Select all — this submits to the server (no scripting).
      await page.getByTestId('notes-select-all-action').click()
      await page.waitForLoadState('networkidle')

      // Reload: all pitches are selected.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
      for (const pitch of C_MAJOR_OCTAVE_4_PITCHES) {
        await expect(page.getByTestId(`pitch-field-${pitch}`)).toBeChecked()
      }
    }),
  )
})
