import { DEFAULT_DRYING_CONFIG } from "./config.js";
import type { DryingConfig, DryingContext, Operation } from "./types.js";
import { MAX_SETPOINT, MIN_SETPOINT, validateConfig, validateContext } from "./validation.js";

/** 実機の対応モード・風量・温度範囲で候補を絞り込む。送風モードは生成しない。 */
export function generateOperationCandidates(context: DryingContext, config: DryingConfig = DEFAULT_DRYING_CONFIG): Operation[] {
  validateContext(context);
  validateConfig(config);
  const operations: Operation[] = [];
  for (const mode of new Set(config.capabilities.modes)) {
    const temperatures: number[] = [];
    switch (mode) {
      case "cool":
      case "heat": {
        const range = config.temperatureRanges[mode];
        const count = Math.floor((range.max - range.min) / range.step);
        for (let index = 0; index <= count; index++) {
          temperatures.push(Number((range.min + index * range.step).toFixed(8)));
        }
        break;
      }
      case "dehumidify":
        // 除湿の温度は現在室温相当。命令温度の安全範囲を超える場合は丸める。
        temperatures.push(Math.min(MAX_SETPOINT, Math.max(MIN_SETPOINT, context.indoorTemperature)));
        break;
      default: {
        const exhaustive: never = mode;
        throw new RangeError(`Unsupported mode: ${exhaustive}`);
      }
    }
    for (const temperature of temperatures) {
      for (const fanSpeed of new Set(config.capabilities.fanSpeeds[mode])) {
        operations.push({ mode, temperature, fanSpeed });
      }
    }
  }
  if (context.presenceMode === "away" && config.capabilities.allowOff) {
    operations.push({ mode: "off" });
  }
  if (config.isOperationSupported) return operations.filter(config.isOperationSupported);
  return operations;
}
