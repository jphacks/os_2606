import { LineBotClient } from "@line/bot-sdk";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { afterEach, expect, test, vi } from "vitest";
import { setupRichMenus } from "./rich-menu.js";

vi.mock("node:process", () => ({ loadEnvFile: vi.fn() }));
vi.mock("./rich-menu.js", () => ({ setupRichMenus: vi.fn() }));
vi.mock("@line/bot-sdk", () => ({
  LineBotClient: { fromChannelAccessToken: vi.fn(() => ({})) },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
});

test("登録コマンドはルートの設定ファイルと同梱したPNG画像を読み込む", async () => {
  vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "test-token");

  await import("./setup-rich-menu.js");

  expect(loadEnvFile).toHaveBeenCalledExactlyOnceWith(
    resolve(import.meta.dirname, "../../../.env"),
  );
  expect(LineBotClient.fromChannelAccessToken).toHaveBeenCalledExactlyOnceWith({
    channelAccessToken: "test-token",
  });
  expect(setupRichMenus).toHaveBeenCalledOnce();
  const images = vi.mocked(setupRichMenus).mock.calls[0]![1];
  for (const image of [images.outing, images.laundry]) {
    expect(image.type).toBe("image/png");
    const bytes = Buffer.from(await image.arrayBuffer());
    expect(bytes.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(bytes.readUInt32BE(16)).toBe(2500);
    expect(bytes.readUInt32BE(20)).toBe(843);
  }
});

test("認証情報がなければLINEへアクセスしない", async () => {
  vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "");

  await expect(import("./setup-rich-menu.js")).rejects.toThrow(
    "LINE_CHANNEL_ACCESS_TOKENを設定してください。",
  );

  expect(LineBotClient.fromChannelAccessToken).not.toHaveBeenCalled();
  expect(setupRichMenus).not.toHaveBeenCalled();
});
