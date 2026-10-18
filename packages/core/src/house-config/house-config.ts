import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DEFAULT_DRYING_CONFIG } from "../drying/config.js";
import { MAX_SETPOINT, MIN_SETPOINT } from "../drying/validation.js";
import type { LaundryPosition } from "../types/laundry.js";
import type {
  GetHouseConfig,
  GetLaundryPositionFromAC,
  HouseConfig,
  UpdateHouseConfig,
} from "./types/index.js";

// 保存先は環境変数 HOUSE_CONFIG_PATH で指定する（未指定なら data/house_config.json）
// テストなどで切り替えられるよう、呼び出しのたびに読む
const houseConfigPath = (): string => process.env.HOUSE_CONFIG_PATH ?? "data/house_config.json";

const DEFAULT_CONFIG: HouseConfig = {
  region: null,
  laundryPositionFromAC: "center",
  userComfortTemperature: DEFAULT_DRYING_CONFIG.defaultComfortTemperature,
};

const isLaundryPosition = (value: unknown): value is LaundryPosition =>
  value === "left" || value === "center" || value === "right";

// 快適温度はエアコンの設定温度として使うため、乾燥制御と同じ範囲に制限する
const isUserComfortTemperature = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= MIN_SETPOINT && value <= MAX_SETPOINT;

// 家の設定を読み取る
// ファイルが無ければデフォルト値を返し、中身が不正ならエラーにする
export const getHouseConfig: GetHouseConfig = async () => {
  const path = houseConfigPath();
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
  const userComfortTemperature =
    "userComfortTemperature" in json ? json.userComfortTemperature : DEFAULT_CONFIG.userComfortTemperature;
  if (!isUserComfortTemperature(userComfortTemperature)) {
    throw new Error(`${path}: userComfortTemperature must be a number between ${MIN_SETPOINT} and ${MAX_SETPOINT}`);
  }
  return { region, laundryPositionFromAC, userComfortTemperature };
}

// 家の設定を更新する
export const updateHouseConfig: UpdateHouseConfig = async (patch) => {
  const path = houseConfigPath();
  const config = { ...(await getHouseConfig()), ...patch };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2) + "\n");
  return config;
};

// 家の設定から、空調から見た洗濯物の位置を取得する
export const getLaundryPositionFromAC: GetLaundryPositionFromAC = async () => {
  const config = await getHouseConfig();
  return config.laundryPositionFromAC;
};
