import { readFile } from "node:fs/promises";
import { bootConfig } from "./config.js";
import { transmit } from "./lirc.js";
import { parseRaw } from "./raw.js";

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "boot-config" && args.length === 0) {
    process.stdout.write(bootConfig());
  } else if (command === "send-raw" && args.length === 1) {
    const fileContent = await readFile(args[0]!, "utf8");
    await transmit(parseRaw(fileContent));
    console.log("信号ファイルを送信しました。");
  } else {
    throw new Error("Usage: pnpm ir boot-config | send-raw <file>");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
