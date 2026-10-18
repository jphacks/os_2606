/** 乾燥制御の公開 API。入出力は呼び出し側で行い、ここでは計算だけを行う。 */
export { decideNextOperation } from "./operation-planner.js";
export { DEFAULT_DRYING_CONFIG } from "./config.js";
export type {
  AirconMode, FanSpeed, PresenceMode, Operation,
  DryingContext, DryingDecision, DryingConfig, TemperatureRange,
  SimulationResult, EvaluatedOperation,
} from "./types.js";

export { generateOperationCandidates } from "./candidate-generator.js";
export { evaluateOperations } from "./operation-evaluator.js";
export { simulateEnvironment, referenceTemperature } from "./environment-simulator.js";
export { calculateVpd, relativeHumidity, saturationVaporPressure, vaporPressure } from "./vpd.js";
export { DRYING_VPD_HOURS, estimateDryingHours, estimateProgressGain, updateObservedProgress } from "./estimator.js";
export type { EnvironmentObservation } from "./estimator.js";
