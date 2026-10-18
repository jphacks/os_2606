import { LineBotClient } from "@line/bot-sdk";
import type { LineApi } from "@os/api";

export function createLineApi(channelAccessToken: string, userId: string): LineApi {
  if (!channelAccessToken.trim()) {
    throw new Error("チャネルアクセストークンを指定してください。");
  }
  if (!userId.trim()) {
    throw new Error("通知先のユーザーIDを指定してください。");
  }

  const client = LineBotClient.fromChannelAccessToken({ channelAccessToken });
  return {
    async sendNotificationFinishDrying(): Promise<void> {
      await client.pushMessage({
        to: userId,
        messages: [{ type: "text", text: "洗濯物の乾燥が完了しました。" }],
      });
    },
  };
}
