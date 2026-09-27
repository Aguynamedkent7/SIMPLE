import { defineConfig, devices } from '@playwright/test'
import { SUPABASE_KEY, SUPABASE_URL } from './tests/support'

// End-to-end tests run against LOCAL Supabase (`npx supabase start`), never production:
// they read confirmation emails from the local Mailpit inbox.
const baseURL = process.env.BASE_URL
export default defineConfig({
  testDir: 'tests',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  use: {
    ...devices['iPhone 14'],
    browserName: 'chromium', // iPhone viewport, touch and UA; Chromium engine so no WebKit install needed
    baseURL: baseURL ?? 'http://localhost:3000',
  },
  webServer: baseURL ? undefined : {
    // Production build, so the CSP and headers under test are the real ones.
    command: 'npm run build && npm run start',
    env: { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: SUPABASE_KEY },
    url: 'http://localhost:3000/login',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
