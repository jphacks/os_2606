import type { LaundryPosition } from "../../types/laundry.js";
import type { HouseConfig } from "./house-config.js";

export interface GetHouseConfig {
  (path?: string): Promise<HouseConfig>;
}

export interface UpdateHouseConfig {
  (patch: HouseConfig, path?: string): Promise<HouseConfig>;
}

export interface GetLaundryPositionFromAC {
  (path?: string): Promise<LaundryPosition>;
}
