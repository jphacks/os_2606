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
  await createLineApi("test-token").sendNotificationDryingPlan({ mode, temperature: 26.5, fanSpeed: "high", estimatedDryingHours: 1.5, presenceMode: "home" });
  expect(broadcast).toHaveBeenCalledExactlyOnceWith({
    messages: [{ type: "text", text: `運転計画（在宅中）\n${label}・設定温度26.5℃・風量強\n乾燥完了までの目安：あと約1時間30分です。` }],
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

test("外出中の停止計画と予測不能を表示する", async () => {
  await createLineApi("test-token").sendNotificationDryingPlan({ mode: "off", estimatedDryingHours: Infinity, presenceMode: "away" });
  expect(broadcast).toHaveBeenCalledExactlyOnceWith({
    messages: [{ type: "text", text: "運転計画（外出中）\nエアコンは停止\n現在の条件では乾燥完了までの時間を予測できません。" }],
  });
});
test.each([
  ["low", "弱"], ["medium", "中"], [undefined, "自動"],
] as const)("計画の風量%sを表示する", async (fanSpeed, label) => {
  await createLineApi("test-token").sendNotificationDryingPlan({ mode: "dehumidify", temperature: 24, fanSpeed, estimatedDryingHours: 0.25, presenceMode: "away" });
  expect(broadcast).toHaveBeenCalledExactlyOnceWith({
    messages: [{ type: "text", text: `運転計画（外出中）\n除湿・設定温度24℃・風量${label}\n乾燥完了までの目安：あと約15分です。` }],
  });
});
