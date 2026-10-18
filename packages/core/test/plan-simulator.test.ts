import { expect, test } from "vitest";
import { DEFAULT_DRYING_CONFIG, decideNextOperation, formatPlanSimulation, simulateDryingPlan } from "../src/drying/index.js";
import type { DryingContext } from "../src/drying/index.js";

const context: DryingContext = {
  indoorTemperature: 24, indoorHumidity: 70, outdoorTemperature: 18, outdoorHumidity: 60,
  presenceMode: "home", comfortTemperature: 24,
};

test("6時間を15分刻みで計算し、入力を変更せず温湿度と進捗を引き継ぐ", () => {
  const input = structuredClone(context);
  const result = simulateDryingPlan(input);
  expect(input).toEqual(context);
  expect(result.durationMinutes).toBe(360);
  expect(result.steps).toHaveLength(24);
  let end = 0;
  let progress = 0;
  for (const row of result.steps) {
    expect(row.startMinute).toBe(end);
    expect(row.endMinute - row.startMinute).toBe(15);
    expect(row.indoorTemperature).toBeGreaterThanOrEqual(-60);
    expect(row.indoorTemperature).toBeLessThanOrEqual(60);
    expect(row.indoorHumidity).toBeGreaterThanOrEqual(0);
    expect(row.indoorHumidity).toBeLessThanOrEqual(100);
    expect(row.dryingProgress).toBeGreaterThanOrEqual(progress);
    expect(row.dryingProgress).toBeLessThanOrEqual(1);
    end = row.endMinute;
    progress = row.dryingProgress;
  }
  expect(end).toBe(360);
  expect(result.steps[0]!.indoorTemperature).not.toBe(context.indoorTemperature);
  expect(progress).toBeGreaterThan(0);
  expect(formatPlanSimulation(result)).toContain("05:45〜06:00");
  expect(formatPlanSimulation(result).length).toBeLessThan(5000); // LINEのテキスト上限。
});

test("完了後は在宅でも停止し、残り6時間まで進捗1で計算する", () => {
  const result = simulateDryingPlan({ ...context, dryingProgress: 0.999 });
  expect(result.completedAtMinute).toBe(15);
  expect(result.steps[0]!.decision.mode).not.toBe("off");
  expect(result.steps.slice(1).every((row) => row.decision.mode === "off" && row.dryingProgress === 1)).toBe(true);
  const completed = simulateDryingPlan({ ...context, dryingProgress: 1 });
  expect(completed.completedAtMinute).toBe(0);
  expect(completed.steps.every((row) => row.decision.mode === "off")).toBe(true);
});

test("1時間後は予測した室内環境と進捗を使って運転を選び直す", () => {
  const result = simulateDryingPlan(context);
  const afterHour = result.steps[3]!;
  expect(result.steps[4]!.decision).toEqual(decideNextOperation({
    ...context,
    indoorTemperature: afterHour.indoorTemperature,
    indoorHumidity: afterHour.indoorHumidity,
    dryingProgress: afterHour.dryingProgress,
  }));
  expect(result.steps[4]!.decision.mode).not.toBe(result.steps[0]!.decision.mode);
});

test("乾燥が進まない環境でも6時間で打ち切り、完了を報告しない", () => {
  const result = simulateDryingPlan({
    ...context, indoorTemperature: 26, indoorHumidity: 100, outdoorTemperature: 26, outdoorHumidity: 100,
  }, {
    ...DEFAULT_DRYING_CONFIG,
    capabilities: { ...DEFAULT_DRYING_CONFIG.capabilities, modes: ["heat"] },
  });
  expect(result.completedAtMinute).toBeNull();
  expect(result.steps.at(-1)!.dryingProgress).toBe(0);
  expect(formatPlanSimulation(result)).toContain("6時間以内の乾燥完了は予測されませんでした。");
});

test("6時間を割り切れない評価間隔でも超過せず、端数区間を計算する", () => {
  const result = simulateDryingPlan(context, { ...DEFAULT_DRYING_CONFIG, evaluationMinutes: 7, stepMinutes: 3 });
  expect(result.steps.at(-1)!.endMinute).toBe(360);
  expect(result.steps.every((row) => row.endMinute > row.startMinute && row.endMinute <= 360)).toBe(true);
});

test("不正な環境や計算設定を拒否する", () => {
  expect(() => simulateDryingPlan({ ...context, indoorHumidity: 101 })).toThrow(RangeError);
  expect(() => simulateDryingPlan(context, { ...DEFAULT_DRYING_CONFIG, stepMinutes: 0 })).toThrow(RangeError);
});
