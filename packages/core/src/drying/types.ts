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
   * 選んだ設定と外気条件を固定し、温湿度と進捗を積算した完了時間（時間）。
   * 時間分解能はconfig.stepMinutes。進捗1なら0。
   * 最大7日間の予測内で完了しなければInfinity（乾燥不能の断定ではない）。
   */
  estimatedDryingHours: number;
};

export interface TemperatureRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export interface DryingConfig {
  /** 実機の通信方式・派生機種で送信できる設定だけを候補にする。 */
  readonly isOperationSupported?: (operation: Operation) => boolean;
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
