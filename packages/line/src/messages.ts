//返信の見た目を作るファイル
import type { DryingEstimate, DryingSimulation } from "@os/api";
import { formatPlanSimulation } from "@os/core/drying";
import type { messagingApi } from "@line/bot-sdk";
import { POSTBACK_DATA } from "./postback-data.js";

// 普通の文字だけのメッセージ
export function textMessage(text: string): messagingApi.TextMessage {
  return { type: "text", text };
}

export function dryingSimulationMessage(simulation: DryingSimulation): messagingApi.TextMessage {
  return textMessage(formatPlanSimulation(simulation));
}

// 文字を打たれたときの案内
export function menuGuideMessage(): messagingApi.TextMessage {
  return textMessage("画面下のメニューから選んでください。");
}

// 「写真を送る」を押したとき。カメラと写真フォルダを開くボタンを付ける。
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

// 「位置を設定」を押したときのカード（Flexメッセージ）
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

export function dryingEstimateText(estimate: DryingEstimate): string {
  if (!Number.isFinite(estimate.estimatedDryingHours)) {
    return "現在の条件では乾燥完了までの時間を予測できません。";
  }
  const minutes = Math.max(0, Math.ceil(estimate.estimatedDryingHours * 60));
  if (minutes === 0) return "洗濯物は乾燥が完了した見込みです。";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  let duration = `${minutes}分`;
  if (hours > 0) {
    duration = `${hours}時間`;
    if (remainder > 0) duration += `${remainder}分`;
  }
  return `乾燥完了までの目安：あと約${duration}です。`;
}
