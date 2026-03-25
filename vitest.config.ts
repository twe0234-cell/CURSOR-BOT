import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    // Explicit imports (no globals) keep tests readable and avoids IDE confusion.
    globals: false,
    // Reset all mock state between tests automatically.
    clearMocks: true,
    // Only look for test files inside src/ – avoids scanning node_modules or .next.
    include: ["src/**/*.test.ts"],
  },
});
