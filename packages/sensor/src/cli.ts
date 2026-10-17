import { readFile } from "node:fs/promises";
import { bootConfig } from "./config.js";
import { transmit } from "./lirc.js";
import { parseRaw } from "./raw.js";
import { loadTemperatureSensor } from "./temperature.js";

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "boot-config":
      if (args.length !== 0) {
        break;
      }
      process.stdout.write(bootConfig());
      return;
    case "send-raw": {
      if (args.length !== 1) {
        break;
      }
      const fileContent = await readFile(args[0]!, "utf8");
      await transmit(parseRaw(fileContent));
      console.log("信号ファイルを送信しました。");
      return;
    }
    case "measure": {
      if (args.length !== 0) {
        break;
      }
      const sensor = await loadTemperatureSensor();
      console.log(JSON.stringify(await sensor.measure()));
      return;
    }
  }
  throw new Error("使い方: pnpm sensor boot-config | send-raw <file> | measure");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
