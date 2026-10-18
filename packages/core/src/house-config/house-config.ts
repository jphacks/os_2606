import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { LaundryPosition } from "../types/laundry.js";
import type {
  GetHouseConfig,
  GetLaundryPositionFromAC,
  HouseConfig,
  UpdateHouseConfig,
} from "./types/index.js";

export const HOUSE_CONFIG_PATH = process.env.HOUSE_CONFIG_PATH ?? "data/house_config.json";

const DEFAULT_CONFIG: HouseConfig = { region: null, laundryPositionFromAC: "center" };

const isLaundryPosition = (value: unknown): value is LaundryPosition =>
  value === "left" || value === "center" || value === "right";

// 家の設定を読み取る
// ファイルが無ければデフォルト値を返し、中身が不正ならエラーにする
export const getHouseConfig: GetHouseConfig = async (path = HOUSE_CONFIG_PATH) => {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_CONFIG };
    throw err;
  }
  return parseHouseConfig(JSON.parse(text), path);
};

// JSONをパースしてHouseConfig型に変換する
function parseHouseConfig(json: unknown, path: string): HouseConfig {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new Error(`${path}: house config must be a JSON object`);
  }
  const region = "region" in json ? json.region : DEFAULT_CONFIG.region;
  if (region !== null && typeof region !== "string") {
    throw new Error(`${path}: region must be a string or null`);
  }
  const laundryPositionFromAC =
    "laundryPositionFromAC" in json ? json.laundryPositionFromAC : DEFAULT_CONFIG.laundryPositionFromAC;
  if (!isLaundryPosition(laundryPositionFromAC)) {
    throw new Error(`${path}: laundryPositionFromAC must be "left", "center" or "right"`);
  }
  return { region, laundryPositionFromAC };
}

// 家の設定を更新する
export const updateHouseConfig: UpdateHouseConfig = async (patch, path = HOUSE_CONFIG_PATH) => {
  const config = { ...(await getHouseConfig(path)), ...patch };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2) + "\n");
  return config;
};

// 家の設定から、空調から見た洗濯物の位置を取得する
export const getLaundryPositionFromAC: GetLaundryPositionFromAC = async (path = HOUSE_CONFIG_PATH) => {
  const config = await getHouseConfig(path);
  return config.laundryPositionFromAC;
}
