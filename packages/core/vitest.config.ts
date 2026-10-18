import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@os\/core\/drying$/,
        replacement: fileURLToPath(new URL("./src/drying/index.ts", import.meta.url)),
      },
    ],
  },
  test: {
    name: "core",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
  },
});
