import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "ui",
          include: ["packages/ui/**/*.test.{ts,tsx}"],
          environment: "jsdom",
        },
      },
      {
        test: {
          name: "tools",
          include: ["tests/**/*.test.{ts,mjs}"],
          environment: "node",
        },
      },
    ],
  },
});
