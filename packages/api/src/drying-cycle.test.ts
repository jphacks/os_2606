import { describe, expect, it, vi } from "vitest";
import { DEFAULT_DRYING_CONFIG, estimateProgressGain } from "@os/core";
import type { DryingCycleDependencies, DryingCycleState } from "./drying-cycle.js";
import { runDryingCycle } from "./drying-cycle.js";

const hour = 3_600_000;

function fixture(initial: DryingCycleState = { dryingProgress: 0.2, observation: { temperature: 24, humidity: 70, observedAt: 0 } }) {
  let stored = initial;
  const saves: DryingCycleState[] = [];
  const deps: DryingCycleDependencies = {
    readIndoor: vi.fn(async () => ({ temperature: 24, humidity: 70, observedAt: hour })),
    readForecast: vi.fn(async () => ({ temperature: 18, humidity: 60 })),
    remoteControl: { send: vi.fn(async () => {}), stop: vi.fn(async () => {}) },
    now: vi.fn(() => hour),
    store: {
      withLock: async (work) => work(),
      load: async () => stored,
      save: vi.fn(async (state) => { stored = state; saves.push(structuredClone(state)); }),
    },
  };
  return { deps, saves, stored: () => stored };
}

describe("乾燥再評価アプリケーション", () => {
  it("最新の実測と予報で判断を先に保存し、成功後に実測進捗だけを確定する", async () => {
    const { deps, saves } = fixture();
    vi.mocked(deps.remoteControl.send).mockImplementation(async () => {
      expect(saves).toHaveLength(1);
      expect(saves[0]?.status).toBe("pending");
      expect(saves[0]?.dryingProgress).toBe(0.2);
    });
    const result = await runDryingCycle(deps, {
      presenceMode: "home", windDirectionVertical: "down", windDirectionHorizontal: "left",
    });
    expect(deps.readIndoor).toHaveBeenCalledOnce();
    expect(deps.readForecast).toHaveBeenCalledOnce();
    expect(result.status).toBe("applied");
    expect(result.dryingProgress).toBeCloseTo(0.2 + estimateProgressGain(24, 70, 1));
    expect(result.decision?.estimatedProgressGain).toBeGreaterThan(0);
    expect(deps.remoteControl.send).toHaveBeenCalledWith(expect.objectContaining({
      fanSpeed: expect.any(String), windDirectionVertical: "down", windDirectionHorizontal: "left",
    }));
    expect(deps.remoteControl.stop).not.toHaveBeenCalled();
  });

  it("送信失敗時は進捗・観測点を確定せず、次回は新しい実測で再評価する", async () => {
    const { deps, stored } = fixture();
    vi.mocked(deps.remoteControl.send).mockRejectedValueOnce(new Error("IR failed"));
    await expect(runDryingCycle(deps, { presenceMode: "home" })).rejects.toThrow("IR failed");
    expect(stored().status).toBe("failed");
    expect(stored().dryingProgress).toBe(0.2);
    expect(stored().observation?.observedAt).toBe(0);
    vi.mocked(deps.readIndoor).mockResolvedValue({ temperature: 24, humidity: 70, observedAt: 2 * hour });
    vi.mocked(deps.now).mockReturnValue(2 * hour);
    const result = await runDryingCycle(deps, { presenceMode: "home" });
    expect(result.dryingProgress).toBeCloseTo(0.2 + estimateProgressGain(24, 70, 2));
    expect(result.status).toBe("applied");
  });

  it("初回観測までの未観測区間は進捗を加算しない", async () => {
    const { deps } = fixture({ dryingProgress: 0 });
    const result = await runDryingCycle(deps, { presenceMode: "home" });
    expect(result.dryingProgress).toBe(0);
    expect(result.observation?.observedAt).toBe(hour);
  });

  it("外出中の停止判断をstopに変換し、同じ命令は再送しない", async () => {
    const { deps } = fixture();
    const config = { ...DEFAULT_DRYING_CONFIG, capabilities: { ...DEFAULT_DRYING_CONFIG.capabilities, modes: [] } };
    const result = await runDryingCycle(deps, { presenceMode: "away", config });
    expect(result.lastApplied?.operation).toEqual({ mode: "off" });
    expect(deps.remoteControl.stop).toHaveBeenCalledOnce();
    const second = await runDryingCycle(deps, { presenceMode: "away", config });
    expect(second.status).toBe("held");
    expect(deps.remoteControl.stop).toHaveBeenCalledOnce();
  });

  it("短時間のモード変更を保留しても推奨判断と実行中の命令を区別する", async () => {
    const { deps } = fixture({ dryingProgress: 0,
      lastApplied: { operation: { mode: "heat", temperature: 26, fanSpeed: "low" }, appliedAt: hour - 60_000 },
      status: "applied",
    });
    const options = { presenceMode: "home", config: { ...DEFAULT_DRYING_CONFIG, capabilities: {
      ...DEFAULT_DRYING_CONFIG.capabilities, modes: ["cool"],
    } } } as const;
    const held = await runDryingCycle(deps, options);
    expect(held.status).toBe("held");
    expect(held.decision?.mode).toBe("cool");
    expect(held.lastApplied?.operation.mode).toBe("heat");
    expect(deps.remoteControl.send).not.toHaveBeenCalled();
    vi.mocked(deps.now).mockReturnValue(2 * hour);
    const applied = await runDryingCycle(deps, options);
    expect(applied.status).toBe("applied");
    expect(applied.lastApplied?.operation.mode).toBe("cool");
  });

  it("帰宅時は停止中でも即座に運転を再開する", async () => {
    const { deps } = fixture({ dryingProgress: 0,
      lastApplied: { operation: { mode: "off" }, appliedAt: hour - 60_000 }, status: "applied",
    });
    const result = await runDryingCycle(deps, { presenceMode: "home" });
    expect(result.status).toBe("applied");
    expect(result.lastApplied?.operation.mode).not.toBe("off");
    expect(deps.remoteControl.send).toHaveBeenCalledOnce();
  });

  it("同一運転でも住宅設定の風向きが変われば送信する", async () => {
    const { deps } = fixture();
    const first = await runDryingCycle(deps, { presenceMode: "home", windDirectionHorizontal: "left" });
    const unchanged = await runDryingCycle(deps, { presenceMode: "home", windDirectionHorizontal: "left" });
    expect(unchanged.status).toBe("held");
    expect(deps.remoteControl.send).toHaveBeenCalledOnce();
    const changed = await runDryingCycle(deps, { presenceMode: "home", windDirectionHorizontal: "right" });
    expect(changed.lastApplied?.operation).toEqual(first.lastApplied?.operation);
    expect(changed.lastApplied?.windDirectionHorizontal).toBe("right");
    expect(deps.remoteControl.send).toHaveBeenCalledTimes(2);
    expect(deps.remoteControl.send).toHaveBeenLastCalledWith(expect.objectContaining({ windDirectionHorizontal: "right" }));
  });

  it.each(["pending", "failed"] as const)("%s状態では過去の同一命令を根拠に再送を省略しない", async (status) => {
    const { deps } = fixture({ dryingProgress: 0,
      lastApplied: { operation: { mode: "off" }, appliedAt: hour - 60_000 }, status,
    });
    const config = { ...DEFAULT_DRYING_CONFIG, capabilities: { ...DEFAULT_DRYING_CONFIG.capabilities, modes: [] } };
    expect((await runDryingCycle(deps, { presenceMode: "away", config })).status).toBe("applied");
    expect(deps.remoteControl.stop).toHaveBeenCalledOnce();
  });

  it("センサー・予報取得や判断保存の失敗時に実機へ送信しない", async () => {
    for (const target of ["sensor", "forecast", "save"] as const) {
      const { deps } = fixture();
      const error = new Error(target);
      switch (target) {
        case "sensor": vi.mocked(deps.readIndoor).mockRejectedValue(error); break;
        case "forecast": vi.mocked(deps.readForecast).mockRejectedValue(error); break;
        case "save": vi.mocked(deps.store.save).mockRejectedValue(error); break;
      }
      await expect(runDryingCycle(deps, { presenceMode: "home" })).rejects.toThrow(target);
      expect(deps.remoteControl.send).not.toHaveBeenCalled();
      expect(deps.remoteControl.stop).not.toHaveBeenCalled();
    }
  });

  it("不正な時計・未来の観測・切替間隔を拒否する", async () => {
    const { deps } = fixture();
    await expect(runDryingCycle(deps, { presenceMode: "home", minimumModeMinutes: NaN })).rejects.toThrow();
    vi.mocked(deps.now).mockReturnValue(NaN);
    await expect(runDryingCycle(deps, { presenceMode: "home" })).rejects.toThrow();
    vi.mocked(deps.now).mockReturnValue(0);
    await expect(runDryingCycle(deps, { presenceMode: "home" })).rejects.toThrow("future");
    expect(deps.remoteControl.send).not.toHaveBeenCalled();
  });
});
