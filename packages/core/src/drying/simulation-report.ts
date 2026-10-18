import type { PlanSimulation } from "./plan-simulator.js";
import type { DryingDecision } from "./types.js";

function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(Math.round(minutes % 60)).padStart(2, "0")}`;
}

function operationLabel(decision: DryingDecision): string {
  switch (decision.mode) {
    case "off": return "停止";
    case "cool":
    case "heat":
    case "dehumidify": {
      const mode = { cool: "冷房", heat: "暖房", dehumidify: "除湿" }[decision.mode];
      let fan: string;
      const fanSpeed = decision.fanSpeed;
      switch (fanSpeed) {
        case "low": fan = "弱"; break;
        case "medium": fan = "中"; break;
        case "high": fan = "強"; break;
        case undefined: fan = "自動"; break;
        default: {
          const exhaustive: never = fanSpeed;
          return exhaustive;
        }
      }
      return `${mode}${Number(decision.temperature.toFixed(1))}℃・風量${fan}`;
    }
    default: {
      const exhaustive: never = decision;
      return exhaustive;
    }
  }
}

/** LINEとCLIで共通の、経過時間を使った試算レポート。 */
export function formatPlanSimulation(simulation: PlanSimulation): string {
  const initial = simulation.initialContext;
  let presence: string;
  switch (initial.presenceMode) {
    case "home": presence = "在宅中"; break;
    case "away": presence = "外出中"; break;
    default: {
      const exhaustive: never = initial.presenceMode;
      return exhaustive;
    }
  }
  const lines = [
    `6時間の運転シミュレーション（${presence}）`,
    `開始時：室温${initial.indoorTemperature.toFixed(1)}℃・湿度${initial.indoorHumidity.toFixed(1)}%`,
    `外気：${initial.outdoorTemperature.toFixed(1)}℃・湿度${initial.outdoorHumidity.toFixed(1)}%`,
    "経過時間／運転 → 区間終了時の予測室温・湿度・乾燥進捗",
  ];
  for (const step of simulation.steps) {
    lines.push(`${clock(step.startMinute)}〜${clock(step.endMinute)} ${operationLabel(step.decision)} → ${step.indoorTemperature.toFixed(1)}℃・${step.indoorHumidity.toFixed(1)}%・乾燥${(step.dryingProgress * 100).toFixed(0)}%`);
  }
  if (simulation.completedAtMinute === null) {
    lines.push("6時間以内の乾燥完了は予測されませんでした。");
  } else {
    lines.push(`乾燥完了の目安：開始から${clock(simulation.completedAtMinute)}後`);
  }
  lines.push("外気と在宅・外出状態を固定した参考値です。実際の乾燥時間を保証せず、運転の予約・変更は行いません。");
  return lines.join("\n");
}
