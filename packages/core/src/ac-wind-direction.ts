import { getHouseConfig } from "./house-config.js";
import type { WindDirectionHorizontal, WindDirectionVertical } from "./types/ac-wind-direction.js";
import type { AcMode } from "./types/example.js";

// 垂直方向の風向きを決定する関数
// 冷房・除湿の場合は上向き、暖房の場合は中間向きにする
export const decideWindDirectionVertical = (acMode: AcMode): WindDirectionVertical => {
  switch (acMode) {
    case "cool":
    case "dehumidify":
      return "up";
    case "heat":
      return "middle";
  }
};

// 水平方向の風向きを決定する関数
// 家の設定値より、エアコンと洗濯物の位置関係を用いて、洗濯物のある方向へ風を送る
export const decideWindDirectionHorizontal = async (): Promise<WindDirectionHorizontal> => {
  const { laundryPositionFromAC } = await getHouseConfig();
  return laundryPositionFromAC;
};
