import { calculateVpd } from "./vpd.js";
import { assertRange } from "./validation.js";

/** 研究データ由来の未校正係数。衣類の含水率や乾燥完了を保証しない。 */
export const DRYING_VPD_HOURS = 10.5035;

/** 一定環境での探索的な乾燥時間（時）。RH100%では乾燥せずInfinity。 */
export function estimateDryingHours(temperature: number, humidity: number): number {
  const vpd = calculateVpd(temperature, humidity);
  if (vpd === 0) return Infinity;
  return DRYING_VPD_HOURS / vpd;
}

/** VPD積分の未校正進捗。時間単位は時。予測にも観測区間にも使える。 */
export function estimateProgressGain(temperature: number, humidity: number, hours: number): number {
  assertRange(hours, 0, Number.MAX_SAFE_INTEGER, "hours");
  return calculateVpd(temperature, humidity) * hours / DRYING_VPD_HOURS;
}

export interface EnvironmentObservation {
  temperature: number;
  humidity: number;
  /** エポックミリ秒。 */
  observedAt: number;
}

const MILLISECONDS_PER_HOUR = 3_600_000;

/** 実測した両端のVPDを台形積分する。区間内の変動・衣類含水率は未観測。 */
export function updateObservedProgress(progress: number, previous: EnvironmentObservation, current: EnvironmentObservation): number {
  assertRange(progress, 0, 1, "progress");
  assertRange(previous.observedAt, 0, Number.MAX_SAFE_INTEGER, "previous observation time");
  assertRange(current.observedAt, previous.observedAt, Number.MAX_SAFE_INTEGER, "current observation time");
  const meanVpd = (calculateVpd(previous.temperature, previous.humidity) + calculateVpd(current.temperature, current.humidity)) / 2;
  const hours = (current.observedAt - previous.observedAt) / MILLISECONDS_PER_HOUR;
  return Math.min(1, progress + meanVpd * hours / DRYING_VPD_HOURS);
}
