import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run against a real Supabase project (the one in .env.local).
// BASE_URL=https://… npm run test:e2e runs them against a deployment instead of a local build.
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
    // Production build: the 3 second "Try it now" budget is about the real app, not dev compiles.
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000/login',
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
