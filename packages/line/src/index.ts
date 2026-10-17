import { JSONParseError, LineBotClient, middleware, SignatureValidationFailed } from "@line/bot-sdk";
import type { webhook } from "@line/bot-sdk";
import type { LineApi } from "@os/api";
import express from "express";
import type { ErrorRequestHandler, Express } from "express";

export function createLineApi(channelAccessToken: string, userId: string): LineApi {
  if (!channelAccessToken.trim()) {
    throw new Error("チャネルアクセストークンを指定してください。");
  }
  if (!userId.trim()) {
    throw new Error("通知先のユーザーIDを指定してください。");
  }

  const client = LineBotClient.fromChannelAccessToken({ channelAccessToken });
  return {
    async sendNotificationFinishDrying(): Promise<void> {
      await client.pushMessage({
        to: userId,
        messages: [{ type: "text", text: "洗濯物の乾燥が完了しました。" }],
      });
    },
  };
}

export function createLineBot(channelSecret: string, channelAccessToken: string): Express {
  const app = express();
  const client = LineBotClient.fromChannelAccessToken({ channelAccessToken });

  app.post("/webhook", middleware({ channelSecret }), async (request, response) => {
    const body: webhook.CallbackRequest = request.body;
    for (const event of body.events) {
      if (event.type !== "message" || event.message.type !== "text" || !event.replyToken) {
        continue;
      }
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: "text", text: event.message.text }],
      });
    }
    response.sendStatus(200);
  });

  const handleError: ErrorRequestHandler = (error: unknown, _request, response, next) => {
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
