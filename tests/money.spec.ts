import { expect, test, type Page } from '@playwright/test'
import { logIn } from './e2e'
import { confirmedUser } from './support'

// A realistic month so far, written as the account's own user (RLS applies): in $9,050.00, out $1,211.25.
const SEED = { in: '$9,050.00', out: '$1,211.25', profit: '$7,838.75' }
const ROWS = [
  ['in', 'Nguyen', 'Hot water system', 189000], ['out', null, 'Reece Plumbing', 64250],
  ['in', 'Smith', 'Blocked drain', 38500], ['out', null, 'Fuel', 9840],
  ['in', 'Papadopoulos', 'Switchboard upgrade', 245000], ['out', null, 'Bunnings supplies', 21275],
  ['in', 'O’Brien', 'Leaking tap', 16500], ['in', 'Harris Build', 'Bathroom rough-in', 320000],
  ['out', null, 'Tool repair', 14500], ['in', 'Kaur', 'Downlights x8', 96000], ['out', null, 'Fuel', 11260],
] as const

/** A fresh confirmed account with a seeded month, logged in on this page. */
async function seededAccount(page: Page) {
  const user = await confirmedUser('Walsh Plumbing')
  const { error } = await user.client.from('entries').insert(ROWS.map(([type, customer, description, amount_cents], i) => ({
    business_id: user.businessId, type, customer, description, amount_cents,
    occurred_at: new Date(Date.now() - (ROWS.length - i) * 60_000).toISOString(),
  })))
  if (error) throw error
  await logIn(page, user.email)
  await expect(page.getByTestId('profit')).toHaveText(SEED.profit, { timeout: 10_000 })
  return user
}

async function addJob(page: Page, customer: string, job: string, price: string) {
  await page.getByRole('button', { name: 'Job done' }).click()
  await page.getByRole('textbox', { name: 'Customer', exact: true }).fill(customer)
  await page.getByRole('textbox', { name: 'Job', exact: true }).fill(job)
  await page.getByRole('textbox', { name: 'Price', exact: true }).fill(price)
  await page.getByRole('button', { name: 'Save job' }).click()
}

test('a seeded month shows its totals and pages through entries', async ({ page }) => {
  await seededAccount(page)
  await expect(page.getByTestId('in')).toHaveText(SEED.in)
  await expect(page.getByTestId('out')).toHaveText(SEED.out)
  await expect(page.getByText('In the black')).toBeVisible()

  // 11 seeded entries: 8 at first, Load more shows the rest, then Back to top returns.
  const rows = page.locator('li button[aria-expanded]')
  await expect(rows).toHaveCount(8)
  await page.getByRole('link', { name: 'Load more' }).click()
  await expect(rows).toHaveCount(11)
  await expect(page.getByRole('link', { name: 'Load more' })).toHaveCount(0)
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
  await page.getByRole('button', { name: 'Back to top' }).click()
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
})

test('Job done adds the exact price to In and Profit', async ({ page }) => {
  await seededAccount(page)
  await addJob(page, 'Walsh', 'Switchboard upgrade', '850.50')
  await expect(page.getByTestId('in')).toHaveText('$9,900.50')
  await expect(page.getByTestId('profit')).toHaveText('$8,689.25')
  await expect(page.getByText('Job saved')).toBeVisible()
  await page.reload() // and it really saved
  await expect(page.getByTestId('in')).toHaveText('$9,900.50')
})

test('Undo after a save takes it back out', async ({ page }) => {
  await seededAccount(page)
  await addJob(page, 'Walsh', 'Blocked drain', '385')
  await expect(page.getByTestId('in')).toHaveText('$9,435.00')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByTestId('in')).toHaveText(SEED.in)
  await expect(page.getByText('Walsh ·')).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('in')).toHaveText(SEED.in)
})

test('spending past zero turns the hero red', async ({ page }) => {
  await seededAccount(page)
  await page.getByRole('button', { name: 'Spent' }).click()
  await page.getByRole('textbox', { name: 'What for', exact: true }).fill('New ute')
  await page.getByRole('textbox', { name: 'Amount', exact: true }).fill('9000')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByTestId('profit')).toHaveText('−$1,161.25')
  await expect(page.getByText('In the red')).toBeVisible()
})

test('delete, then Undo brings it back', async ({ page }) => {
  await seededAccount(page)
  await page.getByRole('button', { name: /Kaur/ }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByTestId('in')).toHaveText('$8,090.00')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByTestId('in')).toHaveText(SEED.in)
  await page.reload()
  await expect(page.getByRole('button', { name: /Kaur/ })).toBeVisible()
})

test('the customer field suggests past customers', async ({ page }) => {
  await seededAccount(page)
  await page.getByRole('button', { name: 'Job done' }).click()
  await page.getByRole('textbox', { name: 'Customer', exact: true }).fill('ng')
  await page.getByRole('button', { name: 'Nguyen', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Customer', exact: true })).toHaveValue('Nguyen')
  await expect(page.getByRole('textbox', { name: 'Job', exact: true })).toBeFocused()
})

test('Save job says exactly what is missing or wrong', async ({ page }) => {
  await seededAccount(page)
  await page.getByRole('button', { name: 'Job done' }).click()
  const save = page.getByRole('button', { name: 'Save job' })
  const price = page.getByRole('textbox', { name: 'Price', exact: true })

  await save.click()
  await expect(page.getByText('Add who the job was for.')).toBeVisible()
  await expect(page.getByText('Add what the job was.')).toBeVisible()
  await expect(page.getByText('Add the price.')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Customer', exact: true })).toBeFocused()

  await page.getByRole('textbox', { name: 'Customer', exact: true }).fill('Walsh')
  await page.getByRole('textbox', { name: 'Job', exact: true }).fill('Hot water system')
  await expect(page.getByText('Add who the job was for.')).toHaveCount(0)
  for (const bad of ['0', 'abc', '-50', '12,5', '385.555']) {
    await price.fill(bad)
    await expect(page.getByText('Dollars and cents only')).toBeVisible()
    await expect(price).toHaveAttribute('aria-invalid', 'true')
  }
  await price.fill('850')
  await expect(page.getByText('Dollars and cents only')).toBeHidden()
  await expect(price).toHaveAttribute('aria-invalid', 'false')

  // Back (or an iOS edge swipe) closes the sheet and stays in the app.
  await page.goBack()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByTestId('profit')).toHaveText(SEED.profit)
})
