import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getHouseConfig, updateHouseConfig } from "../src/house-config/house-config.js";
import type { HouseConfig } from "../src/house-config/types/house-config.js";

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "house_config-"));
  path = join(dir, "nested", "house_config.json");
  vi.stubEnv("HOUSE_CONFIG_PATH", path);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

const DEFAULT: HouseConfig = { region: null, laundryPositionFromAC: "center", userComfortTemperature: 24 };
const TOKYO: HouseConfig = { region: "tokyo", laundryPositionFromAC: "left", userComfortTemperature: 22 };
const OSAKA: HouseConfig = { region: "osaka", laundryPositionFromAC: "right", userComfortTemperature: 26 };

test("ファイルが無ければデフォルト値を返す", async () => {
  expect(await getHouseConfig()).toEqual(DEFAULT);
});

test("新規追加の値がJSONに保存され、読み出せる", async () => {
  expect(await updateHouseConfig(TOKYO)).toEqual(TOKYO);
  expect(await getHouseConfig()).toEqual(TOKYO);
});

test("既存の値を上書きできる", async () => {
  await updateHouseConfig(TOKYO);
  expect(await updateHouseConfig(OSAKA)).toEqual(OSAKA);
  expect(await getHouseConfig()).toEqual(OSAKA);
});

test.each([
  ["region が数値", '{"region": 123}'],
  ["laundryPositionFromAC が想定外の値", '{"laundryPositionFromAC": "back"}'],
  ["userComfortTemperature が文字列", '{"userComfortTemperature": "24"}'],
  ["userComfortTemperature が下限未満", '{"userComfortTemperature": 15.9}'],
  ["userComfortTemperature が上限超過", '{"userComfortTemperature": 28.1}'],
  ["userComfortTemperature が null", '{"userComfortTemperature": null}'],
  ["オブジェクトでない", '["tokyo"]'],
  ["null", "null"],
])("不正なファイル（%s）は読み込み時にエラーになり、更新でも上書きしない", async (_, content) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  await expect(getHouseConfig()).rejects.toThrow();
  await expect(updateHouseConfig(TOKYO)).rejects.toThrow();
  expect(await readFile(path, "utf8")).toBe(content);
});

test("項目が無いファイルはデフォルト値で補い、余計な項目は捨てる", async () => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, '{"unknown": 1}');
  expect(await getHouseConfig()).toEqual(DEFAULT);
});

test("快適温度が無い既存のファイルはデフォルト値で補い、他の項目は保持する", async () => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, '{"region": "tokyo", "laundryPositionFromAC": "left"}');
  expect(await getHouseConfig()).toEqual({ ...TOKYO, userComfortTemperature: 24 });
});

test.each([16, 28, 23.5])("快適温度は範囲内（%s℃）なら保存して読み出せる", async (userComfortTemperature) => {
  const config = { ...TOKYO, userComfortTemperature };
  await updateHouseConfig(config);
  expect(await getHouseConfig()).toEqual(config);
});
