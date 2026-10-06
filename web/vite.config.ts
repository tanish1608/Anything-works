/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'design-assets/*.jpg'],
      manifest: {
        name: 'Placeholder AI',
        short_name: 'Placeholder AI',
        description: 'Daily construction updates, progress and issues in 3D',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Model geometry: big and versioned by URL, so cache-first.
            urlPattern: ({ url, request }) => !request.headers.has('Authorization') && url.pathname.startsWith('/api/models/') && url.pathname.endsWith('.glb'),
            handler: 'CacheFirst',
            options: { cacheName: 'model-meshes', expiration: { maxEntries: 40 } },
          },
          {
            // Shared devices must not replay another member's authenticated records from a service-worker cache.
            urlPattern: ({ url, request }) => url.pathname.startsWith('/api/') && request.method === 'GET'
              && !request.headers.has('Authorization') && !/\/(auth|agent|uploads|photos)\//.test(url.pathname),
            handler: 'NetworkFirst',
            options: { cacheName: 'api', networkTimeoutSeconds: 4, expiration: { maxEntries: 300, maxAgeSeconds: 7 * 24 * 3600 } },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:8000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
