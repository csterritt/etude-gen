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
 * Internal identifiers that must never appear in a safe redirect message
 * (cross-cutting contract section 1 rule 6 and Issue 18 acceptance
 * criterion on safe messages). The message must not expose ids, version
 * numbers, epoch values, pitch names, or boundary ids.
 */
const FORBIDDEN_MESSAGE_SUBSTRINGS = [
  'ep-',
  'user-',
  'workflowVersion',
  'workflow_version',
  'aggregateEpoch',
  'aggregate_epoch',
  'C4',
  'D4',
  'E4',
  'F4',
  'G4',
  'A4',
  'B4',
  'C5',
  '|',
]

/**
 * Assert that a message string exposes no internal state or identifiers.
 */
const expectSafeMessage = (message: string): void => {
  expect(message.length).toBeGreaterThan(0)
  for (const forbidden of FORBIDDEN_MESSAGE_SUBSTRINGS) {
    expect(message).not.toContain(forbidden)
  }
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
 * Seed the downstream state via the test-only route. Used for stored-values-
 * invalid tests that need a specific aggregate state not reachable through the
 * normal flow.
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
 * request context.
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
 * Confirm the notes step by navigating to the notes page and clicking Save.
 * The notes form defaults to all available pitches and all offerable
 * durations selected, so clicking Save confirms both halves.
 */
const confirmNotes = async (page: Page): Promise<void> => {
  await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
  await page.getByTestId('notes-save-action').click()
  await page.waitForLoadState('networkidle')
}

/**
 * Submit the pitches half of the notes step only (action: 'save'), leaving
 * durations unconfirmed. Used to reach the "pitches confirmed but durations
 * unconfirmed" stage.
 */
const confirmPitchesOnly = async (page: Page, pitches: string[]): Promise<void> => {
  const version = await page.getByTestId('workflow-version-field').inputValue()
  const response = await postNotesViaBrowser(page, {
    action: 'save',
    pitches,
    workflowVersion: version,
  })
  expect(response.status()).toBe(303)
}

/**
 * Sign in, create the aggregate, and land on the setup step. Returns the page
 * ready at /etude/setup.
 */
const signInAndCreateAggregate = async (page: Page): Promise<void> => {
  await navigateToHome(page)
  await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
  await page.goto(ETUDE_PATH)
  expect(page.url()).toContain(ETUDE_SETUP_PATH)
}

/**
 * Request a path with no redirect following and assert a 303 redirect to the
 * expected canonical path. Returns the response for further header assertions.
 */
const expectRedirectTo = async (
  page: Page,
  path: string,
  expectedLocation: string,
): Promise<APIResponse> => {
  const response = await page.request.get(`${SERVER_BASE_URL}${path}`, {
    maxRedirects: 0,
    failOnStatusCode: false,
  })
  expect(response.status()).toBe(303)
  expect(response.headers()['location']).toContain(expectedLocation)
  return response
}

/**
 * Request a path, follow redirects, and assert the page landed at the expected
 * path AND displays a safe prerequisite-redirect message via the
 * `data-testid='prerequisite-redirect-message'` element. The message is
 * checked against the forbidden-substring list.
 */
const expectRedirectWithSafeMessage = async (
  page: Page,
  path: string,
  expectedLocation: string,
): Promise<void> => {
  await page.goto(`${SERVER_BASE_URL}${path}`)
  expect(page.url()).toContain(expectedLocation)
  const messageEl = page.getByTestId('prerequisite-redirect-message')
  await expect(messageEl).toBeVisible()
  const message = await messageEl.textContent()
  expectSafeMessage(message ?? '')
}

/**
 * Request a path, follow redirects, and assert the page landed at the expected
 * path and rendered normally (no prerequisite-redirect message).
 */
const expectRendersNormally = async (
  page: Page,
  path: string,
  expectedLocation: string,
): Promise<void> => {
  await page.goto(`${SERVER_BASE_URL}${path}`)
  expect(page.url()).toContain(expectedLocation)
  await expect(page.getByTestId('prerequisite-redirect-message')).toHaveCount(0)
}

test.describe('Issue 18: prerequisite redirects to the earliest incomplete step', () => {
  test.describe('fresh aggregate (no steps confirmed)', () => {
    test(
      'direct GET to later steps redirects to /etude/setup with a safe message',
      testWithDatabase(async ({ page }) => {
        await signInAndCreateAggregate(page)

        await expectRedirectTo(page, ETUDE_NOTES_PATH, ETUDE_SETUP_PATH)
        await expectRedirectTo(page, ETUDE_SPLIT_PATH, ETUDE_SETUP_PATH)
        await expectRedirectTo(page, ETUDE_REVIEW_PATH, ETUDE_SETUP_PATH)
        await expectRedirectTo(page, ETUDE_PATH, ETUDE_SETUP_PATH)

        // Following the redirect to /etude/notes displays a safe message.
        await expectRedirectWithSafeMessage(page, ETUDE_NOTES_PATH, ETUDE_SETUP_PATH)
      }),
    )
  })

  test.describe('setup confirmed, notes unconfirmed', () => {
    test(
      'direct GET to later steps redirects to /etude/notes with a safe message',
      testWithDatabase(async ({ page }) => {
        await signInAndCreateAggregate(page)
        await confirmSetup(page, { hands: 'both' })

        // /etude/setup still renders normally.
        await expectRendersNormally(page, ETUDE_SETUP_PATH, ETUDE_SETUP_PATH)

        await expectRedirectTo(page, ETUDE_SPLIT_PATH, ETUDE_NOTES_PATH)
        await expectRedirectTo(page, ETUDE_REVIEW_PATH, ETUDE_NOTES_PATH)
        await expectRedirectTo(page, ETUDE_PATH, ETUDE_NOTES_PATH)

        // Following the redirect to /etude/split displays a safe message.
        await expectRedirectWithSafeMessage(page, ETUDE_SPLIT_PATH, ETUDE_NOTES_PATH)
      }),
    )
  })

  test.describe('pitches confirmed but durations unconfirmed', () => {
    test(
      'direct GET to later steps redirects to /etude/notes with a safe message',
      testWithDatabase(async ({ page }) => {
        await signInAndCreateAggregate(page)
        await confirmSetup(page, { hands: 'both' })

        // Navigate to the notes step and submit pitches only.
        await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
        await confirmPitchesOnly(page, ['C4', 'D4', 'E4'])

        // The notes step is still unconfirmed (durations not confirmed).
        const state = await getAggregateState(page)
        expect(state['notesConfirmed']).toBe(false)

        await expectRedirectTo(page, ETUDE_SPLIT_PATH, ETUDE_NOTES_PATH)
        await expectRedirectTo(page, ETUDE_REVIEW_PATH, ETUDE_NOTES_PATH)
        await expectRedirectTo(page, ETUDE_PATH, ETUDE_NOTES_PATH)

        // Following the redirect to /etude/review displays a safe message.
        await expectRedirectWithSafeMessage(page, ETUDE_REVIEW_PATH, ETUDE_NOTES_PATH)
      }),
    )
  })

  test.describe('notes confirmed, one hand (split skipped)', () => {
    test(
      'direct GET to /etude/split redirects to /etude/review with a safe message',
      testWithDatabase(async ({ page }) => {
        await signInAndCreateAggregate(page)
        await confirmSetup(page, { hands: 'right' })
        await confirmNotes(page)

        // /etude/review renders normally.
        await expectRendersNormally(page, ETUDE_REVIEW_PATH, ETUDE_REVIEW_PATH)

        // /etude/split redirects to /etude/review (split skipped for one hand).
        await expectRedirectTo(page, ETUDE_SPLIT_PATH, ETUDE_REVIEW_PATH)
        await expectRedirectTo(page, ETUDE_PATH, ETUDE_REVIEW_PATH)

        // Following the redirect to /etude/split displays a safe message.
        await expectRedirectWithSafeMessage(page, ETUDE_SPLIT_PATH, ETUDE_REVIEW_PATH)
      }),
    )
  })

  test.describe('notes confirmed, both hands, split unconfirmed', () => {
    test(
      'direct GET to /etude/review redirects to /etude/split with a safe message',
      testWithDatabase(async ({ page }) => {
        await signInAndCreateAggregate(page)
        await confirmSetup(page, { hands: 'both' })
        await confirmNotes(page)

        // /etude/split renders normally.
        await expectRendersNormally(page, ETUDE_SPLIT_PATH, ETUDE_SPLIT_PATH)

        await expectRedirectTo(page, ETUDE_REVIEW_PATH, ETUDE_SPLIT_PATH)
        await expectRedirectTo(page, ETUDE_PATH, ETUDE_SPLIT_PATH)

        // Following the redirect to /etude/review displays a safe message.
        await expectRedirectWithSafeMessage(page, ETUDE_REVIEW_PATH, ETUDE_SPLIT_PATH)
      }),
    )
  })

  test.describe('all confirmed (both hands, split confirmed)', () => {
    test(
      'direct GET to /etude/review renders normally and /etude redirects to /etude/review',
      testWithDatabase(async ({ page }) => {
        await signInAndCreateAggregate(page)
        await confirmSetup(page, { hands: 'both' })
        await confirmNotes(page)

        // Confirm the split step by submitting a valid boundary.
        await page.goto(`${SERVER_BASE_URL}${ETUDE_SPLIT_PATH}`)
        const version = await page.getByTestId('workflow-version-field').inputValue()
        const response = await page.request.post(`${SERVER_BASE_URL}${ETUDE_SPLIT_PATH}`, {
          multipart: { workflowVersion: version, boundary: 'C4|D4' },
          maxRedirects: 0,
          failOnStatusCode: false,
          headers: { Origin: SERVER_BASE_URL },
        })
        expect(response.status()).toBe(303)

        // /etude/review renders normally.
        await expectRendersNormally(page, ETUDE_REVIEW_PATH, ETUDE_REVIEW_PATH)

        // /etude redirects to /etude/review (no message — it is the entry
        // point, not a prerequisite redirect).
        const entryResponse = await page.request.get(`${SERVER_BASE_URL}${ETUDE_PATH}`, {
          maxRedirects: 0,
          failOnStatusCode: false,
        })
        expect(entryResponse.status()).toBe(303)
        expect(entryResponse.headers()['location']).toContain(ETUDE_REVIEW_PATH)
      }),
    )
  })

  test.describe('stored values no longer validate', () => {
    test(
      'invalid stored pitches redirect to /etude/notes with a safe message',
      testWithDatabase(async ({ page }) => {
        await signInAndCreateAggregate(page)
        await confirmSetup(page, { hands: 'both' })

        // Seed a state where notesConfirmed is true but the stored pitch
        // 'Z9' is not in the C-major octave-4 available set.
        await seedDownstreamState(page, {
          selectedPitches: 'Z9',
          selectedDurations: 'Q',
          notesConfirmed: 'true',
          splitConfirmed: 'true',
          splitBoundary: 'C4|D4',
        })

        await expectRedirectTo(page, ETUDE_REVIEW_PATH, ETUDE_NOTES_PATH)
        await expectRedirectTo(page, ETUDE_PATH, ETUDE_NOTES_PATH)

        // Following the redirect to /etude/review displays a safe message.
        await expectRedirectWithSafeMessage(page, ETUDE_REVIEW_PATH, ETUDE_NOTES_PATH)
      }),
    )

    test(
      'invalid stored boundary redirects to /etude/split with a safe message',
      testWithDatabase(async ({ page }) => {
        await signInAndCreateAggregate(page)
        await confirmSetup(page, { hands: 'both' })

        // Seed a state where pitches and durations are valid but the
        // stored boundary 'Z9|Z10' is not among the eligible boundaries
        // for C4,D4,E4.
        await seedDownstreamState(page, {
          selectedPitches: 'C4,D4,E4',
          selectedDurations: 'Q',
          notesConfirmed: 'true',
          splitConfirmed: 'true',
          splitBoundary: 'Z9|Z10',
        })

        await expectRedirectTo(page, ETUDE_REVIEW_PATH, ETUDE_SPLIT_PATH)
        await expectRedirectTo(page, ETUDE_PATH, ETUDE_SPLIT_PATH)

        // Following the redirect to /etude/review displays a safe message.
        await expectRedirectWithSafeMessage(page, ETUDE_REVIEW_PATH, ETUDE_SPLIT_PATH)
      }),
    )
  })
})
