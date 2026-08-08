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
 * Offerable duration tokens (canonical order W, H, D, Q, R, E) per meter
 * derived from the packaged rhythm catalog's patterns.
 */
const OFFERABLE_2_4 = ['H', 'Q', 'R', 'E']
const OFFERABLE_4_4 = ['W', 'H', 'D', 'Q', 'R', 'E']

/**
 * Parse a Set-Cookie header value into the cookie name, value, and attribute
 * map so the tests can assert on individual attributes. Mirrors the helper in
 * 15-etude-notes-pitch-selection.spec.ts.
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

test.describe('Issue 14: notes step duration selection', () => {
  test(
    'for a saved 2/4 meter, exactly the offerable duration controls appear (whole and dotted-half absent)',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '2/4' })

      // The offerable controls for 2/4 (H, Q, R, E) are present.
      for (const token of OFFERABLE_2_4) {
        await expect(page.getByTestId(`duration-field-${token}`)).toBeVisible()
      }
      // Whole and dotted-half never fit a 2/4 measure, so they are absent.
      await expect(page.getByTestId('duration-field-W')).toHaveCount(0)
      await expect(page.getByTestId('duration-field-D')).toHaveCount(0)
    }),
  )

  test(
    'for a saved 4/4 meter, all six supported durations are offered',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '4/4' })

      for (const token of OFFERABLE_4_4) {
        await expect(page.getByTestId(`duration-field-${token}`)).toBeVisible()
      }
    }),
  )

  test(
    'a freshly derived notes step has every offerable duration selected by default',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '2/4' })

      for (const token of OFFERABLE_2_4) {
        await expect(page.getByTestId(`duration-field-${token}`)).toBeChecked()
      }
      // Pitches also default to the full available set.
      for (const pitch of C_MAJOR_OCTAVE_4_PITCHES) {
        await expect(page.getByTestId(`pitch-field-${pitch}`)).toBeChecked()
      }
    }),
  )

  test(
    'a direct POST of an impossible duration set is rejected with a group-level corrective error, nothing persisted, and the selection redisplayed',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '2/4' })

      // {R} is offerable for 2/4 but cannot form any complete measure; the
      // corrective suggestion is the half duration.
      const version = await page.getByTestId('workflow-version-field').inputValue()
      await submitInvalidNotesAndCaptureNonce(page, {
        action: 'save',
        workflowVersion: version,
        pitches: ['C4'],
        durations: ['R'],
      })

      // Navigate to the notes step to see the redisplay.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)

      // The group-level duration error is displayed, naming the duration
      // group, the current meter, and the corrective suggestion by label.
      const error = page.getByTestId('durations-error')
      await expect(error).toBeVisible()
      await expect(error).toContainText('duration')
      await expect(error).toContainText('2/4')
      await expect(error).toContainText('the half duration')

      // The submitted durations are redisplayed checked, the rest unchecked.
      await expect(page.getByTestId('duration-field-R')).toBeChecked()
      for (const token of ['H', 'Q', 'E']) {
        await expect(page.getByTestId(`duration-field-${token}`)).not.toBeChecked()
      }

      // The error summary is present and focused.
      const summary = page.getByTestId('error-summary')
      await expect(summary).toBeVisible()
      const activeId = await page.evaluate(() => document.activeElement?.id)
      expect(activeId).toBe('error-summary')

      // The summary links into the duration group (its first member).
      const groupLink = summary.locator('[data-testid="error-summary-group"]')
      await expect(groupLink).toHaveCount(1)
      const href = await groupLink.getAttribute('href')
      expect(href).toMatch(/^#duration-field-/)
      await expect(page.locator(`#${href!.slice(1)}`)).toHaveCount(1)

      // Nothing was persisted — selectedDurations is still null and the
      // notes step is unconfirmed.
      const state = await getAggregateState(page)
      expect(state['selectedDurations']).toBeNull()
      expect(state['notesConfirmed']).toBe(false)
    }),
  )

  test(
    'duplicate submissions of the same offerable duration are de-duplicated and persisted in canonical order',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '2/4' })

      const version = await page.getByTestId('workflow-version-field').inputValue()
      const response = await postNotesViaBrowser(page, {
        action: 'save',
        workflowVersion: version,
        pitches: ['C4'],
        durations: ['Q', 'Q', 'E', 'E'],
      })
      expect(response.status()).toBe(303)

      // Reload: the page shows the canonical order (Q before E).
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
      await expect(page.getByTestId('duration-field-Q')).toBeChecked()
      await expect(page.getByTestId('duration-field-E')).toBeChecked()

      // The stored selection is de-duplicated and in canonical order.
      const state = await getAggregateState(page)
      expect(state['selectedDurations']).toBe('Q,E')
    }),
  )

  test(
    'an unknown duration token is rejected field-addressably with no persistence',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '2/4' })

      const version = await page.getByTestId('workflow-version-field').inputValue()
      const response = await submitInvalidNotesAndCaptureNonce(page, {
        action: 'save',
        workflowVersion: version,
        pitches: ['C4'],
        durations: ['X'],
      })
      expect(response.status()).toBe(303)

      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
      await expect(page.getByTestId('durations-error').first()).toBeVisible()
      await expect(page.getByTestId('durations-error').first()).toContainText('X')

      // Nothing persisted.
      const state = await getAggregateState(page)
      expect(state['selectedDurations']).toBeNull()
    }),
  )

  test(
    'a supported duration token not offerable for the meter is rejected field-addressably with no persistence',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '2/4' })

      // Whole is supported but never fits a 2/4 measure.
      const version = await page.getByTestId('workflow-version-field').inputValue()
      const response = await postNotesViaBrowser(page, {
        action: 'save',
        workflowVersion: version,
        pitches: ['C4'],
        durations: ['W'],
      })
      expect(response.status()).toBe(303)
      const setCookie = response.headers()['set-cookie']
      expect(setCookie).toBeDefined()
      const parsed = parseSetCookie(setCookie!)
      expect(parsed.name).toBe('VALIDATION_STATE_NONCE')
      await page.context().addCookies([
        { name: parsed.name, value: parsed.value, domain: 'localhost', path: '/etude' },
      ])

      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
      const error = page.getByTestId('durations-error').first()
      await expect(error).toBeVisible()
      await expect(error).toContainText('W')
      await expect(error).toContainText('2/4')

      const state = await getAggregateState(page)
      expect(state['selectedDurations']).toBeNull()
    }),
  )

  test(
    'an empty duration selection is rejected with the empty-selection message and nothing is persisted',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '2/4' })

      const version = await page.getByTestId('workflow-version-field').inputValue()
      await submitInvalidNotesAndCaptureNonce(page, {
        action: 'save',
        workflowVersion: version,
        pitches: ['C4'],
        durations: [],
      })

      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
      const error = page.getByTestId('durations-error')
      await expect(error).toBeVisible()
      await expect(error).toContainText('Select at least one duration.')

      const state = await getAggregateState(page)
      expect(state['selectedDurations']).toBeNull()
      expect(state['notesConfirmed']).toBe(false)
    }),
  )

  test(
    'a stale workflow version is rejected and the currently saved durations are shown',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '2/4' })

      // Save a valid narrowed duration set first.
      const version = await page.getByTestId('workflow-version-field').inputValue()
      const firstSave = await postNotesViaBrowser(page, {
        action: 'save',
        workflowVersion: version,
        pitches: ['C4', 'D4'],
        durations: ['Q', 'E'],
      })
      expect(firstSave.status()).toBe(303)

      // Reload and capture the new version.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
      const currentVersion = await page.getByTestId('workflow-version-field').inputValue()
      const staleVersion = String(Number(currentVersion) - 1)

      // Submit different durations with the stale version.
      const response = await postNotesViaBrowser(page, {
        action: 'save',
        workflowVersion: staleVersion,
        pitches: ['C4', 'D4'],
        durations: ['H'],
      })
      expect(response.status()).toBe(303)

      // Reload: the currently saved selection is shown, not the stale one.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
      await expect(page.getByTestId('duration-field-Q')).toBeChecked()
      await expect(page.getByTestId('duration-field-E')).toBeChecked()
      await expect(page.getByTestId('duration-field-H')).not.toBeChecked()

      const state = await getAggregateState(page)
      expect(state['selectedDurations']).toBe('Q,E')
    }),
  )

  test(
    'the notes step is complete only after both pitches and durations are confirmed',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { meter: '2/4' })

      // Confirm pitches alone via Select all — the step stays incomplete.
      const version = await page.getByTestId('workflow-version-field').inputValue()
      const selectAll = await postNotesViaBrowser(page, {
        action: 'select-all',
        workflowVersion: version,
        pitches: [],
      })
      expect(selectAll.status()).toBe(303)

      // The step is still the earliest incomplete step.
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_NOTES_PATH)

      // Reload the notes step: the pitches are stored (checked) and the
      // durations are still unselected-stored, so they show the all-offerable
      // default. Submit the combined form via the real Save button (all
      // 8 pitches + 4 offerable durations) to confirm both halves.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
      await page.getByTestId('notes-save-action').click()
      await page.waitForLoadState('networkidle')

      // Both halves confirmed: the canonical route no longer returns notes.
      const state = await getAggregateState(page)
      expect(state['notesConfirmed']).toBe(true)
      expect(state['selectedDurations']).toBe(OFFERABLE_2_4.join(','))
      await page.goto(ETUDE_PATH)
      expect(page.url()).not.toContain(ETUDE_NOTES_PATH)
    }),
  )
})