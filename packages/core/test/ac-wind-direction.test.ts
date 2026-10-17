import { expect, test, vi } from "vitest";
import { decideWindDirectionHorizontal, decideWindDirectionVertical } from "../src/ac-wind-direction.js";
import { getHouseConfig } from "../src/house-config.js";

// 実際の設定ファイルを読まないよう、家の設定の読み込みを差し替える
vi.mock("../src/house-config.js", () => ({ getHouseConfig: vi.fn() }));

test.each([
  ["cool", "up"],
  ["dehumidify", "up"],
  ["heat", "middle"],
] as const)("垂直方向: %s のときは %s", (acMode, expected) => {
  expect(decideWindDirectionVertical(acMode)).toBe(expected);
});

test.each(["left", "center", "right"] as const)(
  "水平方向: 洗濯物が %s にあればその方向に風を送る",
  async (position) => {
    vi.mocked(getHouseConfig).mockResolvedValue({ region: null, laundryPositionFromAC: position });
    expect(await decideWindDirectionHorizontal()).toBe(position);
  },
);
