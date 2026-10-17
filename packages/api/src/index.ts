export interface AcMessage {
  acMode: "cool" | "heat";
  temperature: number;
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
