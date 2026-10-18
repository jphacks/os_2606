import { LineBotClient } from "@line/bot-sdk";
import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { createLineApi } from "./line-api.js";

const broadcast = vi.spyOn(LineBotClient.prototype, "broadcast");
const pushMessage = vi.spyOn(LineBotClient.prototype, "pushMessage");

beforeEach(() => {
  broadcast.mockReset().mockResolvedValue({});
  pushMessage.mockReset();
});

afterAll(() => {
  broadcast.mockRestore();
  pushMessage.mockRestore();
});

test("ユーザーIDの指定なしで友だち全員に乾燥完了を一斉配信する", async () => {
  const api = createLineApi("test-channel-access-token");
  await expect(api.sendNotificationFinishDrying()).resolves.toBeUndefined();
  expect(broadcast).toHaveBeenCalledExactlyOnceWith({
    messages: [{ type: "text", text: "洗濯物の乾燥が完了しました。" }],
  });
  expect(pushMessage).not.toHaveBeenCalled();
});

test.each([
  ["cool", "冷房"], ["heat", "暖房"], ["dehumidify", "除湿"],
] as const)("設定温度と運転モード%sを友だち全員に通知する", async (mode, label) => {
  await createLineApi("test-token").sendNotificationTemperatureChanged(26.5, mode);
  expect(broadcast).toHaveBeenCalledExactlyOnceWith({
    messages: [{ type: "text", text: `エアコンを${label}・設定温度26.5℃にしました。` }],
  });
});

test("一斉配信に失敗した場合はエラーを返して再試行できる", async () => {
  const error = new Error("broadcast failed");
  broadcast.mockRejectedValueOnce(error);
  const api = createLineApi("test-channel-access-token");
  await expect(api.sendNotificationFinishDrying()).rejects.toBe(error);
  await expect(api.sendNotificationFinishDrying()).resolves.toBeUndefined();
  expect(broadcast).toHaveBeenCalledTimes(2);
});

test.each(["", " \n\t"])("アクセストークンが空なら通知用APIを作成しない: %j", (token) => {
  expect(() => createLineApi(token)).toThrow("チャネルアクセストークン");
  expect(broadcast).not.toHaveBeenCalled();
});
