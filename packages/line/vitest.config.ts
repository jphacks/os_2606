import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@os\/core\/drying$/,
        replacement: fileURLToPath(new URL("../core/src/drying/index.ts", import.meta.url)),
      },
      {
        find: /^@os\/core$/,
        replacement: fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
      },
      {
        find: /^@os\/sensor$/,
        replacement: fileURLToPath(new URL("../sensor/src/index.ts", import.meta.url)),
      },
    ],
  },
  test: {
    name: "line",
    include: ["src/**/*.test.ts"],
  },
});
