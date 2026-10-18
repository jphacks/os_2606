export interface AcMessage {
  acMode: "cool" | "heat" | "dry";
  temperature: number;
  /** Omit to retain the existing setting. */
  fanSpeed?: "low" | "medium" | "high";
  /** Omit to retain the last learned/sent setting. Unsupported positions reject. */
  windDirectionVertical?: "up" | "middle" | "down";
  windDirectionHorizontal?: "left" | "center" | "right";
}

export interface RemoteControl {
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

/** LINEから呼び出す、coreが提供するAPI。 */
export interface CoreApi {
  /** 外出を通知する。 */
  leaveHouse(): Promise<void>;

  /** 帰宅ボタンが押されたことを通知する。 */
  arriveHouse(): Promise<void>;

  /** 洗濯物を干したことを画像で伝える。 */
  hangLaundryEvidence(image: Image): Promise<void>;

  /** エアコンから見た洗濯物の位置を伝える。 */
  laundryPositionFromAC(position: "left" | "center" | "right"): Promise<void>;

  /** 家の地域を設定する。 */
  setUpHouseConfig(region: string): Promise<void>;
}

/** coreから呼び出す、LINEが提供するAPI。 */
export interface LineApi {
  /** 乾燥の完了を通知する。 */
  sendNotificationFinishDrying(): Promise<void>;
}

export * from "./drying-cycle.js";
