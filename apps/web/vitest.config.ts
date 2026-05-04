import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["lib/**/*.test.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
  resolve: {
    alias: {
      // tsconfig paths: "@/*" -> "./*" (app root, not ./src)
      "@": path.resolve(__dirname, "."),
      // server-only is a Next.js guard; stub it out in the test environment
      "server-only": path.resolve(__dirname, "__tests__/mocks/server-only.ts"),
    },
  },
})
