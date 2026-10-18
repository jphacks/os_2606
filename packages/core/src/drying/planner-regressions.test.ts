import { describe, expect, it } from "vitest";
import { decideNextOperation, DEFAULT_DRYING_CONFIG } from "./index.js";
import { simulateEnvironment } from "./environment-simulator.js";
import { estimateDryingHours } from "./estimator.js";
import type { DryingConfig, DryingContext } from "./types.js";

const summer: DryingContext = {
  indoorTemperature: 32, indoorHumidity: 75,
  outdoorTemperature: 35, outdoorHumidity: 65,
  presenceMode: "home", comfortTemperature: 26,
};

const coolingOnly: DryingConfig = {
  ...DEFAULT_DRYING_CONFIG,
  temperatureRanges: { ...DEFAULT_DRYING_CONFIG.temperatureRanges, cool: { min: 22, max: 22, step: 1 } },
  capabilities: { modes: ["cool"], fanSpeeds: { cool: ["high"], heat: [], dehumidify: [] }, allowOff: false },
};

describe("運転計画の完了予測と採点の回帰テスト", () => {
  it("真夏・在室中の蒸し暑い部屋では、冷房継続による除湿を反映し、423時間ではなく約12時間と予測する", () => {
    const snapshot = structuredClone(summer);
    const configSnapshot = structuredClone(coolingOnly);
    const plan = decideNextOperation(summer, coolingOnly);
    const afterOneHour = simulateEnvironment(summer, plan, coolingOnly);

    // 従来の終点固定計算が極端に長くなる条件を、運転候補を1つに絞って再現する。
    expect(estimateDryingHours(afterOneHour.predictedTemperature, afterOneHour.predictedHumidity)).toBeGreaterThan(400);
    expect(plan.estimatedDryingHours).toBe(12);
    expect(summer).toEqual(snapshot);
    expect(coolingOnly).toEqual(configSnapshot);

    // 返った設定だけを実行し続け、予測した時刻の直前では未完了、その時刻では完了する。
    let state = { ...summer, dryingProgress: 0 };
    const stepConfig = { ...coolingOnly, evaluationMinutes: 15 };
    const steps = plan.estimatedDryingHours * 4;
    for (let step = 1; step <= steps; step++) {
      const result = simulateEnvironment(state, plan, stepConfig);
      state = { ...state, indoorTemperature: result.predictedTemperature,
        indoorHumidity: result.predictedHumidity,
        dryingProgress: Math.min(1, state.dryingProgress + result.estimatedProgressGain) };
      if (step < steps) expect(state.dryingProgress).toBeLessThan(1);
    }
    expect(state.dryingProgress).toBe(1);
  });

  it("真夏・在室中の蒸し暑い部屋では、乾燥重視なら進捗の大きい除湿、快適性重視なら冷房を選ぶ", () => {
    const drying = decideNextOperation(summer);
    const comfort = decideNextOperation(summer, { ...DEFAULT_DRYING_CONFIG, dryingWeight: 0 });
    const dryingResult = simulateEnvironment(summer, drying);
    const comfortResult = simulateEnvironment(summer, comfort);

    expect(drying.mode).toBe("dehumidify");
    expect(comfort.mode).toBe("cool");
    expect(dryingResult.estimatedProgressGain).toBeGreaterThan(comfortResult.estimatedProgressGain);
    expect(comfortResult.temperaturePenalty).toBeLessThan(dryingResult.temperaturePenalty);
  });

  it.each([15, 17, 30])("春・外出中の一定環境の部屋では、%s分刻みでも理論上の完了時間との差が1刻み以内になる", (stepMinutes) => {
    const context: DryingContext = {
      indoorTemperature: 24, indoorHumidity: 70,
      outdoorTemperature: 24, outdoorHumidity: 70,
      presenceMode: "away", dryingProgress: 0.5,
    };
    const config: DryingConfig = {
      ...DEFAULT_DRYING_CONFIG, stepMinutes,
      capabilities: { ...DEFAULT_DRYING_CONFIG.capabilities, modes: [] },
    };
    const plan = decideNextOperation(context, config);
    const exactHours = estimateDryingHours(24, 70) * 0.5;

    expect(plan.mode).toBe("off");
    expect(plan.estimatedDryingHours).toBeGreaterThanOrEqual(exactHours);
    expect(plan.estimatedDryingHours - exactHours).toBeLessThanOrEqual(stepMinutes / 60);
  });

  it("梅雨・在室中の湿った部屋で乾燥がほぼ終わっていれば、評価区間の1時間を待たず完了を予測する", () => {
    const plan = decideNextOperation({
      indoorTemperature: 24, indoorHumidity: 85,
      outdoorTemperature: 24, outdoorHumidity: 95,
      presenceMode: "home", comfortTemperature: 24, dryingProgress: 0.999,
    });
    expect(plan.estimatedDryingHours).toBe(0.25);
  });

  it.each(["home", "away"] as const)("真冬・冷えた部屋で乾燥完了済みなら、在室状態%sでも暖房や除湿を続けない", (presenceMode) => {
    const context: DryingContext = {
      indoorTemperature: 12, indoorHumidity: 70,
      outdoorTemperature: 2, outdoorHumidity: 50,
      presenceMode, comfortTemperature: 22, dryingProgress: 1,
    };
    // allowOffは乾燥中の探索候補の制限。完了時の停止は制限しない。
    const config = { ...DEFAULT_DRYING_CONFIG,
      capabilities: { ...DEFAULT_DRYING_CONFIG.capabilities, modes: [], allowOff: false } };

    expect(decideNextOperation(context, config)).toEqual({ mode: "off", estimatedDryingHours: 0 });
    expect(() => decideNextOperation({ ...context, indoorHumidity: NaN }, config)).toThrow(RangeError);
    expect(() => decideNextOperation(context, { ...config, stepMinutes: 0 })).toThrow(RangeError);
  });

  it("秋・外出中で室内外とも飽和した部屋では、停止だけで乾かなくても有限時間で予測を打ち切る", () => {
    const context: DryingContext = {
      indoorTemperature: 18, indoorHumidity: 100,
      outdoorTemperature: 18, outdoorHumidity: 100, presenceMode: "away",
    };
    const config = { ...DEFAULT_DRYING_CONFIG,
      capabilities: { ...DEFAULT_DRYING_CONFIG.capabilities, modes: [] } };

    expect(decideNextOperation(context, config)).toEqual({ mode: "off", estimatedDryingHours: Infinity });
  });
});
