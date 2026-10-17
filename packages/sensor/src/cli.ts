import { readFile } from "node:fs/promises";
import { bootConfig } from "./config.js";
import { parseFlipper } from "./flipper.js";
import { transmit } from "./lirc.js";
import { parseRaw } from "./raw.js";
import { learnRemote, loadRemoteControl, saveSignal } from "./remote.js";

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "boot-config" && args.length === 0) {
    process.stdout.write(bootConfig());
  } else if (command === "learn" && args.length === 0) {
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
  } else if (command === "import-flipper" && args.length === 2) {
    const fileContent = await readFile(args[0]!, "utf8");
    const signal = parseFlipper(fileContent, args[1]!);
    const remote = await saveSignal(signal);
    console.log(`学習しました: ${remote.protocol} → data/ir/remote.json`);
  } else if (command === "send-raw" && args.length === 1) {
    const fileContent = await readFile(args[0]!, "utf8");
    await transmit(parseRaw(fileContent));
    console.log("信号ファイルを送信しました。");
  } else if (command === "send" && args.length === 1) {
    const remote = await loadRemoteControl();
    await remote.send(JSON.parse(args[0]!));
    console.log("送信しました。");
  } else if (command === "stop" && args.length === 0) {
    const remote = await loadRemoteControl();
    await remote.stop();
    console.log("停止信号を送信しました。");
  } else {
    throw new Error(
      "Usage: pnpm ir boot-config | learn | send '<JSON>' | stop | send-raw <file> | import-flipper <file.ir> <button>",
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
