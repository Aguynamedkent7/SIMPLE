import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run against a real Supabase project (the one in .env.local).
export default defineConfig({
  testDir: 'tests',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  use: {
    ...devices['iPhone 14'],
    browserName: 'chromium', // iPhone viewport, touch and UA; Chromium engine so no WebKit install needed
    baseURL: 'http://localhost:3000',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/login',
    reuseExistingServer: true,
  },
})
