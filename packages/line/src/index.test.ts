import { LineBotClient } from "@line/bot-sdk";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { createLineApi, createLineBot } from "./index.js";

const channelSecret = "test-channel-secret";
const replyMessage = vi.spyOn(LineBotClient.prototype, "replyMessage");
const pushMessage = vi.spyOn(LineBotClient.prototype, "pushMessage");
const server = createServer(createLineBot(channelSecret, "test-channel-access-token"));
let webhookUrl: string;

beforeEach(() => {
  replyMessage.mockReset().mockResolvedValue({ sentMessages: [] });
  pushMessage.mockReset().mockResolvedValue({ sentMessages: [] });
});

beforeAll(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("テスト用サーバーのポートを取得できませんでした。");
  }
  webhookUrl = `http://127.0.0.1:${address.port}/webhook`;
});

afterAll(async () => {
  const closed = once(server, "close");
  server.close();
  server.closeAllConnections();
  await closed;
  replyMessage.mockRestore();
  pushMessage.mockRestore();
});

function sign(body: string): string {
  return createHmac("sha256", channelSecret).update(body).digest("base64");
}

async function postWebhook(body: string, signature?: string): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== undefined) {
    headers["x-line-signature"] = signature;
  }
  return fetch(webhookUrl, { method: "POST", headers, body });
}

test("接続確認の空イベントを受け付ける", async () => {
  const body = JSON.stringify({ destination: "test-bot", events: [] });
  const response = await postWebhook(body, sign(body));
  expect(response.status).toBe(200);
  expect(replyMessage).not.toHaveBeenCalled();
});

test("受信したテキストを改行や絵文字も含めてそのまま返信する", async () => {
  const text = "こんにちは\nそのまま返信してね 😀";
  const body = JSON.stringify({
    destination: "test-bot",
    events: [{ type: "message", replyToken: "test-reply-token", message: { type: "text", text } }],
  });
  const response = await postWebhook(body, sign(body));
  expect(response.status).toBe(200);
  expect(replyMessage).toHaveBeenCalledExactlyOnceWith({
    replyToken: "test-reply-token",
    messages: [{ type: "text", text }],
  });
});

test("テキスト以外や返信トークンのないイベントには返信しない", async () => {
  const body = JSON.stringify({
    destination: "test-bot",
    events: [
      { type: "follow", replyToken: "follow-token" },
      { type: "message", replyToken: "image-token", message: { type: "image", id: "image-id" } },
      { type: "message", message: { type: "text", text: "返信トークンなし" } },
    ],
  });
  const response = await postWebhook(body, sign(body));
  expect(response.status).toBe(200);
  expect(replyMessage).not.toHaveBeenCalled();
});

test("返信に失敗した場合は成功を返さない", async () => {
  replyMessage.mockRejectedValueOnce(new Error("返信に失敗しました。"));
  const body = JSON.stringify({
    destination: "test-bot",
    events: [{ type: "message", replyToken: "test-reply-token", message: { type: "text", text: "テスト" } }],
  });
  const response = await postWebhook(body, sign(body));
  expect(response.status).toBe(500);
});

test("署名のないリクエストを拒否する", async () => {
  const response = await postWebhook('{"events":[]}');
  expect(response.status).toBe(401);
  expect(replyMessage).not.toHaveBeenCalled();
});

test("署名後に改ざんされた本文を拒否する", async () => {
  const signature = sign('{"events":[]}');
  const response = await postWebhook('{"events":[{"type":"follow"}]}', signature);
  expect(response.status).toBe(401);
  expect(replyMessage).not.toHaveBeenCalled();
});

test("署名が正しくても不正なJSONは拒否する", async () => {
  const body = "{";
  const response = await postWebhook(body, sign(body));
  expect(response.status).toBe(400);
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
