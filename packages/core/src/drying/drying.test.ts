import { describe, expect, it } from "vitest";
import { decideNextOperation, DEFAULT_DRYING_CONFIG } from "./index.js";
import { calculateVpd } from "./vpd.js";
import { estimateDryingHours, estimateProgressGain, updateObservedProgress } from "./estimator.js";
import { evaluateOperations } from "./operation-evaluator.js";
import { generateOperationCandidates } from "./candidate-generator.js";
import { simulateEnvironment } from "./environment-simulator.js";
import type { DryingConfig, DryingContext } from "./index.js";

const context: DryingContext = {
  indoorTemperature: 24, indoorHumidity: 70,
  outdoorTemperature: 18, outdoorHumidity: 60,
  presenceMode: "home", comfortTemperature: 24, dryingProgress: 0,
};

describe("VPD乾燥モデル", () => {
  // python3 math.expで、提示されたPythonモデルの式を独立に計算した参照値。
  it.each([
    [24, 70, 0.895175243149668],
    [20, 50, 1.169140635463723],
    [30, 80, 0.8486130117518025],
    [0, 40, 0.36648],
    [-10, 90, 0.028571098216674123],
  ])("Python参照値と一致する (%s℃, %s%%)", (temperature, humidity, expected) => {
    expect(calculateVpd(temperature, humidity)).toBeCloseTo(expected, 12);
  });

  it("24℃・70%で約11.73時間、飽和時には乾燥しない", () => {
    expect(estimateDryingHours(24, 70)).toBeCloseTo(11.733456750930142, 10);
    expect(estimateDryingHours(24, 100)).toBe(Infinity);
    expect(estimateProgressGain(24, 100, 1)).toBe(0);
  });

  it("時間に比例して増加し、観測進捗は予測値を使わず台形積分する", () => {
    const gain = estimateProgressGain(24, 70, 1);
    expect(gain).toBeGreaterThan(0);
    expect(estimateProgressGain(24, 70, 2)).toBeCloseTo(2 * gain);
    const previous = { temperature: 24, humidity: 70, observedAt: 0 };
    const current = { temperature: 26, humidity: 60, observedAt: 3_600_000 };
    expect(updateObservedProgress(0.2, previous, current)).toBeCloseTo(
      0.2 + (estimateProgressGain(24, 70, 1) + estimateProgressGain(26, 60, 1)) / 2,
    );
    expect(updateObservedProgress(0.99, previous, current)).toBe(1);
    expect(() => updateObservedProgress(0, current, previous)).toThrow();
  });
});

