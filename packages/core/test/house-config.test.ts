import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { getHouseConfig, updateHouseConfig } from "../src/house-config.js";

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "house_config-"));
  path = join(dir, "nested", "house_config.json");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("ファイルが無ければデフォルト値を返す", async () => {
  expect(await getHouseConfig(path)).toEqual({ region: null });
});

test("新規追加の値がJSONに保存され、読み出せる", async () => {
  expect(await updateHouseConfig({ region: "tokyo" }, path)).toEqual({ region: "tokyo" });
  expect(await getHouseConfig(path)).toEqual({ region: "tokyo" });
});

test("既存の値を上書きできる", async () => {
  await updateHouseConfig({ region: "tokyo" }, path);
  expect(await updateHouseConfig({ region: "osaka" }, path)).toEqual({ region: "osaka" });
  expect(await getHouseConfig(path)).toEqual({ region: "osaka" });
});

test.each([
  ["region が数値", '{"region": 123}'],
  ["オブジェクトでない", '["tokyo"]'],
  ["null", "null"],
])("不正なファイル（%s）は読み込み時にエラーになり、更新でも上書きしない", async (_, content) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  await expect(getHouseConfig(path)).rejects.toThrow();
  await expect(updateHouseConfig({ region: "tokyo" }, path)).rejects.toThrow();
  expect(await readFile(path, "utf8")).toBe(content);
});

test("region が無いファイルはデフォルト値で補い、余計な項目は捨てる", async () => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, '{"unknown": 1}');
  expect(await getHouseConfig(path)).toEqual({ region: null });
});
