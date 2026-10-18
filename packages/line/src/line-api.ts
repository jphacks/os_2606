import { LineBotClient } from "@line/bot-sdk";
import type { LineApi } from "@os/api";

export function createLineApi(channelAccessToken: string): LineApi {
  if (!channelAccessToken.trim()) {
    throw new Error("チャネルアクセストークンを指定してください。");
  }

  const client = LineBotClient.fromChannelAccessToken({ channelAccessToken });
  return {
    async sendNotificationTemperatureChanged(temperature): Promise<void> {
      await client.broadcast({
        messages: [{ type: "text", text: `エアコンの設定温度を${temperature}℃にしました。` }],
      });
    },
    async sendNotificationFinishDrying(): Promise<void> {
      await client.broadcast({
        messages: [{ type: "text", text: "洗濯物の乾燥が完了しました。" }],
      });
    },
  };
}
