import { LineBotClient } from "@line/bot-sdk";
import type { LineApi } from "@os/api";
import { dryingEstimateText } from "./messages.js";

export function createLineApi(channelAccessToken: string): LineApi {
  if (!channelAccessToken.trim()) {
    throw new Error("チャネルアクセストークンを指定してください。");
  }

  const client = LineBotClient.fromChannelAccessToken({ channelAccessToken });
  return {
    async sendNotificationDryingPlan(plan): Promise<void> {
      let presence: string;
      switch (plan.presenceMode) {
        case "home": presence = "在宅中"; break;
        case "away": presence = "外出中"; break;
        default: {
          const exhaustiveCheck: never = plan.presenceMode;
          return exhaustiveCheck;
        }
      }
      let operation: string;
      switch (plan.mode) {
        case "off":
          operation = "エアコンは停止";
          break;
        case "cool":
        case "heat":
        case "dehumidify": {
          const modeName = { cool: "冷房", heat: "暖房", dehumidify: "除湿" }[plan.mode];
          let fan: string;
          const fanSpeed = plan.fanSpeed;
          switch (fanSpeed) {
            case "low": fan = "弱"; break;
            case "medium": fan = "中"; break;
            case "high": fan = "強"; break;
            case undefined: fan = "自動"; break;
            default: {
              const exhaustiveCheck: never = fanSpeed;
              return exhaustiveCheck;
            }
          }
          operation = `${modeName}・設定温度${plan.temperature}℃・風量${fan}`;
          break;
        }
        default: {
          const exhaustiveCheck: never = plan;
          return exhaustiveCheck;
        }
      }
      await client.broadcast({
        messages: [{ type: "text", text: `運転計画（${presence}）\n${operation}\n${dryingEstimateText(plan)}` }],
      });
    },
    async sendNotificationFinishDrying(): Promise<void> {
      await client.broadcast({
        messages: [{ type: "text", text: "洗濯物の乾燥が完了しました。" }],
      });
    },
  };
}
