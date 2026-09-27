import { expect, test, type Page } from '@playwright/test'

// Seeded demo month (supabase/migrations: seed_demo): in $9,050, out $1,211.25.
const SEED = { in: '$9,050', out: '$1,211.25', profit: '$7,838.75' }

async function tryItNow(page: Page, timeout = 10_000) {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Try it now' }).click()
  await expect(page.getByTestId('profit')).toHaveText(SEED.profit, { timeout })
}

async function addJob(page: Page, customer: string, job: string, price: string) {
  await page.getByRole('button', { name: 'Job done' }).click()
  await page.getByRole('textbox', { name: 'Customer', exact: true }).fill(customer)
  await page.getByRole('textbox', { name: 'Job', exact: true }).fill(job)
  await page.getByRole('textbox', { name: 'Price', exact: true }).fill(price)
  await page.getByRole('button', { name: 'Save job' }).click()
}

test('a signed-out visit goes to the login screen', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
})

test('Try it now lands on a seeded month within 3 seconds', async ({ page, browser }) => {
  // Warm the server first: the budget is for the reviewer's tap, not a cold start.
  await tryItNow(await (await browser.newContext()).newPage())
  await tryItNow(page, 3000)
  await expect(page.getByTestId('in')).toHaveText(SEED.in)
  await expect(page.getByTestId('out')).toHaveText(SEED.out)
  await expect(page.getByText('In the black')).toBeVisible()
})

test('Job done adds the exact price to In and Profit', async ({ page }) => {
  await tryItNow(page)
  await addJob(page, 'Walsh', 'Switchboard upgrade', '850.50')
  await expect(page.getByTestId('in')).toHaveText('$9,900.50')
  await expect(page.getByTestId('profit')).toHaveText('$8,689.25')
  await expect(page.getByText('Job saved')).toBeVisible()
  await page.reload() // and it really saved
  await expect(page.getByTestId('in')).toHaveText('$9,900.50')
})

test('Undo after a save takes it back out', async ({ page }) => {
  await tryItNow(page)
  await addJob(page, 'Walsh', 'Blocked drain', '385')
  await expect(page.getByTestId('in')).toHaveText('$9,435')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByTestId('in')).toHaveText(SEED.in)
  await expect(page.getByText('Walsh')).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('in')).toHaveText(SEED.in)
})

test('spending past zero turns the hero red', async ({ page }) => {
  await tryItNow(page)
  await page.getByRole('button', { name: 'Spent' }).click()
  await page.getByRole('textbox', { name: 'What for', exact: true }).fill('New ute')
  await page.getByRole('textbox', { name: 'Amount', exact: true }).fill('9000')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByTestId('profit')).toHaveText('−$1,161.25')
  await expect(page.getByText('In the red')).toBeVisible()
})

test('delete, then Undo brings it back', async ({ page }) => {
  await tryItNow(page)
  await page.getByRole('button', { name: /Kaur/ }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByTestId('in')).toHaveText('$8,090')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByTestId('in')).toHaveText(SEED.in)
  await page.reload()
  await expect(page.getByRole('button', { name: /Kaur/ })).toBeVisible()
})

test('the customer field suggests past customers', async ({ page }) => {
  await tryItNow(page)
  await page.getByRole('button', { name: 'Job done' }).click()
  await page.getByRole('textbox', { name: 'Customer', exact: true }).fill('ng')
  await page.getByRole('button', { name: 'Nguyen', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Customer', exact: true })).toHaveValue('Nguyen')
  await expect(page.getByRole('textbox', { name: 'Job', exact: true })).toBeFocused()
})

test('Save job stays disabled until the price is valid', async ({ page }) => {
  await tryItNow(page)
  await page.getByRole('button', { name: 'Job done' }).click()
  await page.getByRole('textbox', { name: 'Customer', exact: true }).fill('Walsh')
  await page.getByRole('textbox', { name: 'Job', exact: true }).fill('Hot water system')
  const save = page.getByRole('button', { name: 'Save job' })
  for (const bad of ['', '0', 'abc', '-50']) {
    await page.getByRole('textbox', { name: 'Price', exact: true }).fill(bad)
    await expect(save).toBeDisabled()
  }
  await page.getByRole('textbox', { name: 'Price', exact: true }).fill('850')
  await expect(save).toBeEnabled()
})

test('one user cannot see another user’s entries', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage()
  const b = await (await browser.newContext()).newPage()
  const secret = `Private ${Date.now()}`
  await tryItNow(a)
  await addJob(a, secret, 'Rewire', '1000')
  await expect(a.getByText(secret)).toBeVisible()

  await tryItNow(b)
  await expect(b.getByTestId('in')).toHaveText(SEED.in)
  await expect(b.getByText(secret)).toHaveCount(0)
  await b.getByRole('button', { name: 'Job done' }).click()
  await b.getByRole('textbox', { name: 'Customer', exact: true }).fill('Private')
  await expect(b.getByRole('button', { name: secret })).toHaveCount(0)
})

test('email: a new address makes an account, then signs back in', async ({ page }) => {
  const email = `tradie.${Date.now()}@gmail.com`
  const signIn = async (password: string) => {
    await page.goto('/login')
    await page.getByText('Sign in with email').click()
    await page.getByRole('textbox', { name: 'Email' }).fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  }

  await signIn('hotwater42')
  await expect(page.getByText('No jobs yet this month. Tap Job done when you finish one.'))
    .toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('profit')).toHaveText('$0')

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)

  await signIn('wrong-password')
  await expect(page.getByRole('alert').filter({ hasText: 'password' }))
    .toHaveText('That password doesn’t match this email. Try again.')
  await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue(email)

  await page.getByLabel('Password').fill('hotwater42')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByTestId('profit')).toHaveText('$0', { timeout: 10_000 })
})

test('email: bad input gets a plain fix-it message', async ({ page }) => {
  await page.goto('/login')
  await page.getByText('Sign in with email').click()
  await page.getByRole('textbox', { name: 'Email' }).fill('sam@')
  await page.getByLabel('Password').fill('hotwater42')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'email' }))
    .toHaveText('Enter a full email address, like sam@example.com.')
  await page.getByRole('textbox', { name: 'Email' }).fill('sam@example.com')
  await page.getByLabel('Password').fill('123')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'characters' }))
    .toHaveText('Your password needs at least 6 characters.')
})
