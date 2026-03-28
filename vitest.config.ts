import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Separate from vite.config.ts — must NOT include the reactRouter() plugin,
// which performs React Router-specific transforms incompatible with test mode.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Containers need time to pull images and start on first run
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