describe("候補と判断", () => {
  it("在室中は運転継続、外出中だけ停止を許可し、送風と暖房30℃を含まない", () => {
    const home = generateOperationCandidates(context);
    const away = generateOperationCandidates({ ...context, presenceMode: "away" });
    expect(home).toHaveLength(45);
    expect(home.some((op) => op.mode === "off")).toBe(false);
    expect(decideNextOperation(context).mode).not.toBe("off");
    expect(away).toContainEqual({ mode: "off" });
    expect(away.map((op) => op.mode)).not.toContain("fan");
    expect(away).not.toContainEqual(expect.objectContaining({ mode: "heat", temperature: 30 }));
  });

  it("実機のモード・温度刻み・風量制約を適用する", () => {
    const config: DryingConfig = {
      ...DEFAULT_DRYING_CONFIG,
      temperatureRanges: { ...DEFAULT_DRYING_CONFIG.temperatureRanges, cool: { min: 23, max: 25, step: 2 } },
      capabilities: { modes: ["cool"], fanSpeeds: { cool: ["low"], heat: [], dehumidify: [] }, allowOff: false },
    };
    expect(generateOperationCandidates({ ...context, presenceMode: "away" }, config)).toEqual([
      { mode: "cool", temperature: 23, fanSpeed: "low" },
      { mode: "cool", temperature: 25, fanSpeed: "low" },
    ]);
    expect(() => decideNextOperation(context, { ...config, capabilities: { ...config.capabilities, modes: [] } })).toThrow("No supported");
  });

  it("風量と外気の温湿度が予測に影響する", () => {
    const operation = { mode: "cool", temperature: 22, fanSpeed: "low" } as const;
    const low = simulateEnvironment(context, operation);
    const high = simulateEnvironment(context, { ...operation, fanSpeed: "high" });
    expect(high.predictedTemperature).not.toBe(low.predictedTemperature);
    expect(high.predictedHumidity).not.toBe(low.predictedHumidity);
    expect(high.estimatedProgressGain).not.toBe(low.estimatedProgressGain);
    expect(simulateEnvironment({ ...context, outdoorTemperature: 32 }, operation).predictedTemperature).not.toBe(low.predictedTemperature);
    expect(simulateEnvironment({ ...context, outdoorHumidity: 95 }, operation).predictedHumidity).not.toBe(low.predictedHumidity);
  });

  it("暖房は外気交換なしでは水蒸気圧を維持する", () => {
    const config: DryingConfig = {
      ...DEFAULT_DRYING_CONFIG,
      simulator: { ...DEFAULT_DRYING_CONFIG.simulator, outdoorVaporRate: 0 },
    };
    const result = simulateEnvironment(context, { mode: "heat", temperature: 26, fanSpeed: "high" }, config);
    // 同じ実水蒸気圧なら、RHの変化は飽和水蒸気圧の変化だけで決まる。
    const initialPressure = calculateVpd(24, 0) * 0.7;
    expect(calculateVpd(result.predictedTemperature, 0) * result.predictedHumidity / 100).toBeCloseTo(initialPressure, 12);
  });

  it("快適温度と乾燥重みを評価に反映し、最小コストを選ぶ", () => {
    const coolComfort = evaluateOperations({ ...context, comfortTemperature: 22 });
    const warmComfort = evaluateOperations({ ...context, comfortTemperature: 26 });
    expect(coolComfort.map((op) => op.score)).not.toEqual(warmComfort.map((op) => op.score));
    const comfortOnly = { ...DEFAULT_DRYING_CONFIG, dryingWeight: 0 };
    expect(decideNextOperation({ ...context, comfortTemperature: 22 }, comfortOnly).mode).toBe("cool");
    expect(decideNextOperation({ ...context, comfortTemperature: 26 }, comfortOnly).mode).toBe("heat");
    const evaluated = evaluateOperations(context);
    const plan = decideNextOperation(context);
    expect(evaluated).toContainEqual(expect.objectContaining({
      operation: { mode: plan.mode, temperature: plan.temperature, fanSpeed: plan.fanSpeed },
      score: Math.min(...evaluated.map((op) => op.score)),
    }));
  });

  it("同点では温度変更を抑え、完了進捗でも有限・決定的な結果を返す", () => {
    const simulator = DEFAULT_DRYING_CONFIG.simulator;
    const config: DryingConfig = {
      ...DEFAULT_DRYING_CONFIG, dryingWeight: 1,
      simulator: { ...simulator, outdoorTemperatureRate: 0, outdoorVaporRate: 0,
        temperatureRate: { cool: 0, heat: 0, dehumidify: 0 },
        dehumidificationRate: { cool: 0, heat: 0, dehumidify: 0 } },
    };
    expect(decideNextOperation(context, config).temperature).toBe(24);
    expect(decideNextOperation(context)).toEqual(decideNextOperation(context));
    const complete = decideNextOperation({ ...context, dryingProgress: 1 });
    expect(complete.estimatedDryingHours).toBe(0);
    expect(simulateEnvironment({ ...context, dryingProgress: 0.999 }, { mode: "dehumidify", temperature: 24, fanSpeed: "high" }).estimatedProgressGain).toBeCloseTo(0.001);
  });

  it("一定環境の残り時間を返し、乾燥が進まない場合はInfinity、進捗1なら0を返す", () => {
    const config: DryingConfig = {
      ...DEFAULT_DRYING_CONFIG,
      capabilities: { ...DEFAULT_DRYING_CONFIG.capabilities, modes: [] },
      simulator: { ...DEFAULT_DRYING_CONFIG.simulator, outdoorTemperatureRate: 0, outdoorVaporRate: 0 },
    };
    const away: DryingContext = { ...context, presenceMode: "away", dryingProgress: 0.5 };
    expect(decideNextOperation(away, config)).toEqual({
      mode: "off", estimatedDryingHours: expect.closeTo(11.733456750930142 / 2, 10),
    });
    expect(decideNextOperation({ ...away, indoorHumidity: 100 }, config).estimatedDryingHours).toBe(Infinity);
    expect(decideNextOperation({ ...away, indoorHumidity: 100, dryingProgress: 1 }, config).estimatedDryingHours).toBe(0);
  });

  it("端数の時間刻みでも一定環境の積分が一致する", () => {
    const config = { ...DEFAULT_DRYING_CONFIG, stepMinutes: 17, simulator: {
      ...DEFAULT_DRYING_CONFIG.simulator, outdoorTemperatureRate: 0, outdoorVaporRate: 0,
    } };
    const result = simulateEnvironment({ ...context, presenceMode: "away" }, { mode: "off" }, config);
    expect(result.estimatedProgressGain).toBeCloseTo(estimateProgressGain(24, 70, 1), 12);
  });
});

describe("入力検証", () => {
  it.each([NaN, Infinity, -Infinity])("非有限値%sを拒否する", (value) => {
    for (const key of ["indoorTemperature", "indoorHumidity", "outdoorTemperature", "outdoorHumidity", "comfortTemperature", "dryingProgress"] as const) {
      expect(() => decideNextOperation({ ...context, [key]: value })).toThrow();
    }
    expect(() => calculateVpd(value, 70)).toThrow();
    expect(() => estimateProgressGain(24, 70, value)).toThrow();
    expect(() => decideNextOperation(context, { ...DEFAULT_DRYING_CONFIG, dryingWeight: value })).toThrow();
  });

  it.each([
    { indoorHumidity: -1 }, { outdoorHumidity: 101 }, { indoorTemperature: -100 },
    { outdoorTemperature: 100 }, { dryingProgress: -1 }, { dryingProgress: 2 },
    { comfortTemperature: 30 },
  ])("範囲外の値を拒否する: %o", (invalid) => {
    expect(() => decideNextOperation({ ...context, ...invalid })).toThrow();
  });

  it("不正な設定・運転・過去に遡る観測を拒否する", () => {
    expect(() => decideNextOperation(context, { ...DEFAULT_DRYING_CONFIG, stepMinutes: 0 })).toThrow();
    expect(() => decideNextOperation(context, { ...DEFAULT_DRYING_CONFIG, dryingWeight: 2 })).toThrow();
    expect(() => decideNextOperation(context, { ...DEFAULT_DRYING_CONFIG, temperatureRanges: { ...DEFAULT_DRYING_CONFIG.temperatureRanges, heat: { min: 20, max: 30, step: 1 } } })).toThrow();
    expect(() => simulateEnvironment(context, { mode: "off" })).toThrow();
    expect(() => simulateEnvironment(context, { mode: "heat", temperature: 30, fanSpeed: "high" })).toThrow();
    expect(() => estimateProgressGain(24, 70, -1)).toThrow();
  });
});
