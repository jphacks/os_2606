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
