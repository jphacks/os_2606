import { expect, test } from "vitest";
import { decideWindDirectionHorizontal, decideWindDirectionVertical } from "../src/ac-wind-direction.js";

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
    expect(await decideWindDirectionHorizontal(position)).toBe(position);
  },
);
