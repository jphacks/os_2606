import type { messagingApi } from "@line/bot-sdk";
import type { CoreApi, Image } from "@os/api";
import {
  areaSelectMessage,
  comfortTemperatureSelectMessage,
  laundryPhotoRequestMessage,
  laundryPositionMessage,
  MAX_COMFORT_TEMPERATURE,
  menuGuideMessage,
  MIN_COMFORT_TEMPERATURE,
  prefectureSelectMessage,
  textMessage,
} from "./messages.js";
import { POSTBACK_DATA, POSTBACK_PREFIX } from "./postback-data.js";
import { findArea, isPrefecture } from "./regions.js";

// ボタン（ポストバック）が押されたとき。CoreApiを呼び、返信するメッセージを返す。
// 返信しないときは空の配列を返す。
export async function handlePostback(
  data: string,
  core: CoreApi,
): Promise<messagingApi.Message[]> {
  // 選んだ値が付いている合図
  if (data.startsWith(POSTBACK_PREFIX.regionArea)) {
    const area = findArea(data.slice(POSTBACK_PREFIX.regionArea.length));
    if (area === undefined) {
      return [];
    }
    return [prefectureSelectMessage(area)];
  }
  if (data.startsWith(POSTBACK_PREFIX.region)) {
    const region = data.slice(POSTBACK_PREFIX.region.length);
    if (!isPrefecture(region)) {
      return [];
    }
    await core.setUpHouseConfig(region);
    return [textMessage(`住んでいる地域を${region}にしました。`)];
  }
  if (data.startsWith(POSTBACK_PREFIX.comfortTemperature)) {
    const temperature = Number(
      data.slice(POSTBACK_PREFIX.comfortTemperature.length),
    );
    if (
      !Number.isInteger(temperature) ||
      temperature < MIN_COMFORT_TEMPERATURE ||
      temperature > MAX_COMFORT_TEMPERATURE
    ) {
      return [];
    }
    await core.setComfortTemperature(temperature);
    return [textMessage(`いつもの室温を${temperature}℃にしました。`)];
  }

  switch (data) {
    case POSTBACK_DATA.leaveHouse:
      await core.leaveHouse();
      return [textMessage("いってらっしゃい！\n洗濯物の乾燥を始めます。")];
    case POSTBACK_DATA.arriveHouse:
      await core.arriveHouse();
      return [
        textMessage("お帰りの準備をします。\n気をつけて帰ってきてください。"),
      ];
    case POSTBACK_DATA.hangLaundry:
      return [laundryPhotoRequestMessage()];
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
      return [areaSelectMessage()];
    case POSTBACK_DATA.askComfortTemperature:
      return [comfortTemperatureSelectMessage()];
    case POSTBACK_DATA.switchToHomeTab:
    case POSTBACK_DATA.switchToSettingsTab:
      // タブの切り替えはLINEアプリが行うので、返信しない
      return [];
    default:
      return [];
  }
}

// 文字を打たれたとき。Coreは呼ばず、メニューを案内する。
export function handleText(): messagingApi.Message[] {
  return [menuGuideMessage()];
}

// 写真が送られたとき。続けて洗濯物の位置を選んでもらう。
export async function handleImage(
  image: Image,
  core: CoreApi,
): Promise<messagingApi.Message[]> {
  await core.hangLaundryEvidence(image);
  return [
    textMessage("洗濯物の写真を受け取りました。"),
    laundryPositionMessage(),
  ];
}
