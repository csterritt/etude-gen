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
 * context, bypassing native HTML constraints.
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
 * GET the test-only aggregate-state inspection route.
 */
const getAggregateState = async (page: Page): Promise<Record<string, unknown>> => {
  const response = await page.request.get(`${SERVER_BASE_URL}/test/etude/aggregate-state`, {
    failOnStatusCode: false,
  })
  expect(response.status()).toBe(200)
  return (await response.json()) as Record<string, unknown>
}

test.describe('Issue 15: Select all enhancement, init failure, and scripted bypass', () => {
  test(
    'Select all with scripting selects every pitch without a page reload',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '2/4' })

      // Uncheck a few pitches first so Select all has visible work to do.
      await page.getByTestId('pitch-field-C4').uncheck()
      await page.getByTestId('pitch-field-D4').uncheck()
      await expect(page.getByTestId('pitch-field-C4')).not.toBeChecked()

 // Set a window marker before clicking — if the page reloads, the marker
      // is lost. This distinguishes the enhancement's in-place behavior from
      // the server-side round trip.
      await page.evaluate(() => {
        (window as any).__testSelectAllMarker = true
      })

      // Click Select all — the enhancement handles it without a server round
      // trip.
      await page.getByTestId('notes-select-all-action').click()

      // The page did not reload: the window marker is still present.
      const markerStillPresent = await page.evaluate(() => (window as any).__testSelectAllMarker === true)
      expect(markerStillPresent).toBe(true)

      // Every pitch is now checked, in place, without a reload.
      for (const pitch of C_MAJOR_OCTAVE_4_PITCHES) {
        await expect(page.getByTestId(`pitch-field-${pitch}`)).toBeChecked()
      }
    }),
  )

  test(
    'a simulated initialization failure (corrupted data) leaves every duration toggle fully usable',
    testWithDatabase(async ({ page }) => {
      // Intercept the GET /etude/notes HTML response and corrupt the
      // embedded rhythm data block so the enhancement's initialization
      // fails when it tries to JSON.parse the data.
      await page.route('**/etude/notes', async (route) => {
        const response = await route.fetch()
        const html = await response.text()
        const corrupted = html.replace(
          /(<script type="application\/json" id="notes-rhythm-data"[^>]*>)([\s\S]*?)(<\/script>)/,
          '$1not valid json$3',
        )
        await route.fulfill({
          status: response.status(),
          headers: response.headers(),
          body: corrupted,
        })
      })

      await reachNotesStep(page, { meter: '2/4' })

      // Narrow the selection to {R, E} via POST so the page would normally
      // show E as disabled on the next render.
      const version = await page.getByTestId('workflow-version-field').inputValue()
      const saveResponse = await postNotesViaBrowser(page, {
        action: 'save',
        workflowVersion: version,
        pitches: ['C4'],
        durations: ['E', 'R'],
      })
      expect(saveResponse.status()).toBe(303)

      // Reload the notes page; the enhancement fails to initialize because
      // the data block is corrupted.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)

      // Every duration toggle is fully usable — none carry aria-disabled.
      for (const token of OFFERABLE_2_4) {
        const toggle = page.getByTestId(`duration-field-${token}`)
        await expect(toggle).not.toHaveAttribute('aria-disabled', 'true')
        await expect(toggle).not.toHaveAttribute('disabled', '')
      }

      // E (which would normally be disabled with {R, E}) can be unchecked.
      const eToggle = page.getByTestId('duration-field-E')
      await expect(eToggle).toBeChecked()
      await eToggle.uncheck()
      await expect(eToggle).not.toBeChecked()
    }),
  )

  test(
    'a simulated initialization failure (script blocked) leaves every duration toggle fully usable',
    testWithDatabase(async ({ page }) => {
      // Block the enhancement script entirely so it never loads.
      await page.route('**/notes-enhancement.js', (route) =>
        route.fulfill({ status: 404, body: 'not found' }),
      )

      await reachNotesStep(page, { meter: '2/4' })

      // Narrow the selection to {R, E} via POST.
      const version = await page.getByTestId('workflow-version-field').inputValue()
      const saveResponse = await postNotesViaBrowser(page, {
        action: 'save',
        workflowVersion: version,
        pitches: ['C4'],
        durations: ['E', 'R'],
      })
      expect(saveResponse.status()).toBe(303)

      // Reload; the enhancement script is blocked.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)

      // Every duration toggle is fully usable.
      for (const token of OFFERABLE_2_4) {
        const toggle = page.getByTestId(`duration-field-${token}`)
        await expect(toggle).not.toHaveAttribute('aria-disabled', 'true')
      }
    }),
  )

  test(
    'a scripted bypass that re-enables a disabled toggle and submits an impossible set still hits the server rejection',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '2/4' })

      // Narrow to {R, E} so E is disabled.
      await page.getByTestId('duration-field-H').uncheck()
      await page.getByTestId('duration-field-Q').uncheck()

      const eToggle = page.getByTestId('duration-field-E')
      await expect(eToggle).toHaveAttribute('aria-disabled', 'true')

      // Scripted bypass: forcibly remove aria-disabled, uncheck E, and submit
      // the impossible set {R} directly via the form.
      await page.evaluate(() => {
        const el = document.getElementById('duration-field-E') as HTMLInputElement | null
        if (el) {
          el.removeAttribute('aria-disabled')
          el.checked = false
        }
      })

      // Submit {R} (impossible for 2/4) via the browser request context.
      const version = await page.getByTestId('workflow-version-field').inputValue()
      const response = await postNotesViaBrowser(page, {
        action: 'save',
        workflowVersion: version,
        pitches: ['C4'],
        durations: ['R'],
      })
      expect(response.status()).toBe(303)

      // Capture the nonce cookie and navigate to see the redisplayed error.
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

      // The server rejection from Issue 14 is displayed.
      const error = page.getByTestId('durations-error')
      await expect(error).toBeVisible()
      await expect(error).toContainText('duration')
      await expect(error).toContainText('2/4')

      // Nothing was persisted.
      const state = await getAggregateState(page)
      expect(state['selectedDurations']).toBeNull()
    }),
  )
})
