import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { HouseConfig } from "./house-config/types/house-config.js";

const DEFAULT_CONFIG: HouseConfig = { region: null };

export const HOUSE_CONFIG_PATH = process.env.HOUSE_CONFIG_PATH ?? "data/house_config.json";

// 家の設定を読み取る
// ファイルが無ければデフォルト値を返し、中身が不正ならエラーにする
export async function getHouseConfig(path = HOUSE_CONFIG_PATH): Promise<HouseConfig> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_CONFIG };
    throw err;
  }
  return parseHouseConfig(JSON.parse(text), path);
}

function parseHouseConfig(json: unknown, path: string): HouseConfig {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new Error(`${path}: house config must be a JSON object`);
  }
  const region = "region" in json ? json.region : DEFAULT_CONFIG.region;
  if (region !== null && typeof region !== "string") {
    throw new Error(`${path}: region must be a string or null`);
  }
  return { region };
}

// 家の設定を更新する
export async function updateHouseConfig(
  patch: HouseConfig,
  path = HOUSE_CONFIG_PATH,
): Promise<HouseConfig> {
  const config = { ...(await getHouseConfig(path)), ...patch };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2) + "\n");
  return config;
}
