import type { Page } from '@playwright/test'
import { PASSWORD } from './support'

export async function logIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
}

export async function openMenu(page: Page) {
  await page.getByRole('button', { name: 'Menu' }).click()
}
