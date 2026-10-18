import { LineBotClient } from "@line/bot-sdk";
import type { CycleOptions } from "@os/core";
import type { AcMessage } from "@os/api";
import { decideNextOperation, DEFAULT_DRYING_CONFIG } from "@os/core/drying";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { beforeEach, expect, test, vi } from "vitest";
import { createApplication, readApplicationConfig } from "./application.js";

const hardware = vi.hoisted(() => ({
  now: 0,
  tick: async () => {},
  remote: { supports: vi.fn((_message: AcMessage) => true), send: vi.fn(async () => {}), stop: vi.fn(async () => {}) },
  sensor: { measure: vi.fn(async () => ({ temperature: 24, humidity: 70 })) },
  loadRemote: vi.fn(),
  loadSensor: vi.fn(),
}));
vi.mock("@os/sensor", () => ({
  loadRemoteControl: () => { hardware.loadRemote(); return Promise.resolve(hardware.remote); },
  loadTemperatureSensor: () => { hardware.loadSensor(); return Promise.resolve(hardware.sensor); },
}));
vi.mock("@os/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@os/core")>();
  return {
    ...actual,
    createCycle: (options: CycleOptions) => actual.createCycle(options, {
      now: () => hardware.now,
      createTask: (_expression, callback) => {
        hardware.tick = callback;
        return { start() {}, stop() {}, destroy() {} };
      },
    }),
  };
});

const env = {
  LINE_CHANNEL_SECRET: "test-secret", LINE_CHANNEL_ACCESS_TOKEN: "test-token",
  OUTDOOR_TEMPERATURE: "18", OUTDOOR_HUMIDITY: "60",
};

beforeEach(() => {
  vi.clearAllMocks();
  hardware.now = 0;
  hardware.remote.supports.mockReturnValue(true);
});

test("リモコンの初期化に失敗したら仮実装で起動せず、エラーを返す", async () => {
  hardware.loadRemote.mockImplementationOnce(() => { throw new Error("remote state invalid"); });
  await expect(createApplication(readApplicationConfig(env))).rejects.toThrow("remote state invalid");
  expect(hardware.remote.send).not.toHaveBeenCalled();
});

test("デバイスが存在しても初回測定に失敗したらWebhookを公開しない", async () => {
  hardware.sensor.measure.mockRejectedValueOnce(new Error("sensor read failed"));
  await expect(createApplication(readApplicationConfig(env))).rejects.toThrow("sensor read failed");
  expect(hardware.remote.send).not.toHaveBeenCalled();
});

test.each(["OUTDOOR_TEMPERATURE", "OUTDOOR_HUMIDITY"])("必須設定%sがなければ起動しない", (name) => {
  expect(() => readApplicationConfig({ ...env, [name]: " " })).toThrow(name);
});
test.each([
  ["PORT", "3000.5"], ["OUTDOOR_TEMPERATURE", "NaN"], ["OUTDOOR_HUMIDITY", "101"], ["COMFORT_TEMPERATURE", "29"],
])("不正な設定%s=%sで起動しない", (name, value) => {
  expect(() => readApplicationConfig({ ...env, [name]: value })).toThrow(name);
});

test.each([false, true])("Webhookから送信・停止・通知まで実行する（自動除湿のみ対応=%s）", async (automaticOnly) => {
  if (automaticOnly) {
    // Sharpと同じく、除湿ではfanSpeedというプロパティ自体を受け付けない。
    hardware.remote.supports.mockImplementation((message) => message.acMode === "dehumidify" && !("fanSpeed" in message));
  }
  const reply = vi.spyOn(LineBotClient.prototype, "replyMessage").mockResolvedValue({ sentMessages: [] });
  const broadcast = vi.spyOn(LineBotClient.prototype, "broadcast").mockResolvedValue({});
  const config = readApplicationConfig(env);
  const application = await createApplication(config);
  expect(hardware.sensor.measure).toHaveBeenCalledOnce();
  const server = createServer(application.app);
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("テスト用ポートがありません。");
    const port = address.port;
    async function send(text: string, userId = "owner") {
      const body = JSON.stringify({ events: [{
        type: "message", source: { type: "user", userId }, replyToken: "test-reply",
        message: { type: "text", id: "message-id", text },
      }] });
      return fetch(`http://127.0.0.1:${port}/webhook`, {
        method: "POST", body,
        headers: { "content-type": "application/json", "x-line-signature": createHmac("sha256", env.LINE_CHANNEL_SECRET).update(body).digest("base64") },
      });
    }
    expect((await send("洗濯したよ")).status).toBe(200);
    expect(hardware.loadRemote).toHaveBeenCalledOnce();
    expect(hardware.loadSensor).toHaveBeenCalledOnce();
    expect(hardware.sensor.measure).toHaveBeenCalledTimes(2);
    expect(hardware.remote.supports).toHaveBeenCalled();
    const context = {
      indoorTemperature: 24, indoorHumidity: 70, outdoorTemperature: 18, outdoorHumidity: 60,
      comfortTemperature: 24, presenceMode: "home" as const, dryingProgress: 0,
    };
    let expected = decideNextOperation(context);
    if (automaticOnly) {
      expected = decideNextOperation(context, {
        ...DEFAULT_DRYING_CONFIG,
        capabilities: {
          modes: ["dehumidify"], fanSpeeds: { cool: [], heat: [], dehumidify: [] },
          allowOff: false, allowAutomaticDehumidify: true,
        },
      });
    }
    if (expected.mode === "off") throw new Error("在宅の初回計画で停止は選ばれません。");
    if (automaticOnly) {
      expect(hardware.remote.supports).toHaveBeenCalledWith({ acMode: "dehumidify", temperature: 24 });
      expect(hardware.remote.send).toHaveBeenCalledExactlyOnceWith({ acMode: "dehumidify", temperature: 24 });
    } else {
      expect(hardware.remote.send).toHaveBeenCalledExactlyOnceWith({
        acMode: expected.mode, temperature: expected.temperature, fanSpeed: expected.fanSpeed,
      });
    }
    expect(reply).toHaveBeenCalledOnce();
    expect(broadcast).toHaveBeenCalledExactlyOnceWith({
      messages: [{ type: "text", text: `エアコンの設定温度を${expected.temperature}℃にしました。` }],
    });
    expect((await send("洗濯したよ", "someone-else")).status).toBe(200);
    expect(reply).toHaveBeenCalledTimes(2);
    expect(hardware.remote.send).toHaveBeenCalledOnce();
    hardware.now = expected.estimatedDryingHours * 3_600_000;
    await hardware.tick();
    expect(hardware.remote.stop).toHaveBeenCalledOnce();
    expect(broadcast).toHaveBeenLastCalledWith({
      messages: [{ type: "text", text: "洗濯物の乾燥が完了しました。" }],
    });
    expect(hardware.remote.stop.mock.invocationCallOrder[0]).toBeLessThan(broadcast.mock.invocationCallOrder[1]!);
    // 次の乾燥は別のユーザーも開始でき、通知は再び一斉配信する。
    expect((await send("洗濯したよ", "someone-else")).status).toBe(200);
    expect(hardware.remote.send).toHaveBeenCalledTimes(2);
    hardware.now += expected.estimatedDryingHours * 3_600_000;
    await hardware.tick();
    expect(broadcast).toHaveBeenCalledTimes(3); // 初回設定と2回の完了。同じ温度の再設定は通知しない。
  } finally {
    await application.dispose();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    reply.mockRestore();
    broadcast.mockRestore();
  }
});
