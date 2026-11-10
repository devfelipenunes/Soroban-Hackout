import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],

  define: {
    global: "globalThis",
  },

  server: {
    port: 5173,
    host: true,

    fs: {
      allow: [".."],
    },
  },

  assetsInclude: ["**/*.rs"],

  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
