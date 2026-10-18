import { LineBotClient } from "@line/bot-sdk";
import type { CoreApi } from "@os/api";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { createLineBot } from "./index.js";

const channelSecret = "test-channel-secret";
const replyMessage = vi.spyOn(LineBotClient.prototype, "replyMessage");
const getMessageContent = vi.spyOn(
  LineBotClient.prototype,
  "getMessageContentWithHttpInfo",
);
const core = {
  startDrying: vi.fn(async () => ({ estimatedDryingHours: 1 })),
  leaveHouse: vi.fn(async () => ({ estimatedDryingHours: 1 })),
  arriveHouse: vi.fn(async () => undefined),
  hangLaundryEvidence: vi.fn(async () => ({ estimatedDryingHours: 1 })),
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
  getMessageContent.mockRestore();
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

test("文字を打たれてもCoreApiは呼ばず、メニューを案内する", async () => {
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
  expect(core.leaveHouse).not.toHaveBeenCalled();
  expect(replyMessage).toHaveBeenCalledExactlyOnceWith({
    replyToken: "test-reply-token",
    messages: [{ type: "text", text: "画面下のメニューから選んでください。" }],
  });
});

test("スタンプや返信トークンのないイベントには返信しない", async () => {
  const body = JSON.stringify({
    destination: "test-bot",
    events: [
      { type: "follow", replyToken: "follow-token" },
      {
        type: "message",
        replyToken: "sticker-token",
        message: { type: "sticker", id: "sticker-id" },
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

test("「いってきます」ボタンを押すとleaveHouseを呼び、返信する", async () => {
  const body = JSON.stringify({
    destination: "test-bot",
    events: [
      {
        type: "postback",
        replyToken: "test-reply-token",
        postback: { data: "leave-house" },
      },
    ],
  });
  const response = await postWebhook(body, sign(body));
  expect(response.status).toBe(200);
  expect(core.leaveHouse).toHaveBeenCalledOnce();
  expect(replyMessage).toHaveBeenCalledExactlyOnceWith({
    replyToken: "test-reply-token",
    messages: [
      { type: "text", text: "いってらっしゃい！\n洗濯物の乾燥を始めます。\n乾燥完了までの目安：あと約1時間です。" },
    ],
  });
});

test("タブを切り替えても返信しない", async () => {
  const body = JSON.stringify({
    destination: "test-bot",
    events: [
      {
        type: "postback",
        replyToken: "test-reply-token",
        postback: { data: "switch-to-laundry-tab" },
      },
    ],
  });
  const response = await postWebhook(body, sign(body));
  expect(response.status).toBe(200);
  expect(replyMessage).not.toHaveBeenCalled();
});

test("写真を受け取るとダウンロードしてhangLaundryEvidenceに渡す", async () => {
  getMessageContent.mockResolvedValueOnce({
    httpResponse: new Response(null, {
      headers: { "content-type": "image/png" },
    }),
    body: Readable.from([Buffer.from([1, 2, 3])]),
  });
  const body = JSON.stringify({
    destination: "test-bot",
    events: [
      {
        type: "message",
        replyToken: "test-reply-token",
        message: { type: "image", id: "image-id" },
      },
    ],
  });
  const response = await postWebhook(body, sign(body));
  expect(response.status).toBe(200);
  expect(getMessageContent).toHaveBeenCalledExactlyOnceWith("image-id");
  expect(core.hangLaundryEvidence).toHaveBeenCalledExactlyOnceWith({
    data: Buffer.from([1, 2, 3]),
    mimeType: "image/png",
  });
  expect(replyMessage).toHaveBeenCalledExactlyOnceWith({
    replyToken: "test-reply-token",
    messages: [{ type: "text", text: "洗濯物の写真を受け取りました。\n乾燥完了までの目安：あと約1時間です。" }],
  });
});
