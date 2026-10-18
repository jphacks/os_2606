import type { messagingApi } from "@line/bot-sdk";
import type { CoreApi } from "@os/api";

// ボタンに表示する文字。押すとこの文字がユーザーから送信される。
export const BUTTON_TEXTS = [
  "いってきます",
  "ただいま",
  "左",
  "中央",
  "右",
] as const;

// 返信の下に表示するボタン（クイックリプライ）。
export const quickReply: messagingApi.QuickReply = {
  items: BUTTON_TEXTS.map((text) => ({
    type: "action",
    action: { type: "message", label: text, text },
  })),
};

// 受け取った文字に応じてCoreApiを呼び、返信する文章を返す。
export async function handleText(text: string, core: CoreApi): Promise<string> {
  switch (text.trim()) {
    case "いってきます":
      await core.leaveHouse();
      return "いってらっしゃい！";
    case "ただいま":
      await core.arriveHouse();
      return "おかえりなさい！";
    case "左":
      await core.laundryPositionFromAC("left");
      return "洗濯物の位置を「左」にしました。";
    case "中央":
      await core.laundryPositionFromAC("center");
      return "洗濯物の位置を「中央」にしました。";
    case "右":
      await core.laundryPositionFromAC("right");
      return "洗濯物の位置を「右」にしました。";
    default:
      return "下のボタンから選んでください。";
  }
}
