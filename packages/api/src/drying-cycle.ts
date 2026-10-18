import {
  decideNextOperation,
  DEFAULT_DRYING_CONFIG,
  updateObservedProgress,
} from "@os/core";
import type {
  DryingConfig,
  DryingDecision,
  EnvironmentObservation,
  Operation,
  PresenceMode,
} from "@os/core";
import type { AcMessage, RemoteControl } from "./index.js";

export interface DryingCycleState {
  dryingProgress: number;
  observation?: EnvironmentObservation;
  lastApplied?: {
    operation: Operation;
    appliedAt: number;
    windDirectionVertical?: AcMessage["windDirectionVertical"];
    windDirectionHorizontal?: AcMessage["windDirectionHorizontal"];
  };
  decision?: DryingDecision;
  status?: "pending" | "applied" | "held" | "failed";
}

/** 永続化と多重Cron起動間の排他はアダプター側で提供する。 */
export interface DryingCycleStore {
  withLock<T>(work: () => Promise<T>): Promise<T>;
  load(): Promise<DryingCycleState>;
  save(state: DryingCycleState): Promise<void>;
}

export interface DryingCycleDependencies {
  readIndoor(): Promise<EnvironmentObservation>;
  /** 今後1時間を代表する最新の外気予報。 */
  readForecast(): Promise<{ temperature: number; humidity: number }>;
  store: DryingCycleStore;
  remoteControl: RemoteControl;
  /** 送信完了時刻・モード変更間隔に用いる時計。 */
  now(): number;
}

export interface DryingCycleOptions {
  presenceMode: PresenceMode;
  comfortTemperature?: number;
  config?: DryingConfig;
  minimumModeMinutes?: number;
  /** 既存の風向き設定をそのまま渡す。モデルで推定しない。 */
  windDirectionVertical?: AcMessage["windDirectionVertical"];
  windDirectionHorizontal?: AcMessage["windDirectionHorizontal"];
}

export const DEFAULT_MINIMUM_MODE_MINUTES = 30;
const MILLISECONDS_PER_MINUTE = 60_000;

function toOperation(decision: DryingDecision): Operation {
  if (decision.mode === "off") return { mode: "off" };
  if (decision.temperature === undefined || decision.fanSpeed === undefined) {
    throw new Error("Active decisions require temperature and fan speed");
  }
  return { mode: decision.mode, temperature: decision.temperature, fanSpeed: decision.fanSpeed };
}

function sameOperation(a: Operation, b: Operation): boolean {
  return a.mode === b.mode && a.temperature === b.temperature && a.fanSpeed === b.fanSpeed;
}

function validateTimestamp(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Invalid timestamp");
}

/**
 * Cron等から呼び出すアプリケーション処理。予測進捗は保存済み進捗へ加算しない。
 * 送信前に判断を保存し、成功後だけ実測区間の推定進捗と観測点を確定する。
 * 送信失敗時は旧進捗・旧観測点を保持し、次回の実測値で再評価する。
 * モード変更を抑制する間も推奨判断は保存するが、lastAppliedと区別する。
 * 保存と実機送信は原子的ではない。pending/failedは実機状態が不確実なため再送する。
 * RemoteControl成功は実機の動作確認を保証しない。ストアの排他は処理全体を覆うこと。
 */
export async function runDryingCycle(deps: DryingCycleDependencies, options: DryingCycleOptions): Promise<DryingCycleState> {
  const minimumMinutes = options.minimumModeMinutes ?? DEFAULT_MINIMUM_MODE_MINUTES;
  if (!Number.isFinite(minimumMinutes) || minimumMinutes < 0) {
    throw new RangeError("Invalid minimumModeMinutes");
  }
  return deps.store.withLock(async () => {
    const state = await deps.store.load();
    const [indoor, forecast] = await Promise.all([deps.readIndoor(), deps.readForecast()]);
    const now = deps.now();
    validateTimestamp(now);
    validateTimestamp(indoor.observedAt);
    if (indoor.observedAt > now) throw new RangeError("Observation is in the future");
    let progress = state.dryingProgress;
    if (state.observation) {
      progress = updateObservedProgress(progress, state.observation, indoor);
    }
    const decision = decideNextOperation({
      indoorTemperature: indoor.temperature,
      indoorHumidity: indoor.humidity,
      outdoorTemperature: forecast.temperature,
      outdoorHumidity: forecast.humidity,
      presenceMode: options.presenceMode,
      dryingProgress: progress,
      ...optionalComfort(options),
    }, options.config ?? DEFAULT_DRYING_CONFIG);
    const operation = toOperation(decision);
    const applied = state.lastApplied;
    let hold = false;
    // 失敗・中断した送信後は実機状態が不確実なので、古い命令を根拠に抑制しない。
    if (applied && state.status !== "pending" && state.status !== "failed") {
      validateTimestamp(applied.appliedAt);
      if (applied.appliedAt > now) throw new RangeError("Applied time is in the future");
      const elapsed = now - applied.appliedAt;
      const sameDirections =
        (options.windDirectionVertical === undefined || options.windDirectionVertical === applied.windDirectionVertical) &&
        (options.windDirectionHorizontal === undefined || options.windDirectionHorizontal === applied.windDirectionHorizontal);
      hold = (sameOperation(applied.operation, operation) && sameDirections) ||
        (applied.operation.mode !== operation.mode && elapsed < minimumMinutes * MILLISECONDS_PER_MINUTE);
      // 帰宅時の運転継続を停止状態の維持より優先する。
      if (options.presenceMode === "home" && applied.operation.mode === "off") hold = false;
    }
    if (hold) {
      const held: DryingCycleState = { ...state, dryingProgress: progress, observation: indoor, decision, status: "held" };
      await deps.store.save(held);
      return held;
    }
    await deps.store.save({ ...state, decision, status: "pending" });
    try {
      switch (operation.mode) {
        case "off": await deps.remoteControl.stop(); break;
        case "cool":
        case "heat":
        case "dry": {
          const message: AcMessage = {
            acMode: operation.mode,
            temperature: operation.temperature,
            fanSpeed: operation.fanSpeed,
          };
          if (options.windDirectionVertical !== undefined) message.windDirectionVertical = options.windDirectionVertical;
          if (options.windDirectionHorizontal !== undefined) message.windDirectionHorizontal = options.windDirectionHorizontal;
          await deps.remoteControl.send(message);
          break;
        }
        default: {
          const exhaustive: never = operation;
          throw new Error(`Unsupported operation: ${exhaustive}`);
        }
      }
    } catch (error) {
      await deps.store.save({ ...state, decision, status: "failed" });
      throw error;
    }
    const appliedAt = deps.now();
    validateTimestamp(appliedAt);
    if (appliedAt < now) throw new RangeError("Clock moved backwards during send");
    const lastApplied: NonNullable<DryingCycleState["lastApplied"]> = {
      ...state.lastApplied,
      operation,
      appliedAt,
    };
    if (options.windDirectionVertical !== undefined) lastApplied.windDirectionVertical = options.windDirectionVertical;
    if (options.windDirectionHorizontal !== undefined) lastApplied.windDirectionHorizontal = options.windDirectionHorizontal;
    const confirmed: DryingCycleState = {
      dryingProgress: progress,
      observation: indoor,
      decision,
      lastApplied,
      status: "applied",
    };
    await deps.store.save(confirmed);
    return confirmed;
  });
}

function optionalComfort(options: DryingCycleOptions): { comfortTemperature?: number } {
  if (options.comfortTemperature === undefined) return {};
  return { comfortTemperature: options.comfortTemperature };
}
