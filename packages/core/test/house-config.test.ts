import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  getHouseConfig,
  getLaundryPositionFromAC,
  updateHouseConfig,
  updateLaundryPositionFromAC,
} from "../src/house-config/house-config.js";
import type { HouseConfig } from "../src/house-config/types/house-config.js";
import type { LaundryPosition } from "../src/types/laundry.js";

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

const DEFAULT: HouseConfig = { region: null, laundryPositionFromAC: "center" };
const TOKYO: HouseConfig = { region: "tokyo", laundryPositionFromAC: "left" };
const OSAKA: HouseConfig = { region: "osaka", laundryPositionFromAC: "right" };

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

test("洗濯物の位置を書き込むと、ファイルが無くても他の項目はデフォルト値で保存される", async () => {
  await updateLaundryPositionFromAC("right");
  expect(await getHouseConfig()).toEqual({ ...DEFAULT, laundryPositionFromAC: "right" });
});

test("洗濯物の位置を書き込んでも、既存の他の項目は保持される", async () => {
  await updateHouseConfig(TOKYO);
  await updateLaundryPositionFromAC("center");
  expect(await getHouseConfig()).toEqual({ ...TOKYO, laundryPositionFromAC: "center" });
  expect(await getLaundryPositionFromAC()).toBe("center");
});

test("想定外の洗濯物の位置はエラーになり、ファイルを書き換えない", async () => {
  await updateHouseConfig(TOKYO);
  const before = await readFile(path, "utf8");
  await expect(updateLaundryPositionFromAC("back" as LaundryPosition)).rejects.toThrow();
  expect(await readFile(path, "utf8")).toBe(before);
});

test("設定ファイルが不正なら洗濯物の位置の書き込みもエラーになり、上書きしない", async () => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, '{"region": 123}');
  await expect(updateLaundryPositionFromAC("left")).rejects.toThrow();
  expect(await readFile(path, "utf8")).toBe('{"region": 123}');
});
