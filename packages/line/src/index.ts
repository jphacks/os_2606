import {
  JSONParseError,
  LineBotClient,
  middleware,
  SignatureValidationFailed,
} from "@line/bot-sdk";
import type { messagingApi, webhook } from "@line/bot-sdk";
import type { CoreApi, Image } from "@os/api";
import express from "express";
import type { ErrorRequestHandler, Express } from "express";
import { buffer } from "node:stream/consumers";
import { handleImage, handlePostback, handleText } from "./command.js";

export { createLineApi } from "./line-api.js";

export function createLineBot(
  channelSecret: string,
  channelAccessToken: string,
  core: CoreApi,
  allowedUserId?: string,
): Express {
  const app = express();
  const client = LineBotClient.fromChannelAccessToken({ channelAccessToken });

  app.get("/healthz", (_request, response) => {
    response.status(200).type("text/plain").send("ok");
  });

  // 写真はLINEのサーバーに置かれているので、ダウンロードする
  async function downloadImage(messageId: string): Promise<Image> {
    const { httpResponse, body } =
      await client.getMessageContentWithHttpInfo(messageId);
    return {
      data: await buffer(body),
      mimeType: httpResponse.headers.get("content-type") ?? "image/jpeg",
    };
  }

  // 届いたメッセージの種類（文字・写真・スタンプなど）で処理を分ける
  async function handleMessage(
    message: webhook.MessageContent,
  ): Promise<messagingApi.Message[]> {
    switch (message.type) {
      case "text":
        return handleText(message.text, core);
      case "image":
        return handleImage(await downloadImage(message.id), core);
      default:
        return [];
    }
  }

  // 出来事（メッセージ・ボタン）の種類で処理を分ける
  async function handleEvent(
    event: webhook.MessageEvent | webhook.PostbackEvent,
  ): Promise<messagingApi.Message[]> {
    switch (event.type) {
      case "message":
        return handleMessage(event.message);
      case "postback":
        return handlePostback(event.postback.data, core);
      default: {
        const exhaustiveCheck: never = event;
        return exhaustiveCheck;
      }
    }
  }

  app.post(
    "/webhook",
    middleware({ channelSecret }),
    async (request, response) => {
      const body: webhook.CallbackRequest = request.body;
      for (const event of body.events) {
        if (allowedUserId && (event.source?.type !== "user" || event.source.userId !== allowedUserId)) {
          continue;
        }
        if (
          (event.type !== "message" && event.type !== "postback") ||
          !event.replyToken
        ) {
          continue;
        }
        const messages = await handleEvent(event);
        if (messages.length === 0) {
          continue;
        }
        await client.replyMessage({ replyToken: event.replyToken, messages });
      }
      response.sendStatus(200);
    },
  );

  const handleError: ErrorRequestHandler = (
    error: unknown,
    _request,
    response,
    next,
  ) => {
    if (error instanceof SignatureValidationFailed) {
      response.sendStatus(401);
      return;
    }
    if (error instanceof JSONParseError) {
      response.sendStatus(400);
      return;
    }
    next(error);
  };
  app.use(handleError);

  return app;
}
