import { DEFAULT_DRYING_CONFIG } from "./config.js";
import { simulateEnvironment } from "./environment-simulator.js";
import { decideNextOperation } from "./operation-planner.js";
import type { DryingConfig, DryingContext, DryingDecision } from "./types.js";
import { validateConfig, validateContext } from "./validation.js";

export interface PlanSimulationStep {
  startMinute: number;
  endMinute: number;
  decision: DryingDecision;
  indoorTemperature: number;
  indoorHumidity: number;
  dryingProgress: number;
}

export interface PlanSimulation {
  initialContext: DryingContext;
  durationMinutes: 360;
  /** 未校正モデルで進捗1に達した時刻。6時間内に達しない場合はnull。 */
  completedAtMinute: number | null;
  steps: PlanSimulationStep[];
}

/**
 * 外気・在宅状態を固定し、評価間隔ごとに再計画して6時間分を試算する。
 * センサー・実機・時計・保存にはアクセスしない。各行の温湿度と進捗は区間末尾の値。
 * 完了後は停止して残りの時間を計算する。予測中の計画は実運転へ登録しない。
 */
export function simulateDryingPlan(
  context: DryingContext,
  config: DryingConfig = DEFAULT_DRYING_CONFIG,
): PlanSimulation {
  validateContext(context);
  validateConfig(config);
  const initialContext = { ...context, dryingProgress: context.dryingProgress ?? 0 };
  let state = { ...initialContext };
  let completedAtMinute: number | null = null;
  if (state.dryingProgress === 1) completedAtMinute = 0;
  const steps: PlanSimulationStep[] = [];
  let elapsed = 0;
  while (elapsed < 360) {
    let decision: DryingDecision;
    if (state.dryingProgress === 1) {
      decision = { mode: "off", estimatedDryingHours: 0 };
    } else {
      decision = decideNextOperation(state, config);
    }
    const evaluationEnd = Math.min(360, elapsed + config.evaluationMinutes);
    while (elapsed < evaluationEnd) {
      const minutes = Math.min(config.stepMinutes, evaluationEnd - elapsed);
      let activeDecision = decision;
      let environmentContext: DryingContext = state;
      let environmentConfig = config;
      if (state.dryingProgress === 1) {
        activeDecision = { mode: "off", estimatedDryingHours: 0 };
        // 完了後の停止は、在宅時に運転候補を停止から除外する制約とは別。
        environmentContext = { ...state, presenceMode: "away" };
        environmentConfig = { ...config, capabilities: { ...config.capabilities, allowOff: true } };
      }
      const result = simulateEnvironment(environmentContext, activeDecision, {
        ...environmentConfig, evaluationMinutes: minutes, stepMinutes: minutes,
      });
      state = {
        ...state,
        indoorTemperature: result.predictedTemperature,
        indoorHumidity: result.predictedHumidity,
        dryingProgress: Math.min(1, state.dryingProgress + result.estimatedProgressGain),
      };
      const endMinute = elapsed + minutes;
      if (completedAtMinute === null && state.dryingProgress === 1) completedAtMinute = endMinute;
      steps.push({
        startMinute: elapsed, endMinute, decision: { ...activeDecision },
        indoorTemperature: state.indoorTemperature,
        indoorHumidity: state.indoorHumidity,
        dryingProgress: state.dryingProgress,
      });
      elapsed = endMinute;
    }
  }
  return { initialContext, durationMinutes: 360, completedAtMinute, steps };
}
