import { expect, test } from '@playwright/test'
import { logIn, openMenu } from './e2e'
import { anon, confirmedUser, emailToken, PASSWORD, totp, uniqueEmail } from './support'

test('a signed-out visit goes to the login screen', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
})

test('sign up, confirm by email, land on an empty month under the business name', async ({ page }) => {
  const email = uniqueEmail('signup')
  await page.goto('/signup')
  await page.getByRole('textbox', { name: 'Business name' }).fill('Walsh Plumbing')
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  const password = page.getByLabel('Password', { exact: true })
  await expect(password).toHaveAttribute('autocomplete', 'new-password')
  await password.fill('short1')
  await expect(page.getByText('Needs 6 more characters.')).toBeVisible()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.locator('p[role=alert]')).toHaveText('Use at least 12 characters.')

  await password.fill(PASSWORD)
  await expect(page.getByText('Strong enough.')).toBeVisible()
  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Check your email to confirm your account.')).toBeVisible()

  await page.goto(`/auth/confirm?token_hash=${await emailToken(email)}&type=email`)
  await expect(page.getByText('Walsh Plumbing')).toBeVisible()
  await expect(page.getByTestId('profit')).toHaveText('$0.00')

  // Job done → totals update.
  await page.getByRole('button', { name: 'Job done' }).click()
  await page.getByRole('textbox', { name: 'Customer', exact: true }).fill('Nguyen')
  await page.getByRole('textbox', { name: 'Job', exact: true }).fill('Hot water system')
  await page.getByRole('textbox', { name: 'Price', exact: true }).fill('1890')
  await page.getByRole('button', { name: 'Save job' }).click()
  await expect(page.getByTestId('in')).toHaveText('$1,890.00')
  await page.reload()
  await expect(page.getByTestId('profit')).toHaveText('$1,890.00')
})

test('a used or fake confirm link says so', async ({ page }) => {
  await page.goto('/auth/confirm?token_hash=nope&type=email')
  await expect(page).toHaveURL(/\/login\?link=expired$/)
  await expect(page.getByText('That link has expired or was already used.')).toBeVisible()
})

test('wrong password and unknown email get the same answer', async ({ page }) => {
  const user = await confirmedUser('Echo Tiling')
  await logIn(page, user.email, 'wrong password 1')
  await expect(page.locator('p[role=alert]')).toContainText('Email or password is wrong.')
  await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue(user.email)
  await logIn(page, uniqueEmail('nobody'))
  await expect(page.locator('p[role=alert]')).toContainText('Email or password is wrong.')
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('autocomplete', 'current-password')
})

test('password reset: same message for any email, link sets a new password', async ({ page }) => {
  const user = await confirmedUser('Foxtrot Fencing')
  for (const email of [uniqueEmail('nobody'), user.email]) {
    await page.goto('/login')
    await page.getByRole('link', { name: 'Forgot password?' }).click()
    await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Email' }).fill(email)
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByText('If that email has an account, we’ve sent a reset link.')).toBeVisible()
  }
  await page.goto(`/auth/confirm?token_hash=${await emailToken(user.email)}&type=recovery`)
  await expect(page).toHaveURL(/\/update-password$/)
  await page.getByLabel('New password', { exact: true }).fill('brand new password 7')
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Foxtrot Fencing')).toBeVisible()

  await openMenu(page)
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await logIn(page, user.email, 'brand new password 7')
  await expect(page.getByText('Foxtrot Fencing')).toBeVisible()
})

test('A’s numbers never appear for B', async ({ browser }) => {
  const [a, b] = await Promise.all([confirmedUser('Alpha Plumbing'), confirmedUser('Bravo Electrical')])
  const secret = `Private ${Date.now()}`
  await a.client.from('entries').insert({ business_id: a.businessId, type: 'in', customer: secret, description: 'Rewire', amount_cents: 123456 })

  const pageA = await (await browser.newContext()).newPage()
  const pageB = await (await browser.newContext()).newPage()
  await logIn(pageA, a.email)
  await logIn(pageB, b.email)
  await expect(pageA.getByText(`${secret} · Rewire`)).toBeVisible()
  await expect(pageA.getByTestId('in')).toHaveText('$1,234.56')
  await expect(pageB.getByText('Bravo Electrical')).toBeVisible()
  await expect(pageB.getByTestId('in')).toHaveText('$0.00')
  await expect(pageB.getByText(secret)).toHaveCount(0)
  await pageB.getByRole('button', { name: 'Job done' }).click()
  await pageB.getByRole('textbox', { name: 'Customer', exact: true }).fill('Private')
  await expect(pageB.getByRole('button', { name: secret })).toHaveCount(0)
})

test('Log out everywhere ends the session on other devices', async ({ browser }) => {
  const user = await confirmedUser('Golf Glazing')
  const phone = await (await browser.newContext()).newPage()
  const laptop = await (await browser.newContext()).newPage()
  await logIn(phone, user.email)
  await logIn(laptop, user.email)
  await expect(phone.getByText('Golf Glazing')).toBeVisible()
  await expect(laptop.getByText('Golf Glazing')).toBeVisible()

  await openMenu(laptop)
  await laptop.getByRole('button', { name: 'Log out everywhere' }).click()
  await expect(laptop).toHaveURL(/\/login$/)
  await phone.reload()
  await expect(phone).toHaveURL(/\/login$/)
})

test('2-step login: turn it on, then logging in asks for the code', async ({ page }) => {
  const user = await confirmedUser('Hotel Hvac')
  await logIn(page, user.email)
  await openMenu(page)
  await page.getByRole('link', { name: '2-step login' }).click()
  await page.getByRole('button', { name: 'Turn on 2-step login' }).click()
  await expect(page.getByRole('img', { name: 'QR code for your authenticator app' })).toBeVisible()
  const secret = (await page.locator('.select-all').textContent())!.trim()
  await page.getByRole('textbox', { name: '6-digit code' }).fill('000000')
  await page.getByRole('button', { name: 'Turn it on' }).click()
  await expect(page.locator('p[role=alert]')).toContainText('That code didn’t work.')
  await page.getByRole('textbox', { name: '6-digit code' }).fill(totp(secret))
  await page.getByRole('button', { name: 'Turn it on' }).click()
  await expect(page.getByText('Hotel Hvac')).toBeVisible()

  await openMenu(page)
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await logIn(page, user.email)
  await expect(page).toHaveURL(/\/mfa$/)
  await page.goto('/') // password alone doesn't get you in
  await expect(page).toHaveURL(/\/mfa$/)
  await page.getByRole('textbox', { name: '6-digit code' }).fill(totp(secret))
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('Hotel Hvac')).toBeVisible()
})

test('an unconfirmed account gets the same login answer as a wrong password', async ({ page }) => {
  const email = uniqueEmail('unconfirmed')
  await anon().auth.signUp({ email, password: PASSWORD, options: { data: { business_name: 'Lima Lining' } } })
  await logIn(page, email) // right password, email not confirmed
  const alert = page.locator('p[role=alert]')
  await expect(alert).toContainText('Email or password is wrong.')
  const right = await alert.textContent()
  await logIn(page, email, 'wrong password 1')
  await expect(alert).toHaveText(right!)
})

test('signing up with an existing email looks the same as a new one', async ({ page }) => {
  const user = await confirmedUser('Mike Masonry')
  await page.goto('/signup')
  await page.getByRole('textbox', { name: 'Business name' }).fill('Copycat')
  await page.getByRole('textbox', { name: 'Email' }).fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Check your email to confirm your account.')).toBeVisible()
})
