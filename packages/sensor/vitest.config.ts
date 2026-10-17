import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "sensor",
    include: ["src/**/*.test.ts"],
  },
});
