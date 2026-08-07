import { expect, test, type APIResponse, type Page } from '@playwright/test'

import { signInUser } from '../support/auth-helpers'
import { testWithDatabase } from '../support/test-helpers'
import { navigateToHome } from '../support/navigation-helpers'
import { TEST_USERS, SERVER_BASE_URL } from '../support/test-data'

const ETUDE_PATH = '/etude'
const ETUDE_SETUP_PATH = '/etude/setup'

/**
 * Parse a Set-Cookie header value into the cookie name, value, and attribute
 * map so the tests can assert on individual attributes. Mirrors the helper in
 * 10-etude-setup-invalid-redisplay.spec.ts.
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
 * Submit an invalid setup form via the browser's request context (sharing
 * session cookies), capture the nonce cookie from the 303 Set-Cookie header,
 * and add it to the browser context's cookie jar so the subsequent GET
 * sends it. `maxRedirects: 0` lets us inspect the 303 response directly.
 */
const submitInvalidAndCaptureNonce = async (
  page: Page,
  body: Record<string, string>,
): Promise<void> => {
  const response = await page.request.post(`${SERVER_BASE_URL}${ETUDE_SETUP_PATH}`, {
    multipart: { ...body },
    maxRedirects: 0,
    failOnStatusCode: false,
    headers: { Origin: SERVER_BASE_URL },
  })
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
}

