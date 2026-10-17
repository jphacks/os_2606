import { DEFAULT_DRYING_CONFIG } from "./config.js";
import { evaluateOperations } from "./operation-evaluator.js";
import type { DryingConfig, DryingContext, DryingDecision, Operation } from "./types.js";

function temperatureChange(operation: Operation, context: DryingContext): number {
  if (operation.mode === "off") return 0;
  return Math.abs(operation.temperature - context.indoorTemperature);
}

/** 同点では設定温度と現在室温の差を優先し、その後は候補生成順で決定する。 */
export function decideNextOperation(context: DryingContext, config: DryingConfig = DEFAULT_DRYING_CONFIG): DryingDecision {
  const candidates = evaluateOperations(context, config);
  candidates.sort((a, b) => a.score - b.score || temperatureChange(a.operation, context) - temperatureChange(b.operation, context));
  const best = candidates[0];
  if (!best) throw new RangeError("No supported operation candidates");
  let reason = "現在室温を基準に、推定乾燥進捗と温度変化のコストを比較しました。";
  if (context.presenceMode === "home") {
    reason = "快適温度と風量を考慮し、運転を継続する候補のコストを比較しました。";
  }
  return {
    ...best.operation,
    estimatedProgressGain: best.estimatedProgressGain,
    predictedTemperature: best.predictedTemperature,
    predictedHumidity: best.predictedHumidity,
    score: best.score,
    nextEvaluationMinutes: config.evaluationMinutes,
    reason,
  };
}
