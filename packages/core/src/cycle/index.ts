import { createTask } from "node-cron";
import { decideNextOperation } from "../drying/index.js";
import { updateObservedProgress } from "../drying/estimator.js";
import type { EnvironmentObservation } from "../drying/estimator.js";
import type { DryingConfig, DryingContext, Operation, PresenceMode } from "../drying/index.js";

/** LINE や実機の実装には依存せず、起動側から必要な入出力だけを受け取る。 */
export interface CycleOptions {
  getContext(): Promise<Omit<DryingContext, "presenceMode" | "dryingProgress">>;
  remoteControl: {
    send(message: {
      acMode: Exclude<Operation["mode"], "off">;
      temperature: number;
      fanSpeed: "low" | "medium" | "high";
    }): Promise<void>;
    stop(): Promise<void>;
  };
  /** LineApi.sendNotificationFinishDrying を渡す。失敗時は次の cron で再試行する。 */
  onFinishDrying(): Promise<void>;
  /** cron 内の失敗の報告先。handler からの呼び出し失敗は呼び出し元へ返す。 */
  onError(error: unknown): void;
  dryingConfig?: DryingConfig;
}

/** 同じインスタンスを handler 間で共有する。各メソッドは CoreApi と同じ形で呼べる。 */
export interface Cycle {
  leaveHouse(): Promise<void>;
  arriveHouse(): Promise<void>;
  /** アプリケーション終了時に cron を破棄する。エアコンは停止しない。 */
  dispose(): Promise<void>;
}

export interface CycleTask {
  start(): void | Promise<void>;
  stop(): void | Promise<void>;
  destroy(): void | Promise<void>;
}

/** テストでは時計・予測・cron を個別に差し替えられる。 */
export interface CycleDependencies {
  now(): number;
  decideNextOperation: typeof decideNextOperation;
  createTask(expression: string, callback: () => Promise<void>): CycleTask;
}

interface RunningCycle {
  presenceMode: PresenceMode;
  progress: number;
  observation: EnvironmentObservation;
  /** Infinity の場合は完了通知を予約しない。 */
  finishesAt: number;
  stopped: boolean;
}

/**
 * handler が外出・帰宅を通知すると運転計画を実機へ送り、cron で予測終了を通知する。
 * 状態はメモリ内で保持するため、単一プロセスで利用する。再起動時には復元しない。
 */
export function createCycle(options: CycleOptions, dependencies: Partial<CycleDependencies> = {}): Cycle {
  const now = dependencies.now ?? Date.now;
  const decide = dependencies.decideNextOperation ?? decideNextOperation;
  const schedule = dependencies.createTask ?? ((expression, callback) =>
    createTask(expression, callback, { noOverlap: true }));
  let running: RunningCycle | undefined;
  let disposed = false;
  let pending: Promise<void> = Promise.resolve();

  // handler と cron の処理を直列化し、実機操作と通知の重複を防ぐ。
  function enqueue(action: () => Promise<void>): Promise<void> {
    const next = pending.then(action);
    pending = next.catch(() => {});
    return next;
  }

  async function finishIfDue(): Promise<void> {
    if (!running || now() < running.finishesAt) return;
    if (!running.stopped) {
      await options.remoteControl.stop();
      running.stopped = true;
    }
    await options.onFinishDrying();
    running = undefined;
    await task.stop();
  }

  const task = schedule("* * * * *", async () => {
    try {
      await enqueue(async () => {
        if (!disposed) await finishIfDue();
      });
    } catch (error) {
      options.onError(error);
    }
  });

  function changePresence(presenceMode: PresenceMode): Promise<void> {
    return enqueue(async () => {
      if (disposed) throw new Error("乾燥サイクルは破棄されています。");
      // 完了待ちの通知を新しい計画で上書きしない。
      await finishIfDue();
      if (running?.presenceMode === presenceMode) return;

      const context = await options.getContext();
      const observedAt = now();
      const observation: EnvironmentObservation = {
        temperature: context.indoorTemperature,
        humidity: context.indoorHumidity,
        observedAt,
      };
      let progress = 0;
      if (running) {
        progress = updateObservedProgress(running.progress, running.observation, observation);
      }
      const plan = decide({ ...context, presenceMode, dryingProgress: progress }, options.dryingConfig);
      switch (plan.mode) {
        case "off":
          await options.remoteControl.stop();
          break;
        case "cool":
        case "heat":
        case "dehumidify":
          await options.remoteControl.send({
            acMode: plan.mode,
            temperature: plan.temperature,
            fanSpeed: plan.fanSpeed,
          });
          break;
        default: {
          const exhaustiveCheck: never = plan;
          return exhaustiveCheck;
        }
      }
      running = {
        presenceMode,
        progress,
        observation,
        finishesAt: now() + plan.estimatedDryingHours * 3_600_000,
        stopped: plan.mode === "off",
      };
      await task.start();
    });
  }

  return {
    leaveHouse: () => changePresence("away"),
    arriveHouse: () => changePresence("home"),
    dispose: () => enqueue(async () => {
      disposed = true;
      await task.destroy();
    }),
  };
}
