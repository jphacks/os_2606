import type { messagingApi } from "@line/bot-sdk";
import type { CoreApi, Image } from "@os/api";
import {
  laundryPhotoRequestMessage,
  laundryPositionMessage,
  menuGuideMessage,
  textMessage,
} from "./messages.js";
import { POSTBACK_DATA } from "./postback-data.js";

// ボタン（ポストバック）が押されたとき。CoreApiを呼び、返信するメッセージを返す。
// 返信しないときは空の配列を返す。
export async function handlePostback(
  data: string,
  core: CoreApi,
): Promise<messagingApi.Message[]> {
  switch (data) {
    case POSTBACK_DATA.leaveHouse:
      await core.leaveHouse();
      return [textMessage("いってらっしゃい！\n洗濯物の乾燥を始めます。")];
    case POSTBACK_DATA.arriveHouse:
      await core.arriveHouse();
      return [textMessage("おかえりなさい！")];
    case POSTBACK_DATA.askLaundryPhoto:
      return [laundryPhotoRequestMessage()];
    case POSTBACK_DATA.askLaundryPosition:
      return [laundryPositionMessage()];
    case POSTBACK_DATA.laundryPositionLeft:
      await core.laundryPositionFromAC("left");
      return [textMessage("洗濯物の位置を左にしました。")];
    case POSTBACK_DATA.laundryPositionCenter:
      await core.laundryPositionFromAC("center");
      return [textMessage("洗濯物の位置を正面にしました。")];
    case POSTBACK_DATA.laundryPositionRight:
      await core.laundryPositionFromAC("right");
      return [textMessage("洗濯物の位置を右にしました。")];
    case POSTBACK_DATA.askRegion:
      return [textMessage("地域の設定は準備中です。")];
    case POSTBACK_DATA.switchToOutingTab:
    case POSTBACK_DATA.switchToLaundryTab:
      // タブの切り替えはLINEアプリが行うので、返信しない
      return [];
    default:
      return [];
  }
}

// 乾燥開始コマンドを受け付け、その他の文字にはメニューを案内する。
export async function handleText(text: string, core: CoreApi): Promise<messagingApi.Message[]> {
  switch (text.trim()) {
    case "洗濯したよ":
      await core.startDrying();
      return [textMessage("乾燥を開始しました！")];
    default:
      return [menuGuideMessage()];
  }
}

// 写真が送られたとき
export async function handleImage(
  image: Image,
  core: CoreApi,
): Promise<messagingApi.Message[]> {
  await core.hangLaundryEvidence(image);
  return [textMessage("洗濯物の写真を受け取りました。")];
}
