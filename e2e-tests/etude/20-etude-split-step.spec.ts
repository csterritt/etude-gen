import { expect, test, type APIResponse, type Page } from '@playwright/test'

import { signInUser } from '../support/auth-helpers'
import { testWithDatabase } from '../support/test-helpers'
import { navigateToHome } from '../support/navigation-helpers'
import { TEST_USERS, SERVER_BASE_URL } from '../support/test-data'

const ETUDE_PATH = '/etude'
const ETUDE_SETUP_PATH = '/etude/setup'
const ETUDE_NOTES_PATH = '/etude/notes'
const ETUDE_SPLIT_PATH = '/etude/split'
const ETUDE_REVIEW_PATH = '/etude/review'

/**
 * The available pitches for C major, octave 4 (C4 through C5), in order.
 */
const C_MAJOR_OCTAVE_4_PITCHES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']

/**
 * Parse a Set-Cookie header value into the cookie name, value, and attribute
 * map so the tests can assert on individual attributes.
 */
const parseSetCookie = (header: string): { name: string; value: string; attrs: Record<string, string> } => {
  const parts = header.split(';').map((p) => p.trim())
  const first = parts[0] ?? ''
  const eq = first.indexOf('=')
  const name = eq >= 0 ? first.slice(0, eq) : first
  const value = eq >= 0 ? first.slice(eq + 1) : ''
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
 * context. Pitch and duration values are sent as repeated fields.
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
      formData.append(key, value)
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
 * Submit a multipart POST to /etude/split using the authenticated browser
 * context.
 */
const postSplitViaBrowser = async (
  page: Page,
  body: Record<string, string>,
): Promise<APIResponse> => {
  return page.request.post(`${SERVER_BASE_URL}${ETUDE_SPLIT_PATH}`, {
    multipart: { ...body },
    maxRedirects: 0,
    failOnStatusCode: false,
    headers: { Origin: SERVER_BASE_URL },
  })
}

/**
 * Submit an invalid split form via the browser's request context, capture the
 * nonce cookie from the 303 Set-Cookie header, and add it to the browser
 * context's cookie jar so the subsequent GET sends it.
 */
const submitInvalidSplitAndCaptureNonce = async (
  page: Page,
  body: Record<string, string>,
): Promise<APIResponse> => {
  const response = await postSplitViaBrowser(page, body)
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
 * Seed the downstream state via the test-only route. Used for corrupt-state
 * tests that need a specific aggregate state not reachable through the normal
 * flow.
 */
const seedDownstreamState = async (
  page: Page,
  body: Record<string, string>,
): Promise<APIResponse> => {
  return page.request.post(`${SERVER_BASE_URL}/test/etude/seed-downstream-state`, {
    multipart: { ...body },
    maxRedirects: 0,
    failOnStatusCode: false,
    headers: { Origin: SERVER_BASE_URL },
  })
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
 * request context, so the notes step is reachable.
 */
const confirmSetup = async (
  page: Page,
  overrides: Record<string, string> = {},
): Promise<void> => {
  const versionBefore = await page.getByTestId('workflow-version-field').inputValue()
  const response = await postSetupViaBrowser(page, {
    measures: '16',
    meter: '4/4',
    hands: 'both',
    key: 'C major',
    octaves: '4',
    workflowVersion: versionBefore,
    ...overrides,
  })
  expect(response.status()).toBe(303)
}

/**
 * Confirm the notes step by navigating to the notes page and clicking the
 * Save button (which uses URL-encoded form submission, well under the 1kb
 * test body limit). The notes form defaults to all available pitches and all
 * offerable durations selected, so clicking Save confirms both halves.
 */
const confirmNotes = async (
  page: Page,
): Promise<void> => {
  await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
  await page.getByTestId('notes-save-action').click()
  await page.waitForLoadState('networkidle')
}

/**
 * Sign in, create the aggregate, confirm setup with both hands, and confirm
 * the notes step so the split step is reachable.
 */
const reachSplitStep = async (
  page: Page,
  setupOverrides: Record<string, string> = {},
): Promise<void> => {
  await navigateToHome(page)
  await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
  await page.goto(ETUDE_PATH)
  expect(page.url()).toContain(ETUDE_SETUP_PATH)

  await confirmSetup(page, { hands: 'both', ...setupOverrides })
  await confirmNotes(page)
  await page.goto(`${SERVER_BASE_URL}${ETUDE_SPLIT_PATH}`)
}

test.describe('Issue 16: split step for the two-hand boundary', () => {
  test(
    'the two-hand split step renders one radio per eligible boundary',
    testWithDatabase(async ({ page }) => {
      await reachSplitStep(page)

      // For the 8 C-major-octave-4 pitches, there are 7 eligible boundaries.
      // Each boundary radio has a data-testid like boundary-field-<id>.
      const radios = page.locator('[data-testid^="boundary-field-"]')
      await expect(radios).toHaveCount(7)

      // The hidden workflowVersion field is present.
      await expect(page.getByTestId('workflow-version-field')).toHaveValue(String(3))
      // The Save button is present.
      await expect(page.getByTestId('split-save-action')).toBeVisible()
    }),
  )

  test(
    'a working submission chooses a boundary, persists it, and redirects to /etude/review',
    testWithDatabase(async ({ page }) => {
      await reachSplitStep(page)

      // Choose the first boundary (C4|D4 — left [C4], right [D4..C5]).
      const firstBoundaryId = 'C4|D4'
      const version = await page.getByTestId('workflow-version-field').inputValue()
      const response = await postSplitViaBrowser(page, {
        workflowVersion: version,
        boundary: firstBoundaryId,
      })
      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_REVIEW_PATH)

      // The boundary is persisted and splitConfirmed is true.
      const state = await getAggregateState(page)
      expect(state['splitBoundary']).toBe(firstBoundaryId)
      expect(state['splitConfirmed']).toBe(true)
    }),
  )

  test(
    'a one-hand workflow skips the split step and a direct GET redirects to the canonical route',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // Confirm setup with right hand (one hand).
      await confirmSetup(page, { hands: 'right' })
      await confirmNotes(page)

      // A direct GET to /etude/split redirects to the canonical route (review).
      const response = await page.request.get(`${SERVER_BASE_URL}${ETUDE_SPLIT_PATH}`, {
        maxRedirects: 0,
        failOnStatusCode: false,
      })
      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_REVIEW_PATH)

      // No boundary is stored.
      const state = await getAggregateState(page)
      expect(state['splitBoundary']).toBeNull()
    }),
  )

  test(
    'a direct POST to /etude/split for a one-hand workflow redirects to the canonical route and clears any stored boundary',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // Confirm setup with right hand (one hand).
      await confirmSetup(page, { hands: 'right' })
      await confirmNotes(page)

      // Seed a stale boundary so we can confirm the POST clears it.
      await seedDownstreamState(page, {
        selectedPitches: 'C4,D4,E4,F4,G4,A4,B4,C5',
        selectedDurations: 'Q,E',
        splitBoundary: 'C4|D4',
        splitConfirmed: 'true',
      })

      // A direct POST to /etude/split redirects to the canonical route.
      const response = await postSplitViaBrowser(page, {
        workflowVersion: '999',
        boundary: 'C4|D4',
      })
      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_REVIEW_PATH)

      // The stale boundary is cleared.
      const state = await getAggregateState(page)
      expect(state['splitBoundary']).toBeNull()
    }),
  )

  test(
    'a direct visit while durations are unconfirmed redirects to the notes step',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // Confirm setup with both hands.
      await confirmSetup(page, { hands: 'both' })

      // Do NOT confirm notes — go directly to /etude/split.
      const response = await page.request.get(`${SERVER_BASE_URL}${ETUDE_SPLIT_PATH}`, {
        maxRedirects: 0,
        failOnStatusCode: false,
      })
      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_NOTES_PATH)
    }),
  )

  test(
    'a stale workflow version is rejected and the currently saved state is shown',
    testWithDatabase(async ({ page }) => {
      await reachSplitStep(page)

      // Capture the current version.
      const version = await page.getByTestId('workflow-version-field').inputValue()
      const staleVersion = String(Number(version) - 1)

      // Submit a valid boundary with the stale version.
      const response = await postSplitViaBrowser(page, {
        workflowVersion: staleVersion,
        boundary: 'C4|D4',
      })
      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_SPLIT_PATH)

      // Nothing was persisted.
      const state = await getAggregateState(page)
      expect(state['splitBoundary']).toBeNull()
      expect(state['splitConfirmed']).toBe(false)
    }),
  )

  test(
    'an invalid boundary is rejected, nothing is persisted, and the step is redisplayed with a focused error summary',
    testWithDatabase(async ({ page }) => {
      await reachSplitStep(page)

      const version = await page.getByTestId('workflow-version-field').inputValue()
      await submitInvalidSplitAndCaptureNonce(page, {
        workflowVersion: version,
        boundary: 'Z9|X9',
      })

      // Navigate to the split step to see the redisplay.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_SPLIT_PATH}`)

      // The field-level boundary error is displayed.
      const error = page.getByTestId('boundary-error')
      await expect(error).toBeVisible()

      // The error summary is present and focused.
      const summary = page.getByTestId('error-summary')
      await expect(summary).toBeVisible()
      const activeId = await page.evaluate(() => document.activeElement?.id)
      expect(activeId).toBe('error-summary')

      // Nothing was persisted.
      const state = await getAggregateState(page)
      expect(state['splitBoundary']).toBeNull()
      expect(state['splitConfirmed']).toBe(false)
    }),
  )

  test(
    'a corrupt-state two-hand aggregate with fewer than two pitches redirects to the notes step and unconfirms it',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // Confirm setup with both hands.
      await confirmSetup(page, { hands: 'both' })

      // Seed a corrupt state: notesConfirmed true but only one pitch stored.
      await seedDownstreamState(page, {
        selectedPitches: 'C4',
        selectedDurations: 'Q,E',
        notesConfirmed: 'true',
        splitConfirmed: 'false',
      })

      // A direct GET to /etude/split redirects to /etude/notes.
      const response = await page.request.get(`${SERVER_BASE_URL}${ETUDE_SPLIT_PATH}`, {
        maxRedirects: 0,
        failOnStatusCode: false,
      })
      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_NOTES_PATH)

      // The notes step is treated as unconfirmed.
      const state = await getAggregateState(page)
      expect(state['notesConfirmed']).toBe(false)
      expect(state['splitConfirmed']).toBe(false)
      expect(state['splitBoundary']).toBeNull()
    }),
  )
})
