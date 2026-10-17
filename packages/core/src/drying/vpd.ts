import { assertRange, MAX_TEMPERATURE, MIN_TEMPERATURE, validateEnvironment } from "./validation.js";

const SATURATION_BASE_KPA = 0.6108;
const SATURATION_EXPONENT = 17.27;
const SATURATION_OFFSET_C = 237.3;
const PERCENT = 100;

/** 提示されたPython探索モデルと同じ式。温度℃、戻り値kPa。 */
export function saturationVaporPressure(temperature: number): number {
  assertRange(temperature, MIN_TEMPERATURE, MAX_TEMPERATURE, "temperature");
  return SATURATION_BASE_KPA * Math.exp(SATURATION_EXPONENT * temperature / (temperature + SATURATION_OFFSET_C));
}

export function vaporPressure(temperature: number, humidity: number): number {
  validateEnvironment(temperature, humidity);
  return saturationVaporPressure(temperature) * humidity / PERCENT;
}

export function calculateVpd(temperature: number, humidity: number): number {
  validateEnvironment(temperature, humidity);
  return saturationVaporPressure(temperature) * (1 - humidity / PERCENT);
}

export function relativeHumidity(temperature: number, pressure: number): number {
  assertRange(pressure, 0, Number.MAX_VALUE, "vapor pressure");
  return Math.min(PERCENT, pressure / saturationVaporPressure(temperature) * PERCENT);
}
