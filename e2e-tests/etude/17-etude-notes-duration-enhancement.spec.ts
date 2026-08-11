import { expect, test, type APIResponse, type Page } from '@playwright/test'

import { signInUser } from '../support/auth-helpers'
import { testWithDatabase } from '../support/test-helpers'
import { navigateToHome } from '../support/navigation-helpers'
import { TEST_USERS, SERVER_BASE_URL } from '../support/test-data'

const ETUDE_PATH = '/etude'
const ETUDE_SETUP_PATH = '/etude/setup'
const ETUDE_NOTES_PATH = '/etude/notes'

/**
 * The available pitches for C major, octave 4 (C4 through C5), in order.
 */
const C_MAJOR_OCTAVE_4_PITCHES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']

/**
 * Offerable duration tokens for 2/4 (canonical order H, Q, R, E).
 */
const OFFERABLE_2_4 = ['H', 'Q', 'R', 'E']

/**
 * Parse a Set-Cookie header value into the cookie name, value, and attribute
 * map so the tests can assert on individual attributes. Mirrors the helper in
 * 16-etude-notes-duration-selection.spec.ts.
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
 * context, bypassing native HTML constraints. Returns the APIResponse so the
 * caller can assert on status and redirect behavior.
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
 * context. The `action` field selects ordinary save ('save') or Select all
 * ('select-all'). Pitch and duration values are sent as repeated fields.
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
 * Confirm the setup step by submitting a valid setup form via the browser
 * request context, so the notes step is reachable.
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
 * the notes step is reachable.
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
 * Save a duration selection via POST so the next GET /etude/notes renders the
 * stored (narrowed) selection. Used to set up first-paint scenarios.
 */
const saveDurations = async (
  page: Page,
  durations: string[],
  pitches: string[] = ['C4'],
): Promise<void> => {
  const version = await page.getByTestId('workflow-version-field').inputValue()
  const response = await postNotesViaBrowser(page, {
    action: 'save',
    workflowVersion: version,
    pitches,
    durations,
  })
  expect(response.status()).toBe(303)
}

