import { LineBotClient } from "@line/bot-sdk";
import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { createLineApi } from "./line-api.js";

const replyMessage = vi.spyOn(LineBotClient.prototype, "replyMessage");
const pushMessage = vi.spyOn(LineBotClient.prototype, "pushMessage");

beforeEach(() => {
  replyMessage.mockReset().mockResolvedValue({ sentMessages: [] });
  pushMessage.mockReset().mockResolvedValue({ sentMessages: [] });
});

afterAll(() => {
  replyMessage.mockRestore();
  pushMessage.mockRestore();
});

test("指定したユーザーに乾燥完了をプッシュ通知する", async () => {
  const api = createLineApi("test-channel-access-token", "test-user-id");

  await expect(api.sendNotificationFinishDrying()).resolves.toBeUndefined();

  expect(pushMessage).toHaveBeenCalledExactlyOnceWith({
    to: "test-user-id",
    messages: [{ type: "text", text: "洗濯物の乾燥が完了しました。" }],
  });
  expect(replyMessage).not.toHaveBeenCalled();
});

test("乾燥完了の通知先をAPIごとに保持する", async () => {
  const first = createLineApi("test-channel-access-token", "first-user-id");
  const second = createLineApi("test-channel-access-token", "second-user-id");

  await first.sendNotificationFinishDrying();
  await second.sendNotificationFinishDrying();

  expect(pushMessage.mock.calls.map(([request]) => request.to)).toEqual([
    "first-user-id",
    "second-user-id",
  ]);
});

test("乾燥完了の通知に失敗した場合は呼び出し元にエラーを返す", async () => {
  const error = new Error("通知に失敗しました。");
  pushMessage.mockRejectedValueOnce(error);
  const api = createLineApi("test-channel-access-token", "test-user-id");

  await expect(api.sendNotificationFinishDrying()).rejects.toBe(error);
  expect(pushMessage).toHaveBeenCalledOnce();
});

test.each(["", " \n\t"])("アクセストークンが空の場合は通知用APIを作成しない: %j", (token) => {
  expect(() => createLineApi(token, "test-user-id")).toThrow("チャネルアクセストークン");
  expect(pushMessage).not.toHaveBeenCalled();
});

test.each(["", " \n\t"])("通知先が空の場合は通知用APIを作成しない: %j", (userId) => {
  expect(() => createLineApi("test-channel-access-token", userId)).toThrow("通知先のユーザーID");
  expect(pushMessage).not.toHaveBeenCalled();
});
