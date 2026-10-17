// 空調から見た洗濯物の位置
export type LaundryPosition = "left" | "center" | "right";

export type HouseConfig = {
  region: string | null;
  laundryPositionFromAC: LaundryPosition;
};
