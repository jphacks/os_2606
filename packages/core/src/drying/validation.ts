import type { DryingConfig, DryingContext, Operation } from "./types.js";

export const MIN_TEMPERATURE = -60;
export const MAX_TEMPERATURE = 60;
export const MIN_SETPOINT = 16;
export const MAX_SETPOINT = 28;
export const MINUTES_PER_HOUR = 60;

export function assertRange(value: number, min: number, max: number, name: string): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be finite and between ${min} and ${max}`);
  }
}

export function validateEnvironment(temperature: number, humidity: number): void {
  assertRange(temperature, MIN_TEMPERATURE, MAX_TEMPERATURE, "temperature");
  assertRange(humidity, 0, 100, "humidity");
}

export function validateContext(context: DryingContext): void {
  validateEnvironment(context.indoorTemperature, context.indoorHumidity);
  validateEnvironment(context.outdoorTemperature, context.outdoorHumidity);
  if (context.dryingProgress !== undefined) {
    assertRange(context.dryingProgress, 0, 1, "dryingProgress");
  }
  if (context.comfortTemperature !== undefined) {
    assertRange(context.comfortTemperature, MIN_SETPOINT, MAX_SETPOINT, "comfortTemperature");
  }
  if (context.presenceMode !== "home" && context.presenceMode !== "away") {
    throw new RangeError("Invalid presenceMode");
  }
}

export function validateConfig(config: DryingConfig): void {
  if (config.capabilities.allowAutomaticDehumidify !== undefined &&
      typeof config.capabilities.allowAutomaticDehumidify !== "boolean") {
    throw new RangeError("allowAutomaticDehumidify must be boolean");
  }
  assertRange(config.dryingWeight, 0, 1, "dryingWeight");
  assertRange(config.defaultComfortTemperature, MIN_SETPOINT, MAX_SETPOINT, "defaultComfortTemperature");
  assertRange(config.evaluationMinutes, 1, MINUTES_PER_HOUR, "evaluationMinutes");
  assertRange(config.stepMinutes, 1, config.evaluationMinutes, "stepMinutes");
  for (const range of Object.values(config.temperatureRanges)) {
    assertRange(range.min, MIN_SETPOINT, MAX_SETPOINT, "minimum setpoint");
    assertRange(range.max, range.min, MAX_SETPOINT, "maximum setpoint");
    assertRange(range.step, 0.1, MAX_SETPOINT - MIN_SETPOINT, "setpoint step");
  }
  for (const mode of config.capabilities.modes) {
    if (!["cool", "heat", "dehumidify"].includes(mode)) throw new RangeError("Invalid mode");
  }
  for (const mode of ["cool", "heat", "dehumidify"] as const) {
    for (const fan of config.capabilities.fanSpeeds[mode]) {
      if (!["low", "medium", "high"].includes(fan)) throw new RangeError("Invalid fan speed");
    }
    assertRange(config.simulator.temperatureRate[mode], 0, 10, "temperature rate");
    assertRange(config.simulator.dehumidificationRate[mode], 0, 10, "dehumidification rate");
  }
  if (config.simulator.dehumidificationRate.heat !== 0) {
    throw new RangeError("Heating must not remove vapor");
  }
  assertRange(config.simulator.outdoorTemperatureRate, 0, 10, "outdoor temperature rate");
  assertRange(config.simulator.outdoorVaporRate, 0, 10, "outdoor vapor rate");
  for (const fan of ["low", "medium", "high"] as const) {
    assertRange(config.simulator.fanMultiplier[fan], 0, 10, "fan multiplier");
    assertRange(config.simulator.fanComfortPenalty[fan], 0, 100, "fan comfort penalty");
  }
}

export function validateOperation(operation: Operation, context: DryingContext, config: DryingConfig): void {
  if (operation.mode === "off") {
    if (context.presenceMode === "home" || !config.capabilities.allowOff) {
      throw new RangeError("Off is not allowed");
    }
    return;
  }
  if (!config.capabilities.modes.includes(operation.mode)) {
    throw new RangeError("Unsupported operation");
  }
  if (operation.fanSpeed === undefined) {
    if (operation.mode !== "dehumidify" || config.capabilities.allowAutomaticDehumidify !== true) {
      throw new RangeError("Automatic dehumidify is not allowed");
    }
  } else if (!config.capabilities.fanSpeeds[operation.mode].includes(operation.fanSpeed)) {
    throw new RangeError("Unsupported fan speed");
  }
  assertRange(operation.temperature, MIN_SETPOINT, MAX_SETPOINT, "setpoint");
  switch (operation.mode) {
    case "cool":
    case "heat": {
      const range = config.temperatureRanges[operation.mode];
      assertRange(operation.temperature, range.min, range.max, "setpoint");
      return;
    }
    case "dehumidify": return;
    default: {
      const exhaustive: never = operation;
      throw new RangeError(`Invalid mode: ${exhaustive}`);
    }
  }
}
