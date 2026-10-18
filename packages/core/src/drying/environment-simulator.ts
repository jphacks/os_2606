import { DEFAULT_DRYING_CONFIG } from "./config.js";
import { DRYING_VPD_HOURS } from "./estimator.js";
import type { DryingConfig, DryingContext, Operation, SimulationResult } from "./types.js";
import { MINUTES_PER_HOUR, validateConfig, validateContext, validateOperation } from "./validation.js";
import { calculateVpd, relativeHumidity, saturationVaporPressure, vaporPressure } from "./vpd.js";

export function referenceTemperature(context: DryingContext, config: DryingConfig): number {
  switch (context.presenceMode) {
    case "home": return context.comfortTemperature ?? config.defaultComfortTemperature;
    case "away": return context.indoorTemperature;
    default: {
      const exhaustive: never = context.presenceMode;
      return exhaustive;
    }
  }
}

/**
 * 固定した外気予報で短時間を積分する未校正モデル。外気との交換は指数緩和、
 * 冷房・除湿は水蒸気圧を指数減衰、暖房は外気交換以外で水蒸気を増減しない。
 * 飽和を超えた水蒸気は凝結として除去する。衣類の蒸発・実機能力・電力量は未計算。
 * 風量は空調応答への暫定倍率であり、衣類への直接送風の実測効果ではない。
 */
export function simulateEnvironment(context: DryingContext, operation: Operation, config: DryingConfig = DEFAULT_DRYING_CONFIG): SimulationResult {
  validateContext(context);
  validateConfig(config);
  validateOperation(operation, context, config);
  let temperature = context.indoorTemperature;
  let pressure = vaporPressure(temperature, context.indoorHumidity);
  const outdoorPressure = vaporPressure(context.outdoorTemperature, context.outdoorHumidity);
  const reference = referenceTemperature(context, config);
  let progress = 0;
  let penalty = 0;
  for (let elapsed = 0; elapsed < config.evaluationMinutes; elapsed += config.stepMinutes) {
    const hours = Math.min(config.stepMinutes, config.evaluationMinutes - elapsed) / MINUTES_PER_HOUR;
    const startVpd = Math.max(0, saturationVaporPressure(temperature) - pressure);
    const startError = (temperature - reference) ** 2;
    const coefficients = config.simulator;
    let acRate = 0;
    let removalRate = 0;
    let target = temperature;
    if (operation.mode !== "off") {
      const multiplier = coefficients.fanMultiplier[operation.fanSpeed];
      acRate = coefficients.temperatureRate[operation.mode] * multiplier;
      removalRate = coefficients.dehumidificationRate[operation.mode] * multiplier;
      switch (operation.mode) {
        case "cool": target = Math.min(temperature, operation.temperature); break;
        case "heat": target = Math.max(temperature, operation.temperature); break;
        case "dehumidify": target = operation.temperature; break;
        default: {
          const exhaustive: never = operation;
          throw new RangeError(`Unsupported mode: ${exhaustive}`);
        }
      }
    }
    const totalRate = acRate + coefficients.outdoorTemperatureRate;
    if (totalRate > 0) {
      const equilibrium = (acRate * target + coefficients.outdoorTemperatureRate * context.outdoorTemperature) / totalRate;
      temperature = equilibrium + (temperature - equilibrium) * Math.exp(-totalRate * hours);
    }
    pressure = outdoorPressure + (pressure - outdoorPressure) * Math.exp(-coefficients.outdoorVaporRate * hours);
    pressure *= Math.exp(-removalRate * hours);
    pressure = Math.min(pressure, saturationVaporPressure(temperature));
    const humidity = relativeHumidity(temperature, pressure);
    progress += (startVpd + calculateVpd(temperature, humidity)) / 2 * hours / DRYING_VPD_HOURS;
    penalty += (startError + (temperature - reference) ** 2) / 2 * hours;
  }
  return {
    estimatedProgressGain: Math.min(1 - context.dryingProgress, progress),
    predictedTemperature: temperature,
    predictedHumidity: relativeHumidity(temperature, pressure),
    temperaturePenalty: penalty / (config.evaluationMinutes / MINUTES_PER_HOUR),
  };
}
