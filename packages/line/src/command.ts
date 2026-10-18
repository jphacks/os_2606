import type { messagingApi } from "@line/bot-sdk";
import type { CoreApi, DryingEstimate, Image } from "@os/api";
import {
  dryingEstimateText,
  dryingSimulationMessage,
  laundryPhotoRequestMessage,
  laundryPositionMessage,
  menuGuideMessage,
  textMessage,
} from "./messages.js";
import { POSTBACK_DATA } from "./postback-data.js";

function withEstimate(message: string, estimate: DryingEstimate | void): messagingApi.TextMessage {
  if (!estimate) return textMessage(message);
  return textMessage(`${message}\n${dryingEstimateText(estimate)}`);
}

// ボタン（ポストバック）が押されたとき。CoreApiを呼び、返信するメッセージを返す。
// 返信しないときは空の配列を返す。
export async function handlePostback(
  data: string,
  core: CoreApi,
): Promise<messagingApi.Message[]> {
  switch (data) {
    case POSTBACK_DATA.simulateDryingPlan:
      return [dryingSimulationMessage(await core.simulateDryingPlan())];
    case POSTBACK_DATA.leaveHouse:
      return [withEstimate("いってらっしゃい！\n洗濯物の乾燥を始めます。", await core.leaveHouse())];
    case POSTBACK_DATA.arriveHouse:
      return [withEstimate("おかえりなさい！", await core.arriveHouse())];
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
      return [withEstimate("乾燥を開始しました！", await core.startDrying())];
    default:
      return [menuGuideMessage()];
  }
}

// 写真が送られたとき
export async function handleImage(
  image: Image,
  core: CoreApi,
): Promise<messagingApi.Message[]> {
  return [withEstimate("洗濯物の写真を受け取りました。", await core.hangLaundryEvidence(image))];
}
