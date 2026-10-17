import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { HouseConfig } from "./house-config/types/house-config.js";

const DEFAULT_CONFIG: HouseConfig = { region: null };

export const HOUSE_CONFIG_PATH = process.env.HOUSE_CONFIG_PATH ?? "data/house_config.json";

// 家の設定を読み取る
export async function getHouseConfig(path = HOUSE_CONFIG_PATH): Promise<HouseConfig> {
  try {
    const json = JSON.parse(await readFile(path, "utf8")) as Partial<HouseConfig>;
    return { ...DEFAULT_CONFIG, ...json };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_CONFIG };
    throw err;
  }
}

// 家の設定を更新する
export async function updateHouseConfig(
  patch: Partial<HouseConfig>,
  path = HOUSE_CONFIG_PATH,
): Promise<HouseConfig> {
  const config = { ...(await getHouseConfig(path)), ...patch };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2) + "\n");
  return config;
}
