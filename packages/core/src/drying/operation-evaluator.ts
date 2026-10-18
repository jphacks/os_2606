import { generateOperationCandidates } from "./candidate-generator.js";
import { DEFAULT_DRYING_CONFIG } from "./config.js";
import { simulateEnvironment } from "./environment-simulator.js";
import type { DryingConfig, DryingContext, EvaluatedOperation } from "./types.js";

/** コストは電力量ではない。在室時だけ暫定の風量快適性ペナルティを追加する。 */
export function evaluateOperations(context: DryingContext, config: DryingConfig = DEFAULT_DRYING_CONFIG): EvaluatedOperation[] {
  const simulations = generateOperationCandidates(context, config).map((operation) => ({
    operation,
    ...simulateEnvironment(context, operation, config),
  }));
  const maximumGain = Math.max(0, ...simulations.map((result) => result.estimatedProgressGain));
  return simulations.map((result) => {
    let normalizedGain = 0;
    if (maximumGain > 0) normalizedGain = result.estimatedProgressGain / maximumGain;
    let comfortPenalty = 0;
    if (context.presenceMode === "home" && result.operation.mode !== "off") {
      comfortPenalty = config.simulator.fanComfortPenalty[result.operation.fanSpeed ?? "medium"];
    }
    // 温度差2℃の二乗を基準に、快適性も0〜1未満へ単調に正規化する。
    // 二乗誤差をそのまま加えて乾燥の評価を圧倒することを避ける。
    const discomfort = result.temperaturePenalty / (2 ** 2) + comfortPenalty;
    const normalizedDiscomfort = discomfort / (1 + discomfort);
    return {
      ...result,
      score: -config.dryingWeight * normalizedGain + (1 - config.dryingWeight) * normalizedDiscomfort,
    };
  });
}
