import { expect, test } from "vitest";
import { decideNextOperation, DEFAULT_DRYING_CONFIG } from "@os/core/drying";
import type { DryingContext } from "@os/core/drying";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

test("洗濯開始時は進捗や観測履歴なしで運転設定と推定残り時間を取得できる", () => {
  const context = deepFreeze<DryingContext>({
    indoorTemperature: 24,
    indoorHumidity: 70,
    outdoorTemperature: 18,
    outdoorHumidity: 60,
    presenceMode: "home",
  });

  const plan = decideNextOperation(context);

  expect(plan).toEqual(decideNextOperation({ ...context, dryingProgress: 0 }));
  expect(plan.mode).not.toBe("off");
  expect(plan.temperature).toBeGreaterThanOrEqual(16);
  expect(plan.temperature).toBeLessThanOrEqual(28);
  expect(["low", "medium", "high"]).toContain(plan.fanSpeed);
  expect(plan.estimatedDryingHours).toBeGreaterThan(0);
  expect(Number.isFinite(plan.estimatedDryingHours)).toBe(true);
  expect(context).not.toHaveProperty("dryingProgress");
});

test("公開 API は入力と設定を変更せず、同じ入力から同じ運転計画を返す", () => {
  const context = deepFreeze<DryingContext>({
    indoorTemperature: 24,
    indoorHumidity: 70,
    outdoorTemperature: 18,
    outdoorHumidity: 60,
    presenceMode: "home",
    comfortTemperature: 24,
    dryingProgress: 0,
  });
  const config = deepFreeze(structuredClone(DEFAULT_DRYING_CONFIG));

  const plan = decideNextOperation(context, config);

  expect(decideNextOperation(context, config)).toEqual(plan);
  expect(decideNextOperation(context)).toEqual(plan);
  expect(plan.mode).not.toBe("off");
  expect(plan.estimatedDryingHours).toBeGreaterThan(0);
  expect(Number.isFinite(plan.estimatedDryingHours)).toBe(true);
});
