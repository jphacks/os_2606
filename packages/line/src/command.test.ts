import type { CoreApi } from "@os/api";
import { beforeEach, expect, test, vi } from "vitest";
import { BUTTON_TEXTS, handleText } from "./command.js";

const core = {
  leaveHouse: vi.fn(async () => {}),
  arriveHouse: vi.fn(async () => {}),
  hangLaundryEvidence: vi.fn(async () => {}),
  laundryPositionFromAC: vi.fn(async () => {}),
  setUpHouseConfig: vi.fn(async () => {}),
} satisfies CoreApi;

beforeEach(() => {
  vi.clearAllMocks();
});

test("「いってきます」でleaveHouseを呼ぶ", async () => {
  expect(await handleText("いってきます", core)).toBe("いってらっしゃい！");
  expect(core.leaveHouse).toHaveBeenCalledOnce();
});

test("「ただいま」でarriveHouseを呼ぶ", async () => {
  expect(await handleText("ただいま", core)).toBe("おかえりなさい！");
  expect(core.arriveHouse).toHaveBeenCalledOnce();
});

test.each([
  ["左", "left"],
  ["中央", "center"],
  ["右", "right"],
] as const)("「%s」で洗濯物の位置を %s にする", async (text, position) => {
  await handleText(text, core);
  expect(core.laundryPositionFromAC).toHaveBeenCalledExactlyOnceWith(position);
});

test("前後の空白や改行は無視する", async () => {
  await handleText("  いってきます\n", core);
  expect(core.leaveHouse).toHaveBeenCalledOnce();
});

test("決まっていない文字ではCoreApiを呼ばない", async () => {
  expect(await handleText("こんにちは", core)).toBe(
    "下のボタンから選んでください。",
  );
  for (const method of Object.values(core)) {
    expect(method).not.toHaveBeenCalled();
  }
});

test.each(BUTTON_TEXTS)("ボタン「%s」には専用の返信がある", async (text) => {
  expect(await handleText(text, core)).not.toBe(
    "下のボタンから選んでください。",
  );
});
