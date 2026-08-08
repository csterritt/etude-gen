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
 * Used to assert the default all-selected state and the Select all behavior.
 */
const C_MAJOR_OCTAVE_4_PITCHES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']

/**
 * A valid duration set for the 4/4 meter (the default meter these pitch-only
 * tests confirm). Kept small so the raw-request multipart helper stays under
 * the test harness's field limit while still being an eligible 4/4 set. Issue
 * 14 made the notes step coherent: the ordinary save requires both halves.
 */
const FOUR_FOUR_DURATIONS = ['Q', 'E']

/**
 * Parse a Set-Cookie header value into the cookie name, value, and attribute
 * map so the tests can assert on individual attributes. Mirrors the helper in
 * 11-etude-setup-error-summary.spec.ts.
 */
const parseSetCookie = (header: string): { name: string; value: string; attrs: Record<string, string> } => {
  const parts = header.split(';').map((p) => p.trim())
  const first = parts[0] ?? ''
  const eq = first.indexOf('=')
  const name = eq >= 0 ? first.slice(0, eq) : first
  const value = eq >= 0 ? first.slice(eq + 1) : ''
  const attrs: Record<string, string> = {}
  for (let i = 1; i < parts.length; i++) {
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
 * ('select-all'). Pitch values are sent as repeated `pitches` fields.
 */
const postNotesViaBrowser = async (
  page: Page,
  body: Record<string, string | string[]>,
): Promise<APIResponse> => {
  // Build multipart from the body, expanding array values into repeated fields.
  const multipart: Record<string, string> = {}
  for (const [key, value] of Object.entries(body)) {
    if (Array.isArray(value)) {
      // Playwright multipart does not support repeated fields directly via the
      // object form, so we use the FormData approach via the request API.
      continue
    }
    multipart[key] = value as string
  }
  // Use a FormData payload to support repeated `pitches` fields.
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
 * Submit an invalid notes form via the browser's request context, capture the
 * nonce cookie from the 303 Set-Cookie header, and add it to the browser
 * context's cookie jar so the subsequent GET sends it.
 */
const submitInvalidNotesAndCaptureNonce = async (
  page: Page,
  body: Record<string, string | string[]>,
): Promise<APIResponse> => {
  const response = await postNotesViaBrowser(page, body)
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
  return response
}

/**
 * GET the test-only aggregate-state inspection route. Returns the JSON
 * representation of the owner's aggregate.
 */
const getAggregateState = async (page: Page): Promise<Record<string, unknown>> => {
  const response = await page.request.get(`${SERVER_BASE_URL}/test/etude/aggregate-state`, {
    failOnStatusCode: false,
  })
  expect(response.status()).toBe(200)
  return (await response.json()) as Record<string, unknown>
}

/**
 * Confirm the setup step by submitting a valid setup form via the browser
 * request context, so the notes step is reachable. Uses a non-default measure
 * count to force a write (the identical-resubmit short-circuit would skip the
 * write if all five fields matched the stored defaults).
 */
const confirmSetup = async (
  page: Page,
  overrides: Record<string, string> = {},
): Promise<void> => {
  const versionBefore = await page.getByTestId('workflow-version-field').inputValue()
  const response = await postSetupViaBrowser(page, {
    measures: '16',
    meter: '4/4',
    hands: 'right',
    key: 'C major',
    octaves: '4',
    workflowVersion: versionBefore,
    ...overrides,
  })
  expect(response.status()).toBe(303)
}

test.describe('Issue 13: notes step pitch selection', () => {
  test(
    'a newly derived notes step has every available pitch selected by default',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      await confirmSetup(page)
      // Navigate to the notes step.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
      expect(page.url()).toContain(ETUDE_NOTES_PATH)

      // Every available pitch checkbox is checked.
      for (const pitch of C_MAJOR_OCTAVE_4_PITCHES) {
        const checkbox = page.getByTestId(`pitch-field-${pitch}`)
        await expect(checkbox).toBeVisible()
        await expect(checkbox).toBeChecked()
      }
    }),
  )

  test(
    'Select all without scripting restores the full available pitch set',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      await confirmSetup(page)
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)

      // Deselect several pitches via the form (uncheck them).
      for (const pitch of ['E4', 'F4', 'G4']) {
        await page.getByTestId(`pitch-field-${pitch}`).uncheck()
      }

      // Submit via the Select all button.
      const version = await page.getByTestId('workflow-version-field').inputValue()
      const response = await postNotesViaBrowser(page, {
        action: 'select-all',
        workflowVersion: version,
        pitches: [],
      })
      expect(response.status()).toBe(303)

      // Navigate back to the notes step and confirm every pitch is checked.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
      for (const pitch of C_MAJOR_OCTAVE_4_PITCHES) {
        await expect(page.getByTestId(`pitch-field-${pitch}`)).toBeChecked()
      }

      // Confirm the full set was persisted.
      const state = await getAggregateState(page)
      expect(state['selectedPitches']).toBe(C_MAJOR_OCTAVE_4_PITCHES.join(','))
    }),
  )

  test(
    'two-hand mode: submitting one pitch is rejected with the exact cardinality message',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // Confirm setup with both hands.
      await confirmSetup(page, { hands: 'both' })
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)

      // Submit only one pitch via the ordinary save.
      const version = await page.getByTestId('workflow-version-field').inputValue()
      await submitInvalidNotesAndCaptureNonce(page, {
        action: 'save',
        workflowVersion: version,
        pitches: ['C4'],
      })

      // Navigate to the notes step to see the redisplay.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)

      // The field-level error message is displayed with the exact text.
      const error = page.getByTestId('pitches-error')
      await expect(error).toBeVisible()
      await expect(error).toContainText(
        'Select at least two pitches when using both hands.',
      )

      // The error summary is present and focused.
      const summary = page.getByTestId('error-summary')
      await expect(summary).toBeVisible()
      const activeId = await page.evaluate(() => document.activeElement?.id)
      expect(activeId).toBe('error-summary')

      // Nothing was persisted (selectedPitches is still null — first derivation).
      const state = await getAggregateState(page)
      expect(state['selectedPitches']).toBeNull()
    }),
  )

  test(
    'one-hand mode: submitting zero pitches is rejected',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      await confirmSetup(page, { hands: 'right' })
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)

      // Submit zero pitches (no pitches field) via the ordinary save.
      const version = await page.getByTestId('workflow-version-field').inputValue()
      await submitInvalidNotesAndCaptureNonce(page, {
        action: 'save',
        workflowVersion: version,
        pitches: [],
      })

      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)

      // A cardinality rejection is displayed.
      const error = page.getByTestId('pitches-error')
      await expect(error).toBeVisible()

      // Nothing was persisted.
      const state = await getAggregateState(page)
      expect(state['selectedPitches']).toBeNull()
    }),
  )

  test(
    'a narrowed selection is persisted and not re-expanded on re-render',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      await confirmSetup(page)
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)

      // Deselect several pitches and submit via the ordinary save.
      const version = await page.getByTestId('workflow-version-field').inputValue()
      const narrowedPitches = ['C4', 'D4', 'E4']
      const response = await postNotesViaBrowser(page, {
        action: 'save',
        workflowVersion: version,
        pitches: narrowedPitches,
        durations: FOUR_FOUR_DURATIONS,
      })
      expect(response.status()).toBe(303)

      // Reload the notes step and confirm exactly the narrowed selection is
      // checked (not re-expanded).
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
      for (const pitch of narrowedPitches) {
        await expect(page.getByTestId(`pitch-field-${pitch}`)).toBeChecked()
      }
      for (const pitch of C_MAJOR_OCTAVE_4_PITCHES.filter((p) => !narrowedPitches.includes(p))) {
        await expect(page.getByTestId(`pitch-field-${pitch}`)).not.toBeChecked()
      }

      // Confirm the narrowed selection was persisted.
      const state = await getAggregateState(page)
      expect(state['selectedPitches']).toBe(narrowedPitches.join(','))
    }),
  )

  test(
    'a stale workflow version is rejected and the currently saved selection is shown',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      await confirmSetup(page)
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)

      // Save a valid pitch set first.
      const version = await page.getByTestId('workflow-version-field').inputValue()
      const firstSave = await postNotesViaBrowser(page, {
        action: 'save',
        workflowVersion: version,
        pitches: ['C4', 'D4', 'E4'],
        durations: FOUR_FOUR_DURATIONS,
      })
      expect(firstSave.status()).toBe(303)

      // Reload and capture the new version.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
      const currentVersion = await page.getByTestId('workflow-version-field').inputValue()
      const staleVersion = String(Number(currentVersion) - 1)

      // Submit with a stale version.
      const response = await postNotesViaBrowser(page, {
        action: 'save',
        workflowVersion: staleVersion,
        pitches: ['C4', 'D4'],
        durations: FOUR_FOUR_DURATIONS,
      })
      expect(response.status()).toBe(303)

      // Reload and confirm the currently saved selection is shown (not the
      // submitted stale one).
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
      for (const pitch of ['C4', 'D4', 'E4']) {
        await expect(page.getByTestId(`pitch-field-${pitch}`)).toBeChecked()
      }

      // The persisted selection is unchanged.
      const state = await getAggregateState(page)
      expect(state['selectedPitches']).toBe('C4,D4,E4')
    }),
  )

  test(
    'a rejected two-hand submission redisplays the narrowed selection with the cardinality error',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // Confirm setup with both hands.
      await confirmSetup(page, { hands: 'both' })
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)

      // Save a valid two-pitch selection first.
      const version = await page.getByTestId('workflow-version-field').inputValue()
      const firstSave = await postNotesViaBrowser(page, {
        action: 'save',
        workflowVersion: version,
        pitches: ['C4', 'D4'],
        durations: FOUR_FOUR_DURATIONS,
      })
      expect(firstSave.status()).toBe(303)

      // Reload and submit only one pitch (cardinality failure).
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
      const currentVersion = await page.getByTestId('workflow-version-field').inputValue()
      await submitInvalidNotesAndCaptureNonce(page, {
        action: 'save',
        workflowVersion: currentVersion,
        pitches: ['C4'],
        durations: FOUR_FOUR_DURATIONS,
      })

      // Navigate to the notes step to see the redisplay.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)

      // The one submitted pitch is redisplayed checked.
      await expect(page.getByTestId('pitch-field-C4')).toBeChecked()
      // The cardinality error is displayed.
      const error = page.getByTestId('pitches-error')
      await expect(error).toBeVisible()
      await expect(error).toContainText(
        'Select at least two pitches when using both hands.',
      )
      // The error summary is focused.
      const activeId = await page.evaluate(() => document.activeElement?.id)
      expect(activeId).toBe('error-summary')

      // Nothing new was persisted — the prior valid selection is still stored.
      const state = await getAggregateState(page)
      expect(state['selectedPitches']).toBe('C4,D4')
    }),
  )

  test(
    'the error summary links into the pitch group',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      await confirmSetup(page, { hands: 'both' })
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)

      // Submit zero pitches to trigger a cardinality error.
      const version = await page.getByTestId('workflow-version-field').inputValue()
      await submitInvalidNotesAndCaptureNonce(page, {
        action: 'save',
        workflowVersion: version,
        pitches: [],
      })

      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)

      // The error summary is present and contains a link.
      const summary = page.getByTestId('error-summary')
      await expect(summary).toBeVisible()
      const links = summary.locator('a')
      const count = await links.count()
      expect(count).toBeGreaterThan(0)

      // The first link's href resolves to an existing control on the page.
      const firstHref = await links.nth(0).getAttribute('href')
      expect(firstHref).toMatch(/^#.+$/)
      const targetId = firstHref!.slice(1)
      await expect(page.locator(`#${targetId}`)).toHaveCount(1)

      // Activating the link moves focus to the linked control.
      await links.nth(0).click()
      const activeId = await page.evaluate(() => document.activeElement?.id)
      expect(activeId).toBe(targetId)
    }),
  )
})
