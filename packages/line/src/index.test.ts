import { quickReply } from "./command.js";
import { LineBotClient } from "@line/bot-sdk";
import type { CoreApi } from "@os/api";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { createLineBot } from "./index.js";

const channelSecret = "test-channel-secret";
const replyMessage = vi.spyOn(LineBotClient.prototype, "replyMessage");
const core = {
  leaveHouse: vi.fn(async () => {}),
  arriveHouse: vi.fn(async () => {}),
  hangLaundryEvidence: vi.fn(async () => {}),
  laundryPositionFromAC: vi.fn(async () => {}),
  setUpHouseConfig: vi.fn(async () => {}),
} satisfies CoreApi;
const server = createServer(
  createLineBot(channelSecret, "test-channel-access-token", core),
);
let webhookUrl: string;

beforeEach(() => {
  vi.clearAllMocks();
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

async function postWebhook(
  body: string,
  signature?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
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

test("決まっていない文字には使い方とボタンを返信する", async () => {
  const body = JSON.stringify({
    destination: "test-bot",
    events: [
      {
        type: "message",
        replyToken: "test-reply-token",
        message: { type: "text", text: "こんにちは" },
      },
    ],
  });
  const response = await postWebhook(body, sign(body));
  expect(response.status).toBe(200);
  expect(replyMessage).toHaveBeenCalledExactlyOnceWith({
    replyToken: "test-reply-token",
    messages: [
      { type: "text", text: "下のボタンから選んでください。", quickReply },
    ],
  });
});

test("テキスト以外や返信トークンのないイベントには返信しない", async () => {
  const body = JSON.stringify({
    destination: "test-bot",
    events: [
      { type: "follow", replyToken: "follow-token" },
      {
        type: "message",
        replyToken: "image-token",
        message: { type: "image", id: "image-id" },
      },
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
    events: [
      {
        type: "message",
        replyToken: "test-reply-token",
        message: { type: "text", text: "テスト" },
      },
    ],
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
  const response = await postWebhook(
    '{"events":[{"type":"follow"}]}',
    signature,
  );
  expect(response.status).toBe(401);
  expect(replyMessage).not.toHaveBeenCalled();
});

test("署名が正しくても不正なJSONは拒否する", async () => {
  const body = "{";
  const response = await postWebhook(body, sign(body));
  expect(response.status).toBe(400);
});

test("「いってきます」を受け取るとleaveHouseを呼び、いってらっしゃいと返信する", async () => {
  const body = JSON.stringify({
    destination: "test-bot",
    events: [
      {
        type: "message",
        replyToken: "test-reply-token",
        message: { type: "text", text: "いってきます" },
      },
    ],
  });
  const response = await postWebhook(body, sign(body));
  expect(response.status).toBe(200);
  expect(core.leaveHouse).toHaveBeenCalledOnce();
  expect(replyMessage).toHaveBeenCalledExactlyOnceWith({
    replyToken: "test-reply-token",
    messages: [{ type: "text", text: "いってらっしゃい！", quickReply }],
  });
});
