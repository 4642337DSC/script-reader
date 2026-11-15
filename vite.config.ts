import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Script Reader',
        short_name: 'Scripts',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#101114',
        theme_color: '#101114',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,png}'] },
    }),
  ],
  base: './',
  test: { environment: 'jsdom', globals: false, exclude: ['test/**', 'node_modules/**'] },
});
