import { defineConfig } from '@playwright/test'

// Public workspace smoke tests. Retired connected-app tests remain in e2e/legacy.
export default defineConfig({
  testDir: 'e2e',
  testIgnore: '**/legacy/**',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:5174', screenshot: 'only-on-failure' },
  outputDir: 'e2e/.results',
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: !process.env.CI,
  },
})
