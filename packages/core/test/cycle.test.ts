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

test("洗濯したよで室内モード・進捗0から開始する", async () => {
  const f = setup();
  expect(f.task.start).not.toHaveBeenCalled();
  await f.cycle.startDrying();
  expect(f.decideNextOperation).toHaveBeenCalledWith(expect.objectContaining({ presenceMode: "home", dryingProgress: 0 }), undefined);
  expect(f.options.remoteControl.send).toHaveBeenCalledWith({ acMode: "heat", temperature: 26, fanSpeed: "high" });
  expect(f.createTask).toHaveBeenCalledWith("* * * * *", expect.any(Function));
  expect(f.task.start).toHaveBeenCalledOnce();
});

test("自動除湿の計画では風量を省略して送信する", async () => {
  const f = setup();
  f.decideNextOperation.mockReturnValue({ mode: "dehumidify", temperature: 24, estimatedDryingHours: 1 });
  await f.cycle.startDrying();
  expect(f.options.remoteControl.send).toHaveBeenCalledExactlyOnceWith({ acMode: "dehumidify", temperature: 24 });
});

test("行ってきますは洗濯済みとして外出モード・進捗0から開始する", async () => {
  const f = setup();
  await f.cycle.leaveHouse();
  expect(f.decideNextOperation).toHaveBeenCalledWith(expect.objectContaining({ presenceMode: "away", dryingProgress: 0 }), undefined);
  expect(f.options.remoteControl.send).toHaveBeenCalledOnce();
  expect(f.task.start).toHaveBeenCalledOnce();
  f.setTime(1_800_000);
  await f.cycle.leaveHouse();
  expect(f.decideNextOperation).toHaveBeenCalledOnce();
  f.setTime(3_600_000);
  await f.tick();
  expect(f.options.onFinishDrying).toHaveBeenCalledOnce();
});

test("開始前の帰宅では乾燥を開始しない", async () => {
  const f = setup();
  await f.cycle.arriveHouse();
  expect(f.options.getContext).not.toHaveBeenCalled();
  expect(f.options.remoteControl.send).not.toHaveBeenCalled();
  expect(f.task.start).not.toHaveBeenCalled();
});

test("予測時刻までは通知せず、到達後に停止と完了コールバックを一度だけ呼ぶ", async () => {
  const f = setup();
  await f.cycle.startDrying();
  f.setTime(3_599_999);
  await f.tick();
  expect(f.options.onFinishDrying).not.toHaveBeenCalled();
  f.setTime(3_600_000);
  await Promise.all([f.tick(), f.tick()]);
  expect(f.options.remoteControl.stop).toHaveBeenCalledOnce();
  expect(f.options.onFinishDrying).toHaveBeenCalledOnce();
  expect(f.task.stop).toHaveBeenCalledOnce();
});

test("洗濯したよを重複して受けても予測終了時刻を延長しない", async () => {
  const f = setup();
  await f.cycle.startDrying();
  f.setTime(1_800_000);
  await f.cycle.startDrying();
  expect(f.options.getContext).toHaveBeenCalledOnce();
  f.setTime(3_600_000);
  await f.tick();
  expect(f.options.onFinishDrying).toHaveBeenCalledOnce();
});

test("外出・帰宅の切り替えで再計画し、同じ状態の連続通知は無視する", async () => {
  const f = setup();
  await f.cycle.startDrying();
  await f.cycle.arriveHouse();
  expect(f.decideNextOperation).toHaveBeenCalledOnce();
  await f.cycle.leaveHouse();
  await f.cycle.leaveHouse();
  expect(f.decideNextOperation).toHaveBeenCalledTimes(2);
  expect(f.decideNextOperation.mock.calls[1]?.[0].presenceMode).toBe("away");
  await f.cycle.arriveHouse();
  expect(f.decideNextOperation).toHaveBeenCalledTimes(3);
  expect(f.decideNextOperation.mock.calls[2]?.[0].presenceMode).toBe("home");
});

test("完了後は帰宅で再開せず、次の洗濯したよで室内モードから開始する", async () => {
  const f = setup();
  await f.cycle.startDrying();
  f.setTime(3_600_000);
  // cron より先に帰宅が届いても、完了通知後に新しい乾燥を開始しない。
  await f.cycle.arriveHouse();
  expect(f.options.onFinishDrying).toHaveBeenCalledOnce();
  expect(f.decideNextOperation).toHaveBeenCalledOnce();
  await f.cycle.startDrying();
  expect(f.decideNextOperation).toHaveBeenCalledTimes(2);
  expect(f.decideNextOperation.mock.calls[1]?.[0]).toMatchObject({ presenceMode: "home", dryingProgress: 0 });
});

test("完了後の行ってきますでは新しい洗濯を外出モードで開始する", async () => {
  const f = setup();
  await f.cycle.startDrying();
  f.setTime(3_600_000);
  await f.tick();
  await f.cycle.leaveHouse();
  expect(f.decideNextOperation).toHaveBeenCalledTimes(2);
  expect(f.decideNextOperation.mock.calls[1]?.[0]).toMatchObject({ presenceMode: "away", dryingProgress: 0 });
  expect(f.task.start).toHaveBeenCalledTimes(2);
});

test("帰宅では観測進捗を引き継いで再計画し、終了時刻を置き換える", async () => {
  const f = setup();
  await f.cycle.startDrying();
  await f.cycle.leaveHouse();
  f.setTime(1_800_000);
  f.decideNextOperation.mockReturnValue({ mode: "cool", temperature: 24, fanSpeed: "low", estimatedDryingHours: 2 });
  await f.cycle.arriveHouse();
  const context = f.decideNextOperation.mock.calls[2]?.[0];
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
  await f.cycle.startDrying();
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
  await f.cycle.startDrying();
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
  await expect(f.cycle.startDrying()).rejects.toThrow("IR failure");
  expect(f.task.start).not.toHaveBeenCalled();
  await f.cycle.startDrying();
  expect(f.task.start).toHaveBeenCalledOnce();
});

test.each<DryingDecision>([
  { mode: "off", estimatedDryingHours: Infinity },
  { mode: "heat", temperature: 26, fanSpeed: "high", estimatedDryingHours: Infinity },
])("予測が Infinity なら通知しない: $mode", async (plan) => {
  const f = setup();
  f.decideNextOperation.mockReturnValue(plan);
  await f.cycle.startDrying();
  f.setTime(30 * 24 * 3_600_000);
  await f.tick();
  expect(f.options.onFinishDrying).not.toHaveBeenCalled();
});

test("残り0時間なら次の cron で通知する", async () => {
  const f = setup();
  f.decideNextOperation.mockReturnValue({ mode: "off", estimatedDryingHours: 0 });
  await f.cycle.startDrying();
  await f.tick();
  expect(f.options.remoteControl.stop).toHaveBeenCalledOnce();
  expect(f.options.onFinishDrying).toHaveBeenCalledOnce();
});

test("破棄すると cron が終了し、以後の操作を受け付けない", async () => {
  const f = setup();
  await f.cycle.startDrying();
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
    await cycle.startDrying();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(f.options.onFinishDrying).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.options.onFinishDrying).toHaveBeenCalledOnce();
  } finally {
    await cycle.dispose();
    vi.useRealTimers();
  }
});
