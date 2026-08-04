import { test, expect } from '@playwright/test'

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

test('every response carries an X-Correlation-ID header containing a UUID v4', async ({
  request,
}) => {
  const response = await request.get('/auth/sign-in')
  const header = response.headers()['x-correlation-id']
  expect(header).toBeTruthy()
  expect(header as string).toMatch(UUID_V4_PATTERN)
})

test('a forced unexpected error renders the safe message with a visible correlation identifier', async ({
  page,
}) => {
  // Use a single navigation so the header and the rendered body share one
  // correlation identifier. The forced-error route is a test-only endpoint
  // gated by the test-route flag.
  const response = await page.goto('/test/forced-error')
  expect(response?.status()).toBe(500)

  const header = response?.headers()['x-correlation-id']
  expect(header).toBeTruthy()
  expect(header as string).toMatch(UUID_V4_PATTERN)

  // The visible correlation identifier element should carry the same id as the header.
  const visibleId = await page
    .getByTestId('safe-error-correlation-id')
    .textContent()
  expect(visibleId).toContain(header as string)

  // The generic safe message should be present.
  const message = await page.getByTestId('safe-error-message').textContent()
  expect(message).toBeTruthy()

  // The page must not leak technical detail. The forced-error route throws an
  // error carrying SQL, a stack-like string, and a service snippet; none of it
  // should appear in the rendered body.
  const body = await page.content()
  expect(body).not.toContain('select * from users')
  expect(body).not.toContain('ENGRAVE_ERROR')
  expect(body).not.toContain('at /sql/')
})
