import { defineConfig } from '@playwright/test'

// End-to-end smoke tests. Starts a fresh backend (SQLite in a temp file) and the Vite dev server.
const DB = `sqlite:///${process.env.E2E_DB ?? '/tmp/sitemesh-e2e.db'}`

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:5174', screenshot: 'only-on-failure' },
  outputDir: 'e2e/.results',
  webServer: [
    {
      command: `rm -f ${DB.replace('sqlite:///', '')} && DATABASE_URL=${DB} .venv/bin/alembic upgrade head && DATABASE_URL=${DB} .venv/bin/python -m app.seed && DATABASE_URL=${DB} .venv/bin/uvicorn app.main:app --port 8001`,
      cwd: '../backend',
      url: 'http://localhost:8001/api/health',
      env: { JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e-secret', CORS_ORIGINS: '["http://localhost:5174"]' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npx vite --port 5174 --strictPort',
      url: 'http://localhost:5174',
      env: { API_URL: 'http://localhost:8001' },
      reuseExistingServer: false,
    },
  ],
})
