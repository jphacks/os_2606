import { loadEnvFile } from "node:process";
import { createLineBot } from "./index.js";

try {
  loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
}

const channelSecret = process.env.LINE_CHANNEL_SECRET;
if (!channelSecret?.trim()) {
  throw new Error("LINE_CHANNEL_SECRETを設定してください。");
}

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!channelAccessToken?.trim()) {
  throw new Error("LINE_CHANNEL_ACCESS_TOKENを設定してください。");
}

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORTには1〜65535の整数を指定してください。");
}

createLineBot(channelSecret, channelAccessToken).listen(port, () => {
  console.log(`LINE Botをポート${port}で起動しました。Webhook: /webhook`);
});
