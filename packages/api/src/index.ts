export interface AcMessage {
  acMode: "cool" | "heat" | "dehumidify";
  temperature: number;
  /** Omit to retain the existing setting. */
  fanSpeed?: "low" | "medium" | "high";
  /** Omit to retain the last learned/sent setting. Unsupported positions reject. */
  windDirectionVertical?: "up" | "middle" | "down";
  windDirectionHorizontal?: "left" | "center" | "right";
}

export interface RemoteControl {
  /** 送信・保存せずに、指定した設定の信号を生成できるか確認する。 */
  supports(message: AcMessage): boolean;
  stop(): Promise<void>;
  send(message: AcMessage): Promise<void>;
}

export interface TemperatureSensor {
  /** 温度は°C、湿度は相対湿度（%）。 */
  measure(): Promise<{ temperature: number; humidity: number }>;
}

export interface Image {
  /** 画像ファイルのバイナリデータ。 */
  data: Uint8Array;
  /** 画像のMIMEタイプ（例: image/jpeg）。 */
  mimeType: string;
}

export interface DryingEstimate {
  /** 残り乾燥時間（時間）。予測できない場合はInfinity。 */
  estimatedDryingHours: number;
}

export type AirconPlan = DryingEstimate & (
  | { mode: "off" }
  | { mode: "cool" | "heat"; temperature: number; fanSpeed: NonNullable<AcMessage["fanSpeed"]> }
  | { mode: "dehumidify"; temperature: number; fanSpeed?: NonNullable<AcMessage["fanSpeed"]> }
);
export type DryingPlan = AirconPlan & { presenceMode: "home" | "away" };

export interface DryingSimulation {
  initialContext: {
    indoorTemperature: number;
    indoorHumidity: number;
    outdoorTemperature: number;
    outdoorHumidity: number;
    presenceMode: "home" | "away";
  };
  durationMinutes: 360;
  completedAtMinute: number | null;
  steps: {
    startMinute: number;
    endMinute: number;
    decision: AirconPlan;
    indoorTemperature: number;
    indoorHumidity: number;
    dryingProgress: number;
  }[];
}

/** LINEから呼び出す、coreが提供するAPI。 */
export interface CoreApi {
  /** 現在の環境と乾燥進捗で6時間分を試算する。実機操作や状態変更はしない。 */
  simulateDryingPlan(): Promise<DryingSimulation>;
  /** 洗濯物を干し、在宅モードで乾燥を開始する。 */
  startDrying(): Promise<DryingEstimate>;

  /** 外出を通知する。 */
  leaveHouse(): Promise<DryingEstimate>;

  /** 帰宅ボタンが押されたことを通知する。 */
  arriveHouse(): Promise<DryingEstimate | void>;

  /** 洗濯物を干したことを画像で伝える。 */
  hangLaundryEvidence(image: Image): Promise<DryingEstimate>;

  /** エアコンから見た洗濯物の位置を伝える。 */
  laundryPositionFromAC(position: "left" | "center" | "right"): Promise<void>;

  /** 家の地域を設定する。 */
  setUpHouseConfig(region: string): Promise<void>;
}

/** coreから呼び出す、LINEが提供するAPI。 */
export interface LineApi {
  /** 実機への送信後、現在の運転計画を通知する。 */
  sendNotificationDryingPlan(plan: DryingPlan): Promise<void>;
  /** 乾燥の完了を通知する。 */
  sendNotificationFinishDrying(): Promise<void>;
}
