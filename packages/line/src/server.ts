import { loadEnvFile } from "node:process";
import { createApplication, readApplicationConfig } from "./application.js";

try {
  loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
}

const config = readApplicationConfig(process.env);
const application = await createApplication(config);
const server = application.app.listen(config.port, () => {
  console.log(`LINE Botをポート${config.port}で起動しました。Webhook: /webhook`);
});

server.once("close", () => {
  void application.dispose().catch((error: unknown) => {
    console.error("乾燥サイクルの終了処理に失敗しました。", error);
    process.exitCode = 1;
  });
});
server.once("error", (error) => {
  console.error("LINE Botの起動に失敗しました。", error);
  process.exitCode = 1;
  void application.dispose().catch((disposeError: unknown) => {
    console.error("乾燥サイクルの終了処理に失敗しました。", disposeError);
  });
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close();
    server.closeIdleConnections();
  });
}
