import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.mjs"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/ocr/client.ts", "src/lib/ai/client.ts"],
      thresholds: {
        lines: 50,
        functions: 40,
        branches: 50,
        statements: 50,
      },
    },
  },
});