test.describe('Issue 15: duration toggle progressive enhancement (aria behavior)', () => {
  test(
    'after deselecting until a toggle is required, it is marked aria-disabled (not native disabled)',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '2/4' })

      // All four offerable durations are checked by default; none disabled.
      for (const token of OFFERABLE_2_4) {
        await expect(page.getByTestId(`duration-field-${token}`)).toBeChecked()
        await expect(page.getByTestId(`duration-field-${token}`)).not.toHaveAttribute('aria-disabled', 'true')
      }

      // Uncheck H — now {Q, R, E}; nothing is disabled yet.
      await page.getByTestId('duration-field-H').uncheck()
      // Uncheck Q — now {R, E}; E becomes disabled (no pattern uses only R).
      await page.getByTestId('duration-field-Q').uncheck()

      const eToggle = page.getByTestId('duration-field-E')
      const rToggle = page.getByTestId('duration-field-R')

      // E is marked aria-disabled="true" but NOT given the native disabled
      // attribute.
      await expect(eToggle).toHaveAttribute('aria-disabled', 'true')
      await expect(eToggle).not.toHaveAttribute('disabled', '')

      // R is not disabled.
      await expect(rToggle).not.toHaveAttribute('aria-disabled', 'true')
    }),
  )

  test(
    'an aria-disabled toggle remains focusable and in the accessibility tree',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '2/4' })

      // Narrow to {R, E} so E becomes disabled.
      await page.getByTestId('duration-field-H').uncheck()
      await page.getByTestId('duration-field-Q').uncheck()

      const eToggle = page.getByTestId('duration-field-E')
      await expect(eToggle).toHaveAttribute('aria-disabled', 'true')

      // The toggle is focusable via keyboard (Tab to it).
      await eToggle.focus()
      await expect(eToggle).toBeFocused()
    }),
  )

  test(
    'an aria-disabled toggle exposes aria-describedby resolving to visible reason text (not title or colour alone)',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '2/4' })

      // Narrow to {R, E} so E becomes disabled.
      await page.getByTestId('duration-field-H').uncheck()
      await page.getByTestId('duration-field-Q').uncheck()

      const eToggle = page.getByTestId('duration-field-E')
      await expect(eToggle).toHaveAttribute('aria-disabled', 'true')

      // The toggle has aria-describedby pointing to one or more element ids.
      const describedBy = await eToggle.getAttribute('aria-describedby')
      expect(describedBy).toBeTruthy()
      const ids = describedBy!.split(/\s+/).filter((id) => id.length > 0)

      // At least one describedby target is a visible reason element with text.
      let foundVisibleReason = false
      for (const id of ids) {
        const reasonEl = page.locator(`#${id}`)
        const count = await reasonEl.count()
        if (count > 0) {
          const text = (await reasonEl.textContent()) ?? ''
          if (text.trim().length > 0) {
            foundVisibleReason = true
            break
          }
        }
      }
      expect(foundVisibleReason).toBe(true)

      // The reason is not conveyed by a title attribute on the toggle.
      const title = await eToggle.getAttribute('title')
      expect(title).toBeNull()
    }),
  )

  test(
    'the disabled set is correct on first paint before any interaction',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '2/4' })

      // Save a narrow selection {E, R} so the next render has a required
      // toggle. With {E, R}, removing E leaves {R} which has no eligible
      // pattern, so E is disabled on first paint.
      await saveDurations(page, ['E', 'R'])
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)

      // Before any interaction, E is already aria-disabled on first paint.
      const eToggle = page.getByTestId('duration-field-E')
      await expect(eToggle).toHaveAttribute('aria-disabled', 'true')
      await expect(eToggle).toBeChecked()

      // R is not disabled.
      await expect(page.getByTestId('duration-field-R')).not.toHaveAttribute('aria-disabled', 'true')
    }),
  )

  test(
    'a state change is announced through a polite live region',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '2/4' })

      // A polite live region exists.
      const liveRegion = page.getByTestId('duration-live-region')
      await expect(liveRegion).toHaveAttribute('aria-live', 'polite')

      // Narrow to {R, E} so E becomes disabled. The live region should
      // announce the state change.
      await page.getByTestId('duration-field-H').uncheck()
      await page.getByTestId('duration-field-Q').uncheck()

      // The live region now has text content announcing the change.
      await expect(liveRegion).not.toBeEmpty({ timeout: 5000 })
      const liveText = (await liveRegion.textContent()) ?? ''
      expect(liveText.trim().length).toBeGreaterThan(0)
    }),
  )

  test(
    'clicking an aria-disabled toggle does not deselect it (suppressed client-side)',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '2/4' })

      // Narrow to {R, E} so E becomes disabled.
      await page.getByTestId('duration-field-H').uncheck()
      await page.getByTestId('duration-field-Q').uncheck()

      const eToggle = page.getByTestId('duration-field-E')
      await expect(eToggle).toHaveAttribute('aria-disabled', 'true')
      await expect(eToggle).toBeChecked()

      // Attempt to uncheck E — the enhancement suppresses the deselection.
      // Use force: true because Playwright treats aria-disabled as not
      // enabled and won't click without forcing.
      await eToggle.click({ force: true })

      // E is still checked.
      await expect(eToggle).toBeChecked()
    }),
  )

  test(
    're-selecting a previously removed duration clears the disabled state and the live region announces it',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '2/4' })

      // Narrow to {R, E} so E is disabled.
      await page.getByTestId('duration-field-H').uncheck()
      await page.getByTestId('duration-field-Q').uncheck()

      const eToggle = page.getByTestId('duration-field-E')
      await expect(eToggle).toHaveAttribute('aria-disabled', 'true')

      // Re-check Q — now {Q, R, E}; E is no longer disabled.
      await page.getByTestId('duration-field-Q').check()
      await expect(eToggle).not.toHaveAttribute('aria-disabled', 'true')

      // The live region announces the change.
      const liveRegion = page.getByTestId('duration-live-region')
      await expect(liveRegion).not.toBeEmpty({ timeout: 5000 })
    }),
  )

  test(
    'all pitches remain selected by default on the enhanced page',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '2/4' })

      for (const pitch of C_MAJOR_OCTAVE_4_PITCHES) {
        await expect(page.getByTestId(`pitch-field-${pitch}`)).toBeChecked()
      }
    }),
  )
})
