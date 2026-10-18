import { LineBotClient } from "@line/bot-sdk";
import { readFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { setupRichMenus } from "./rich-menu.js";

try {
  loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
}

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!channelAccessToken?.trim()) {
  throw new Error("LINE_CHANNEL_ACCESS_TOKENを設定してください。");
}

async function readImage(path: string): Promise<Blob> {
  return new Blob([await readFile(path)], { type: "image/png" });
}

const client = LineBotClient.fromChannelAccessToken({ channelAccessToken });
await setupRichMenus(client, {
  home: await readImage("assets/rich-menu-outing.png"),
  settings: await readImage("assets/rich-menu-laundry.png"),
});
console.log("リッチメニューを登録しました。");
