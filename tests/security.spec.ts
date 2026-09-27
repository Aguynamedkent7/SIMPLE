import { expect, test } from '@playwright/test'
import { logIn } from './e2e'
import { confirmedUser } from './support'

test('security headers and a per-request CSP nonce on every page', async ({ request }) => {
  const [first, second] = [await request.get('/login'), await request.get('/login')]
  const h = first.headers()
  expect(h['strict-transport-security']).toBe('max-age=63072000; includeSubDomains; preload')
  expect(h['x-content-type-options']).toBe('nosniff')
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(h['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()')
  expect(h['cross-origin-opener-policy']).toBe('same-origin')
  expect(h['x-powered-by']).toBeUndefined()
  const csp = h['content-security-policy']
  for (const directive of ["default-src 'self'", "'strict-dynamic'", "frame-ancestors 'none'",
    "base-uri 'self'", "form-action 'self'", "object-src 'none'", "connect-src 'self'"]) {
    expect(csp).toContain(directive)
  }
  expect(csp).not.toContain('unsafe-inline')
  expect(csp).not.toContain('unsafe-eval')
  const nonce = /'nonce-([^']+)'/.exec(csp)![1]
  expect(second.headers()['content-security-policy']).not.toContain(nonce)
  expect(await first.text()).toContain(`nonce="${nonce}"`)
})

test('the pages run under the CSP with no violations', async ({ page }) => {
  const violations: string[] = []
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()) })
  const user = await confirmedUser('India Insulation')
  await logIn(page, user.email)
  await expect(page.getByText('India Insulation')).toBeVisible()
  await page.getByRole('button', { name: 'Job done' }).click()
  expect(violations).toEqual([])
})

test('a tampered server action (extra business_id) is refused and B is untouched', async ({ page, request }) => {
  const [a, b] = await Promise.all([confirmedUser('Juliet Joinery'), confirmedUser('Kilo Kitchens')])
  await logIn(page, a.email)
  await expect(page.getByText('Juliet Joinery')).toBeVisible()

  let action: { id: string; body: string } | undefined
  await page.route('/', async (route) => {
    const req = route.request()
    const id = req.headers()['next-action']
    if (req.method() !== 'POST' || !id) return route.continue()
    const args = JSON.parse(req.postData()!)
    args[0].business_id = b.businessId
    action = { id, body: JSON.stringify(args) }
    await route.continue({ postData: action.body })
  })
  await page.getByRole('button', { name: 'Job done' }).click()
  await page.getByRole('textbox', { name: 'Customer', exact: true }).fill('Planted')
  await page.getByRole('textbox', { name: 'Job', exact: true }).fill('Into B')
  await page.getByRole('textbox', { name: 'Price', exact: true }).fill('999')
  await page.getByRole('button', { name: 'Save job' }).click()
  await expect(page.getByText('That entry is missing something.')).toBeVisible()
  await expect(page.getByTestId('in')).toHaveText('$0.00')
  expect(action).toBeDefined()

  // The same action replayed with no session cookie: refused before anything is parsed.
  const replay = await request.fetch('/', { // separate context: no cookies
    method: 'POST',
    headers: { 'next-action': action!.id, 'content-type': 'text/plain;charset=UTF-8', accept: 'text/x-component' },
    data: action!.body.replace(`,"business_id":"${b.businessId}"`, ''),
  })
  expect(await replay.text()).toContain('You’ve been logged out.')

  // A valid payload with A's own session, but from another site: refused by the Origin check.
  const csrf = await page.request.fetch('/', {
    method: 'POST',
    headers: { 'next-action': action!.id, origin: 'https://evil.example', 'content-type': 'text/plain;charset=UTF-8', accept: 'text/x-component' },
    data: action!.body.replace(`,"business_id":"${b.businessId}"`, ''),
  })
  expect(csrf.status()).toBe(500)

  const [{ data: bRows }, { data: aRows }] = await Promise.all([
    b.client.from('entries').select('id'), a.client.from('entries').select('id'),
  ])
  expect(bRows).toEqual([])
  expect(aRows).toEqual([])
})

test('only the real static files skip the login redirect', async ({ request }) => {
  for (const path of ['/icon.svg', '/apple-icon.png', '/icon-192.png', '/manifest.webmanifest']) {
    expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(200)
  }
  for (const path of ['/anything.png', '/robots.txt', '/x.svg']) {
    const res = await request.get(path, { maxRedirects: 0 })
    expect(res.status(), path).toBe(307)
    expect(res.headers()['location'], path).toMatch(/\/login$/)
  }
})
