/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'SiteMesh',
        short_name: 'SiteMesh',
        description: '3D construction coordination and daily progress',
        theme_color: '#1f6feb',
        background_color: '#f6f7f9',
        display: 'standalone',
        start_url: '/field',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Model geometry: big and versioned by URL, so cache-first.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/models/') && url.pathname.endsWith('.glb'),
            handler: 'CacheFirst',
            options: { cacheName: 'model-meshes', expiration: { maxEntries: 40 } },
          },
          {
            // Everything else read-only: network first, cached copy when there's no signal.
            urlPattern: ({ url, request }) => url.pathname.startsWith('/api/') && request.method === 'GET',
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
