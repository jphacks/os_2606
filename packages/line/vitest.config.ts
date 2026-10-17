import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "line",
    include: ["src/**/*.test.ts"],
  },
});
