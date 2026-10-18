import { LineBotClient } from "@line/bot-sdk";
import { readFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { setupRichMenus } from "./rich-menu.js";

try {
  loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
}

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!channelAccessToken?.trim()) {
  throw new Error("LINE_CHANNEL_ACCESS_TOKENを設定してください。");
}

async function readImage(name: string): Promise<Blob> {
  const path = new URL(`../assets/${name}`, import.meta.url);
  return new Blob([await readFile(path)], { type: "image/png" });
}

const client = LineBotClient.fromChannelAccessToken({ channelAccessToken });
await setupRichMenus(client, {
  outing: await readImage("rich-menu-outing.png"),
  laundry: await readImage("rich-menu-laundry.png"),
});
console.log("リッチメニューを登録しました。");
