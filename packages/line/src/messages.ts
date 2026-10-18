import type { messagingApi } from "@line/bot-sdk";
import { POSTBACK_DATA, POSTBACK_PREFIX } from "./postback-data.js";
import { AREAS, type Area } from "./regions.js";

// いつもの室温として選べる範囲（°C）。エアコンの設定温度の範囲に合わせる。
export const MIN_COMFORT_TEMPERATURE = 16;
export const MAX_COMFORT_TEMPERATURE = 28;

// 普通の文字だけのメッセージ
export function textMessage(text: string): messagingApi.TextMessage {
  return { type: "text", text };
}

// 文字を打たれたときの案内
export function menuGuideMessage(): messagingApi.TextMessage {
  return textMessage("画面下のメニューから選んでください。");
}

// 選択肢を押すと合図（ポストバック）を送るボタン。押してもメニューは開いたままにする。
function choice(label: string, data: string): messagingApi.QuickReplyItem {
  return {
    type: "action",
    action: { type: "postback", label, data, inputOption: "openRichMenu" },
  };
}

// 「洗濯を干した」を押したとき。カメラと写真フォルダを開くボタンを付ける。
export function laundryPhotoRequestMessage(): messagingApi.TextMessage {
  return {
    type: "text",
    text: "干した洗濯物の写真を送ってください。",
    quickReply: {
      items: [
        { type: "action", action: { type: "camera", label: "カメラで撮る" } },
        { type: "action", action: { type: "cameraRoll", label: "写真を選ぶ" } },
      ],
    },
  };
}

// 写真を受け取ったあとに出す、洗濯物の位置を選ぶカード（Flexメッセージ）
export function laundryPositionMessage(): messagingApi.FlexMessage {
  return {
    type: "flex",
    altText: "洗濯物の位置を選んでください",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "洗濯物の位置", weight: "bold", size: "xl" },
          {
            type: "text",
            text: "エアコンから見て、洗濯物はどこに干していますか？",
            size: "sm",
            color: "#666666",
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        contents: [
          positionButton("左", POSTBACK_DATA.laundryPositionLeft),
          positionButton("正面", POSTBACK_DATA.laundryPositionCenter),
          positionButton("右", POSTBACK_DATA.laundryPositionRight),
        ],
      },
    },
  };
}

function positionButton(label: string, data: string): messagingApi.FlexButton {
  return {
    type: "button",
    style: "primary",
    color: "#2B7DE9",
    action: { type: "postback", label, data, inputOption: "openRichMenu" },
  };
}

// 「住んでいる地域」を押したとき。まず地方を選んでもらう。
export function areaSelectMessage(): messagingApi.TextMessage {
  return {
    type: "text",
    text: "住んでいる地方を選んでください。",
    quickReply: {
      items: AREAS.map((area) =>
        choice(area.name, POSTBACK_PREFIX.regionArea + area.id),
      ),
    },
  };
}

// 地方を選んだあと。その地方の都道府県を選んでもらう。
export function prefectureSelectMessage(area: Area): messagingApi.TextMessage {
  return {
    type: "text",
    text: `${area.name}のどこに住んでいますか？`,
    quickReply: {
      items: area.prefectures.map((prefecture) =>
        choice(prefecture, POSTBACK_PREFIX.region + prefecture),
      ),
    },
  };
}

// 「いつもの室温」を押したとき。16〜28℃から選んでもらう。
export function comfortTemperatureSelectMessage(): messagingApi.TextMessage {
  const temperatures: number[] = [];
  for (let t = MIN_COMFORT_TEMPERATURE; t <= MAX_COMFORT_TEMPERATURE; t++) {
    temperatures.push(t);
  }
  return {
    type: "text",
    text: "家にいるときの、いつもの室温を選んでください。",
    quickReply: {
      items: temperatures.map((t) =>
        choice(`${t}℃`, POSTBACK_PREFIX.comfortTemperature + t),
      ),
    },
  };
}
