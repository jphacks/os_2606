import { expect, test, vi } from "vitest";
import { handlePostback, handleText } from "./command.js";
import { POSTBACK_DATA } from "./postback-data.js";
import { createRuntime } from "./runtime.js";
import type { CycleDependencies } from "@os/core";

test("LINEコマンドから観測・実機操作・停止・完了通知までつながる", async () => {
  let now = 0;
  let tick = async () => {};
  const sensor = { measure: vi.fn(async () => ({ temperature: 24, humidity: 70 })) };
  const remoteControl = { send: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
  const onFinishDrying = vi.fn(async () => {});
  const decide = vi.fn<CycleDependencies["decideNextOperation"]>(() => ({
    mode: "heat" as const, temperature: 26, fanSpeed: "high" as const, estimatedDryingHours: 1,
  }));
  const runtime = createRuntime({
    sensor, remoteControl, onFinishDrying, onError: vi.fn(),
    outdoorTemperature: 18, outdoorHumidity: 60, comfortTemperature: 24,
  }, {
    now: () => now,
    decideNextOperation: decide,
    createTask: (_expression, callback) => {
      tick = callback;
      return { start() {}, stop() {}, destroy() {} };
    },
  });
  try {
    expect(await handleText("洗濯したよ", runtime.core)).toEqual([
      { type: "text", text: "乾燥を開始しました！\n乾燥完了までの目安：あと約1時間です。" },
    ]);
    expect(sensor.measure).toHaveBeenCalledOnce();
    expect(decide).toHaveBeenLastCalledWith({
      indoorTemperature: 24, indoorHumidity: 70,
      outdoorTemperature: 18, outdoorHumidity: 60, comfortTemperature: 24,
      presenceMode: "home", dryingProgress: 0,
    }, undefined);
    expect(remoteControl.send).toHaveBeenCalledExactlyOnceWith({ acMode: "heat", temperature: 26, fanSpeed: "high" });
    now = 600_000;
    expect(await handlePostback(POSTBACK_DATA.leaveHouse, runtime.core)).toEqual([
      { type: "text", text: "いってらっしゃい！\n洗濯物の乾燥を始めます。\n乾燥完了までの目安：あと約1時間です。" },
    ]);
    expect(decide.mock.calls.at(-1)?.[0]).toMatchObject({ presenceMode: "away" });
    expect(await handlePostback(POSTBACK_DATA.arriveHouse, runtime.core)).toEqual([
      { type: "text", text: "おかえりなさい！\n乾燥完了までの目安：あと約1時間です。" },
    ]);
    expect(decide.mock.calls.at(-1)?.[0]).toMatchObject({ presenceMode: "home" });
    now += 3_600_000;
    await tick();
    expect(remoteControl.stop).toHaveBeenCalledOnce();
    expect(onFinishDrying).toHaveBeenCalledOnce();
  } finally {
    await runtime.dispose();
  }
});
