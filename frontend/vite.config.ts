import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Use existing public/manifest.json — don't generate a new one
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MB to accommodate large banner images
        runtimeCaching: [
          {
            // Album / location list — ok to be slightly stale
            urlPattern: /\/api\/v1\/(albums|locations)/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
          {
            // S3 presigned thumbnail URLs — NetworkFirst, short cache
            urlPattern: /amazonaws\.com|minio/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 's3-thumbs',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 200, maxAgeSeconds: 900 },
            },
          },
        ],
      },
    }),
  ],
})
