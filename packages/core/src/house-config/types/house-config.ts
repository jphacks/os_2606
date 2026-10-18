import type { LaundryPosition } from "../../types/laundry.js";

export type HouseConfig = {
  region: string | null;
  laundryPositionFromAC: LaundryPosition;
  userComfortTemperature: number;
};
