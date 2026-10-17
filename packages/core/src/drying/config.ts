import type { DryingConfig } from "./types.js";

/** 未校正の探索用設定。実機の能力・実測に合わせて明示的に差し替える。 */
export const DEFAULT_DRYING_CONFIG: DryingConfig = {
  temperatureRanges: {
    cool: { min: 22, max: 28, step: 1 },
    heat: { min: 20, max: 26, step: 1 },
  },
  capabilities: {
    modes: ["cool", "heat", "dry"],
    fanSpeeds: {
      cool: ["low", "medium", "high"],
      heat: ["low", "medium", "high"],
      dry: ["low", "medium", "high"],
    },
    allowOff: true,
  },
  dryingWeight: 0.7,
  defaultComfortTemperature: 24,
  evaluationMinutes: 60,
  stepMinutes: 15,
  simulator: {
    outdoorTemperatureRate: 0.12,
    outdoorVaporRate: 0.08,
    temperatureRate: { cool: 1.2, heat: 1.2, dry: 0.15 },
    dehumidificationRate: { cool: 0.12, heat: 0, dry: 0.3 },
    fanMultiplier: { low: 0.7, medium: 1, high: 1.3 },
    fanComfortPenalty: { low: 0, medium: 0.02, high: 0.08 },
  },
};
