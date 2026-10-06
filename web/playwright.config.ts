import { defineConfig } from '@playwright/test'

// Public workspace smoke tests. Retired connected-app tests remain in e2e/legacy.
export default defineConfig({
  testDir: 'e2e',
  testIgnore: '**/legacy/**',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:5174', screenshot: 'only-on-failure' },
  outputDir: 'e2e/.results',
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
  },
})
