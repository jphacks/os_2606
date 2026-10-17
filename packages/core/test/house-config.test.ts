import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
