import { LineBotClient } from "@line/bot-sdk";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { createLineBot } from "./index.js";

const channelSecret = "test-channel-secret";
const replyMessage = vi.spyOn(LineBotClient.prototype, "replyMessage");
const server = createServer(createLineBot(channelSecret, "test-channel-access-token"));
let webhookUrl: string;

beforeEach(() => {
  replyMessage.mockReset().mockResolvedValue({ sentMessages: [] });
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
});

function sign(body: string): string {
  return createHmac("sha256", channelSecret).update(body).digest("base64");
}

test("起動確認は認証情報を返さずLINEにもアクセスしない", async () => {
  const response = await fetch(new URL("/healthz", webhookUrl));
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("ok");
  expect(replyMessage).not.toHaveBeenCalled();
});

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
