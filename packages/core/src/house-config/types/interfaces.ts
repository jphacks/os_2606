import type { LaundryPosition } from "../../types/laundry.js";
import type { HouseConfig } from "./house-config.js";

export interface GetHouseConfig {
  (): Promise<HouseConfig>;
}

export interface UpdateHouseConfig {
  (patch: HouseConfig): Promise<HouseConfig>;
}

export interface GetLaundryPositionFromAC {
  (): Promise<LaundryPosition>;
}

export interface UpdateUserComfortTemperature {
  (temperature: number): Promise<void>;
}
