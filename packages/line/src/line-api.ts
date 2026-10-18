import { LineBotClient } from "@line/bot-sdk";
import type { LineApi } from "@os/api";

export function createLineApi(channelAccessToken: string): LineApi {
  if (!channelAccessToken.trim()) {
    throw new Error("チャネルアクセストークンを指定してください。");
  }

  const client = LineBotClient.fromChannelAccessToken({ channelAccessToken });
  return {
    async sendNotificationTemperatureChanged(temperature, acMode): Promise<void> {
      let modeName: string;
      switch (acMode) {
        case "cool":
          modeName = "冷房";
          break;
        case "heat":
          modeName = "暖房";
          break;
        case "dehumidify":
          modeName = "除湿";
          break;
        default: {
          const exhaustiveCheck: never = acMode;
          return exhaustiveCheck;
        }
      }
      await client.broadcast({
        messages: [{ type: "text", text: `エアコンを${modeName}・設定温度${temperature}℃にしました。` }],
      });
    },
    async sendNotificationFinishDrying(): Promise<void> {
      await client.broadcast({
        messages: [{ type: "text", text: "洗濯物の乾燥が完了しました。" }],
      });
    },
  };
}
