import { simulateEnvironment } from "./environment-simulator.js";
import type { DryingConfig, DryingContext, Operation } from "./types.js";

/** 有限時間で打ち切る。上限内に完了しないことは、乾燥不能を意味しない。 */
const MAX_PREDICTION_MINUTES = 7 * 24 * 60;

/** 検証済みの入力で、設定と外気を固定したまま完了までの温湿度・進捗を積算する。 */
export function predictCompletionHours(context: DryingContext, operation: Operation, config: DryingConfig): number {
  let state = { ...context, dryingProgress: context.dryingProgress ?? 0 };
  if (state.dryingProgress === 1) return 0;
  const stepConfig = { ...config, evaluationMinutes: config.stepMinutes };
  const maximumSteps = Math.floor(MAX_PREDICTION_MINUTES / config.stepMinutes);
  for (let step = 1; step <= maximumSteps; step++) {
    const result = simulateEnvironment(state, operation, stepConfig);
    state = {
      ...state,
      indoorTemperature: result.predictedTemperature,
      indoorHumidity: result.predictedHumidity,
      dryingProgress: Math.min(1, state.dryingProgress + result.estimatedProgressGain),
    };
    if (state.dryingProgress === 1) return step * config.stepMinutes / 60;
  }
  return Infinity;
}
