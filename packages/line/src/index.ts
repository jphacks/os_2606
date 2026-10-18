import { handleText, quickReply } from "./command.js";
import {
  JSONParseError,
  LineBotClient,
  middleware,
  SignatureValidationFailed,
} from "@line/bot-sdk";
import type { webhook } from "@line/bot-sdk";
import type { CoreApi } from "@os/api";
import express from "express";
import type { ErrorRequestHandler, Express } from "express";

export { createLineApi } from "./line-api.js";

export function createLineBot(
  channelSecret: string,
  channelAccessToken: string,
  core: CoreApi,
): Express {
  const app = express();
  const client = LineBotClient.fromChannelAccessToken({ channelAccessToken });

  app.post(
    "/webhook",
    middleware({ channelSecret }),
    async (request, response) => {
      const body: webhook.CallbackRequest = request.body;
      for (const event of body.events) {
        if (
          event.type !== "message" ||
          event.message.type !== "text" ||
          !event.replyToken
        ) {
          continue;
        }
        const replyText = await handleText(event.message.text, core);
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: "text", text: replyText, quickReply }],
        });
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
