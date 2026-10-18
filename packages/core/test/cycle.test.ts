import { expect, test, vi } from "vitest";
import { createCycle } from "../src/cycle/index.js";
import type { CycleDependencies } from "../src/cycle/index.js";
import type { DryingDecision } from "../src/drying/index.js";

function setup() {
  let time = 0;
  let tick: () => Promise<void> = async () => {};
  const task = { start: vi.fn(), stop: vi.fn(), destroy: vi.fn() };
  const createTask = vi.fn<CycleDependencies["createTask"]>((_expression, callback) => {
    tick = callback;
    return task;
  });
  const decideNextOperation = vi.fn<CycleDependencies["decideNextOperation"]>(() => ({
    mode: "heat", temperature: 26, fanSpeed: "high", estimatedDryingHours: 1,
  }));
  const options = {
    getContext: vi.fn(async () => ({
      indoorTemperature: 24, indoorHumidity: 70,
      outdoorTemperature: 18, outdoorHumidity: 60,
    })),
    remoteControl: { send: vi.fn(async () => {}), stop: vi.fn(async () => {}) },
    onFinishDrying: vi.fn(async () => {}),
    onError: vi.fn(),
  };
  const cycle = createCycle(options, { now: () => time, createTask, decideNextOperation });
  return {
    cycle, options, task, createTask, decideNextOperation,
    setTime: (value: number) => { time = value; },
    tick: () => tick(),
  };
}

test.each([
  ["leaveHouse", "away"], ["arriveHouse", "home"],
] as const)("%s を handler から引数なしで呼ぶと %s の計画を送信する", async (method, presenceMode) => {
  const f = setup();
  expect(f.task.start).not.toHaveBeenCalled();
  await f.cycle[method]();
  expect(f.decideNextOperation).toHaveBeenCalledWith(expect.objectContaining({ presenceMode, dryingProgress: 0 }), undefined);
  expect(f.options.remoteControl.send).toHaveBeenCalledWith({ acMode: "heat", temperature: 26, fanSpeed: "high" });
  expect(f.createTask).toHaveBeenCalledWith("* * * * *", expect.any(Function));
  expect(f.task.start).toHaveBeenCalledOnce();
});

test("予測時刻までは通知せず、到達後に停止と完了コールバックを一度だけ呼ぶ", async () => {
  const f = setup();
  await f.cycle.leaveHouse();
  f.setTime(3_599_999);
  await f.tick();
  expect(f.options.onFinishDrying).not.toHaveBeenCalled();
  f.setTime(3_600_000);
  await Promise.all([f.tick(), f.tick()]);
  expect(f.options.remoteControl.stop).toHaveBeenCalledOnce();
  expect(f.options.onFinishDrying).toHaveBeenCalledOnce();
  expect(f.task.stop).toHaveBeenCalledOnce();
});

test("同じ外出通知を重複して受けても予測終了時刻を延長しない", async () => {
  const f = setup();
  await f.cycle.leaveHouse();
  f.setTime(1_800_000);
  await f.cycle.leaveHouse();
  expect(f.options.getContext).toHaveBeenCalledOnce();
  f.setTime(3_600_000);
  await f.tick();
  expect(f.options.onFinishDrying).toHaveBeenCalledOnce();
});

test("帰宅では観測進捗を引き継いで再計画し、終了時刻を置き換える", async () => {
  const f = setup();
  await f.cycle.leaveHouse();
  f.setTime(1_800_000);
  f.decideNextOperation.mockReturnValue({ mode: "cool", temperature: 24, fanSpeed: "low", estimatedDryingHours: 2 });
  await f.cycle.arriveHouse();
  const context = f.decideNextOperation.mock.calls[1]?.[0];
  expect(context?.presenceMode).toBe("home");
  expect(context?.dryingProgress).toBeGreaterThan(0);
  f.setTime(3_600_000);
  await f.tick();
  expect(f.options.onFinishDrying).not.toHaveBeenCalled();
  f.setTime(9_000_000);
  await f.tick();
  expect(f.options.onFinishDrying).toHaveBeenCalledOnce();
});

test("通知失敗を報告し、次の cron で通知のみ再試行する", async () => {
  const f = setup();
  const error = new Error("LINE failure");
  f.options.onFinishDrying.mockRejectedValueOnce(error);
  await f.cycle.leaveHouse();
  f.setTime(3_600_000);
  await f.tick();
  expect(f.options.onError).toHaveBeenCalledWith(error);
  expect(f.task.stop).not.toHaveBeenCalled();
  await f.tick();
  expect(f.options.remoteControl.stop).toHaveBeenCalledOnce();
  expect(f.options.onFinishDrying).toHaveBeenCalledTimes(2);
  expect(f.task.stop).toHaveBeenCalledOnce();
});

test("停止失敗時は通知せず、次の cron で停止から再試行する", async () => {
  const f = setup();
  f.options.remoteControl.stop.mockRejectedValueOnce(new Error("IR failure"));
  await f.cycle.leaveHouse();
  f.setTime(3_600_000);
  await f.tick();
  expect(f.options.onFinishDrying).not.toHaveBeenCalled();
  await f.tick();
  expect(f.options.remoteControl.stop).toHaveBeenCalledTimes(2);
  expect(f.options.onFinishDrying).toHaveBeenCalledOnce();
});

test("handler の実機操作失敗を返し、再呼び出しできる", async () => {
  const f = setup();
  f.options.remoteControl.send.mockRejectedValueOnce(new Error("IR failure"));
  await expect(f.cycle.leaveHouse()).rejects.toThrow("IR failure");
  expect(f.task.start).not.toHaveBeenCalled();
  await f.cycle.leaveHouse();
  expect(f.task.start).toHaveBeenCalledOnce();
});

test.each<DryingDecision>([
  { mode: "off", estimatedDryingHours: Infinity },
  { mode: "heat", temperature: 26, fanSpeed: "high", estimatedDryingHours: Infinity },
])("予測が Infinity なら通知しない: $mode", async (plan) => {
  const f = setup();
  f.decideNextOperation.mockReturnValue(plan);
  await f.cycle.leaveHouse();
  f.setTime(30 * 24 * 3_600_000);
  await f.tick();
  expect(f.options.onFinishDrying).not.toHaveBeenCalled();
});

test("残り0時間なら次の cron で通知する", async () => {
  const f = setup();
  f.decideNextOperation.mockReturnValue({ mode: "off", estimatedDryingHours: 0 });
  await f.cycle.arriveHouse();
  await f.tick();
  expect(f.options.remoteControl.stop).toHaveBeenCalledOnce();
  expect(f.options.onFinishDrying).toHaveBeenCalledOnce();
});

test("破棄すると cron が終了し、以後の操作を受け付けない", async () => {
  const f = setup();
  await f.cycle.leaveHouse();
  await f.cycle.dispose();
  f.setTime(3_600_000);
  await f.tick();
  expect(f.task.destroy).toHaveBeenCalledOnce();
  expect(f.options.onFinishDrying).not.toHaveBeenCalled();
  await expect(f.cycle.arriveHouse()).rejects.toThrow("破棄");
});

test("標準の node-cron から完了処理が実行される", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  const f = setup();
  const cycle = createCycle(f.options, { decideNextOperation: f.decideNextOperation });
  try {
    await cycle.leaveHouse();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(f.options.onFinishDrying).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.options.onFinishDrying).toHaveBeenCalledOnce();
  } finally {
    await cycle.dispose();
    vi.useRealTimers();
  }
});
