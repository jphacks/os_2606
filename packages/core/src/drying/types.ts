export type AirconMode = "cool" | "heat" | "dehumidify";
export type FanSpeed = "low" | "medium" | "high";
export type PresenceMode = "home" | "away";

export type Operation =
  | { mode: AirconMode; temperature: number; fanSpeed: FanSpeed }
  | { mode: "off"; temperature?: never; fanSpeed?: never };

export interface DryingContext {
  indoorTemperature: number;
  indoorHumidity: number;
  outdoorTemperature: number;
  outdoorHumidity: number;
  presenceMode: PresenceMode;
  comfortTemperature?: number;
  /** 観測から積算した未校正の推定進捗。0〜1。開始時は省略でき、0として扱う。 */
  dryingProgress?: number;
}

/** 運転時は設定温度（℃）と風量を返す。停止時は両方とも省略する。 */
export type DryingDecision = Operation & {
  /**
   * 乾くまでの推定残り時間（時間）。予測区間終了時の温湿度が続くと仮定する。
   * 推定進捗が1なら0、乾燥が進まない条件ではInfinity。
   */
  estimatedDryingHours: number;
};

export interface TemperatureRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export interface DryingConfig {
  readonly temperatureRanges: Readonly<Record<"cool" | "heat", TemperatureRange>>;
  readonly capabilities: {
    readonly modes: readonly AirconMode[];
    readonly fanSpeeds: Readonly<Record<AirconMode, readonly FanSpeed[]>>;
    readonly allowOff: boolean;
  };
  readonly dryingWeight: number;
  readonly defaultComfortTemperature: number;
  readonly evaluationMinutes: number;
  readonly stepMinutes: number;
  readonly simulator: {
    /** 全係数は実測に基づかない暫定値。速度の単位は /時。 */
    readonly outdoorTemperatureRate: number;
    readonly outdoorVaporRate: number;
    readonly temperatureRate: Readonly<Record<AirconMode, number>>;
    readonly dehumidificationRate: Readonly<Record<AirconMode, number>>;
    readonly fanMultiplier: Readonly<Record<FanSpeed, number>>;
    /** 在室時の風量による快適性ペナルティ。暫定値。 */
    readonly fanComfortPenalty: Readonly<Record<FanSpeed, number>>;
  };
}

export interface SimulationResult {
  estimatedProgressGain: number;
  predictedTemperature: number;
  predictedHumidity: number;
  /** 終点だけでなく全時間刻みの二乗誤差の時間平均。 */
  temperaturePenalty: number;
}

export interface EvaluatedOperation extends SimulationResult {
  operation: Operation;
  score: number;
}
