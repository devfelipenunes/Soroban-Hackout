import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

const ONE_YEAR = 60 * 60 * 24 * 365;
const ONE_MONTH = 60 * 60 * 24 * 30;

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "inline",
      manifest: false,
      devOptions: { enabled: false },
      workbox: {
        globPatterns: [
          "index.html",
          "manifest.webmanifest",
          "assets/index-*.js",
          "assets/*.css",
          "icons/*.png",
          "images/brand/favicon.svg",
        ],
        maximumFileSizeToCacheInBytes: 1024 * 1024,
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        navigationPreload: true,
        navigateFallback: undefined,
        dontCacheBustURLsMatching: /-[A-Za-z0-9_-]{8}\.(?:js|css)$/,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "breaker-pages-v1",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 7 },
              precacheFallback: { fallbackURL: "/index.html" },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/assets/"),
            handler: "CacheFirst",
            options: {
              cacheName: "breaker-assets-v1",
              expiration: { maxEntries: 200, maxAgeSeconds: ONE_YEAR },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/images/"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "breaker-images-v1",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: ONE_MONTH,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/fonts/"),
            handler: "CacheFirst",
            options: {
              cacheName: "breaker-fonts-v1",
              expiration: { maxEntries: 8, maxAgeSeconds: ONE_YEAR },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/icons/"),
            handler: "CacheFirst",
            options: {
              cacheName: "breaker-icons-v1",
              expiration: { maxEntries: 8, maxAgeSeconds: ONE_YEAR },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },

  define: {
    global: "globalThis",
  },

  server: {
    port: 5173,
    host: true,

    allowedHosts: [".trycloudflare.com", "spray-relay-debut-qualities.trycloudflare.com"],

    fs: {
      allow: [".."],
    },
  },

  preview: {
    allowedHosts: [".trycloudflare.com"],
  },

  assetsInclude: ["**/*.rs"],

  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: [
        "src/contracts/**",
        "src/**/*.test.{ts,tsx}",
        "src/levels/casefile.ts",
        "src/levels/story.ts",
        "src/levels/text.ts",
      ],
      thresholds: {
        statements: 39,
        branches: 70,
        functions: 50,
        lines: 39,
      },
    },
  },
});
