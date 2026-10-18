import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { formatPlanSimulation, simulateDryingPlan } from "./drying/index.js";
import type { DryingContext } from "./drying/index.js";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      format: { type: "string", default: "text" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log("使い方: pnpm simulate:drying [--input <環境JSONファイル>] [--format text|json]\n省略時は室温24℃・湿度70%、外気18℃・湿度60%、在宅で6時間を試算します。");
    return;
  }
  let context: DryingContext = {
    indoorTemperature: 24, indoorHumidity: 70,
    outdoorTemperature: 18, outdoorHumidity: 60,
    presenceMode: "home", comfortTemperature: 24, dryingProgress: 0,
  };
  if (values.input !== undefined) {
    // 数値・在宅状態等はsimulateDryingPlanで検証する。
    context = JSON.parse(await readFile(values.input, "utf8"));
    if (!context || typeof context !== "object" || Array.isArray(context)) {
      throw new Error("入力は環境を指定したJSONオブジェクトにしてください。");
    }
  }
  switch (values.format) {
    case "text":
      console.log(formatPlanSimulation(simulateDryingPlan(context)));
      return;
    case "json":
      // JSONではInfinityを表現できないため、予測不能の時間はnullにする。
      console.log(JSON.stringify(simulateDryingPlan(context), (_key, value: unknown) => {
        if (typeof value === "number" && !Number.isFinite(value)) return null;
        return value;
      }, 2));
      return;
    default:
      throw new Error("--formatはtextまたはjsonを指定してください。");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
