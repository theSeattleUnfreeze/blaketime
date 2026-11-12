import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["packages/ui/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
    environment: "jsdom",
  },
});
