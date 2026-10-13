import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 15000,
    reporters: ["default", ["junit", { outputFile: "test-results/app-server.xml" }]],
  },
});
