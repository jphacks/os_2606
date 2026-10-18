import { readFile } from "node:fs/promises";
import { bootConfig } from "./config.js";
import { parseFlipper } from "./flipper.js";
import { transmit } from "./lirc.js";
import { parseRaw } from "./raw.js";
import { learnRemote, loadRemoteControl, saveSignal } from "./remote.js";
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
    case "learn": {
      if (args.length !== 0) {
        break;
      }
      const abortController = new AbortController();
      const cancelLearning = () => abortController.abort();
      process.once("SIGINT", cancelLearning);
      try {
        console.log(
          "リモコンをON表示にして受信機に向け、温度か運転モードのボタンを1回押してください（15秒以内）。",
        );
        const remote = await learnRemote(abortController.signal);
        console.log(`学習しました: ${remote.protocol} → data/ir/remote.json`);
      } finally {
        process.off("SIGINT", cancelLearning);
      }
      return;
    }
    case "import-flipper": {
      if (args.length !== 2) {
        break;
      }
      const fileContent = await readFile(args[0]!, "utf8");
      const signal = parseFlipper(fileContent, args[1]!);
      const remote = await saveSignal(signal);
      console.log(`学習しました: ${remote.protocol} → data/ir/remote.json`);
      return;
    }
    case "send-raw": {
      if (args.length !== 1) {
        break;
      }
      const fileContent = await readFile(args[0]!, "utf8");
      await transmit(parseRaw(fileContent));
      console.log("信号ファイルを送信しました。");
      return;
    }
    case "send": {
      if (args.length !== 1) {
        break;
      }
      const remote = await loadRemoteControl();
      await remote.send(JSON.parse(args[0]!));
      console.log("送信しました。");
      return;
    }
    case "stop": {
      if (args.length !== 0) {
        break;
      }
      const remote = await loadRemoteControl();
      await remote.stop();
      console.log("停止信号を送信しました。");
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
  throw new Error(
    "使い方: pnpm sensor boot-config | learn | send '<JSON>' | stop | send-raw <file> | import-flipper <file.ir> <button> | measure",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