test.describe('GET /etude/setup error summary and accessibility (Issue 9)', () => {
  test(
    'after an invalid submission, the error summary receives programmatic focus',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      await submitInvalidAndCaptureNonce(page, {
        measures: '33',
        meter: '4/4',
        hands: 'right',
        octaves: '4',
        key: 'C major',
        workflowVersion: '1',
      })

      await page.goto(ETUDE_SETUP_PATH)

      // The error summary is present.
      const summary = page.getByTestId('error-summary')
      await expect(summary).toBeVisible()

      // The summary receives programmatic focus on load.
      const activeId = await page.evaluate(() => document.activeElement?.id)
      expect(activeId).toBe('error-summary')

    }),
  )

  test(
    'each summary entry is a link whose href resolves to an existing control and following it moves focus there',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      await submitInvalidAndCaptureNonce(page, {
        measures: '33',
        meter: '4/4',
        hands: 'right',
        octaves: '4',
        key: 'C major',
        workflowVersion: '1',
      })

      await page.goto(ETUDE_SETUP_PATH)

      // The summary contains at least one link.
      const links = page.getByTestId('error-summary').locator('a')
      const count = await links.count()
      expect(count).toBeGreaterThan(0)

      // Each link's href begins with # and the target id exists on the page.
      for (let i = 0; i < count; i++) {
        const href = await links.nth(i).getAttribute('href')
        expect(href).toMatch(/^#.+$/)
        const targetId = href!.slice(1)
        const target = page.locator(`#${targetId}`)
        await expect(target).toHaveCount(1)
      }

      // Activating the first link moves focus to the linked control.
      const firstHref = await links.nth(0).getAttribute('href')
      const firstTargetId = firstHref!.slice(1)
      await links.nth(0).click()
      const activeId = await page.evaluate(() => document.activeElement?.id)
      expect(activeId).toBe(firstTargetId)
    }),
  )

  test(
    'every form control has an accessible name (label or aria-label)',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // Each control is resolvable by its accessible name via getByLabel /
      // getByRole. The measures input has a <label htmlFor>.
      await expect(page.getByLabel('Measures')).toBeVisible()
      await expect(page.getByLabel('Time signature')).toBeVisible()
      await expect(page.getByLabel('Hand')).toBeVisible()
      await expect(page.getByLabel('Key')).toBeVisible()

      // The octave checkboxes are each labelled. The group itself has an
      // accessible name (legend or aria-labelledby) so it is resolvable as a
      // group.
      const octaveGroup = page.getByRole('group')
      await expect(octaveGroup).toBeVisible()
      // Each octave checkbox is labelled "Octave N".
      for (let octave = 2; octave <= 6; octave++) {
        await expect(page.getByLabel(`Octave ${octave}`)).toBeVisible()
      }
    }),
  )

  test(
    'bounded fields carry native HTML constraint attributes and selects carry required',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      const measures = page.getByTestId('measures-field')
      await expect(measures).toHaveAttribute('min', '4')
      await expect(measures).toHaveAttribute('max', '32')
      await expect(measures).toHaveAttribute('step', '1')
      await expect(measures).toHaveAttribute('required', '')

      await expect(page.getByTestId('meter-field')).toHaveAttribute('required', '')
      await expect(page.getByTestId('hands-field')).toHaveAttribute('required', '')
      await expect(page.getByTestId('key-field')).toHaveAttribute('required', '')
    }),
  )

  test(
    'each field-level error element is programmatically associated with its control via aria-describedby',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      await submitInvalidAndCaptureNonce(page, {
        measures: '33',
        meter: '4/4',
        hands: 'right',
        octaves: '4',
        key: 'C major',
        workflowVersion: '1',
      })

      await page.goto(ETUDE_SETUP_PATH)

      // The measures control's aria-describedby references the measures error
      // element id.
      const measures = page.getByTestId('measures-field')
      const describedBy = await measures.getAttribute('aria-describedby')
      expect(describedBy).not.toBeNull()
      // The aria-describedby value contains the error id (measures-error-0).
      expect(describedBy!).toContain('measures-error-0')
      // The referenced error element exists.
      await expect(page.locator('#measures-error-0')).toHaveCount(1)
    }),
  )

  test(
    'a field error summary entry uses the unique anchor pattern <field>-error-<index> that supports multiple errors per field',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      await submitInvalidAndCaptureNonce(page, {
        measures: '33',
        meter: '4/4',
        hands: 'right',
        octaves: '4',
        key: 'C major',
        workflowVersion: '1',
      })

      await page.goto(ETUDE_SETUP_PATH)

      // The summary link for the measures error has an href targeting
      // measures-field, and the field-level error element has the unique id
      // measures-error-0 (the per-field index pattern that supports multiple
      // errors per field — the unit test in tests/error-summary.spec.ts
      // covers the multi-error dedupe and anchoring behaviour directly).
      const measuresLink = page.getByTestId('error-summary').locator('a', { hasText: 'Measure' }).first()
      const href = await measuresLink.getAttribute('href')
      expect(href).toBe('#measures-field')

      // The field-level error element id follows the <field>-error-<index>
      // pattern.
      await expect(page.locator('#measures-error-0')).toBeVisible()
    }),
  )

  test(
    'a group-level octaves error targets the first octave checkbox and is associated with the group',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      // Submit with no octaves selected (empty array) to trigger an octaves
      // group-level error. The octaves field is string-multi, so an absent
      // field produces a parse error for octaves.
      await submitInvalidAndCaptureNonce(page, {
        measures: '8',
        meter: '4/4',
        hands: 'right',
        // Omit octaves entirely to produce an octaves error.
        key: 'C major',
        workflowVersion: '1',
      })

      await page.goto(ETUDE_SETUP_PATH)

      // The summary is present with an octaves entry.
      const summary = page.getByTestId('error-summary')
      await expect(summary).toBeVisible()

      // The octaves summary entry links to the first octave checkbox
      // (octaves-field-2), not to an arbitrary single checkbox.
      const octavesLink = summary.locator('a', { hasText: 'octave' }).first()
      const href = await octavesLink.getAttribute('href')
      expect(href).toBe('#octaves-field-2')

      // The group container is associated with the error (the group has
      // aria-describedby referencing the octaves error id, or the group is
      // marked aria-invalid).
      const group = page.getByRole('group')
      const groupDescribedBy = await group.getAttribute('aria-describedby')
      expect(groupDescribedBy).not.toBeNull()
      expect(groupDescribedBy!).toContain('octaves-error-0')
    }),
  )

  test(
    'all control ids on the page are unique',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      // Collect every id attribute on the page and assert there are no
      // duplicates.
      const ids = await page.evaluate(() => {
        const elements = document.querySelectorAll('[id]')
        return Array.from(elements).map((el) => el.getAttribute('id') as string)
      })
      const unique = new Set(ids)
      expect(unique.size).toBe(ids.length)
    }),
  )

  test(
    'no error summary element renders when the submission is valid',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // A clean step (no validation state) renders no error summary at all.
      await expect(page.getByTestId('error-summary')).toHaveCount(0)
    }),
  )

  test(
    'multiple invalid fields each produce a summary entry and the entries are ordered by field appearance',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      // Submit with an invalid measures and an invalid meter to produce
      // errors on two fields. Both fail validation (not parsing), so the
      // validator reports both. The summary should list measures before meter
      // (field order).
      await submitInvalidAndCaptureNonce(page, {
        measures: '33',
        meter: '6/8',
        hands: 'right',
        octaves: '4',
        key: 'C major',
        workflowVersion: '1',
      })

      await page.goto(ETUDE_SETUP_PATH)

      const links = page.getByTestId('error-summary').locator('a')
      const count = await links.count()
      expect(count).toBeGreaterThanOrEqual(2)

      // The first link targets measures-field (measures comes first in the
      // form), the second targets meter-field (meter comes second).
      const firstHref = await links.nth(0).getAttribute('href')
      const secondHref = await links.nth(1).getAttribute('href')
      expect(firstHref).toBe('#measures-field')
      expect(secondHref).toBe('#meter-field')
    }),
  )
})
