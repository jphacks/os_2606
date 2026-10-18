import { createTask } from "node-cron";
import { decideNextOperation } from "../drying/index.js";
import { updateObservedProgress } from "../drying/estimator.js";
import { simulateDryingPlan } from "../drying/plan-simulator.js";
import type { PlanSimulation } from "../drying/plan-simulator.js";
import type { EnvironmentObservation } from "../drying/estimator.js";
import type { DryingConfig, DryingContext, DryingDecision, Operation, PresenceMode } from "../drying/index.js";

/** LINE や実機の実装には依存せず、起動側から必要な入出力だけを受け取る。 */
export interface CycleOptions {
  getContext(): Promise<Omit<DryingContext, "presenceMode" | "dryingProgress">>;
  remoteControl: {
    send(message: {
      acMode: Exclude<Operation["mode"], "off">;
      temperature: number;
      fanSpeed?: "low" | "medium" | "high";
    }): Promise<void>;
    stop(): Promise<void>;
  };
  /** LineApi.sendNotificationFinishDrying を渡す。失敗時は次の cron で再試行する。 */
  onFinishDrying(): Promise<void>;
  /** 送信と計画の確定後に呼ぶ。通知に失敗しても乾燥制御は維持する。 */
  onPlanChanged?(plan: DryingDecision & { presenceMode: PresenceMode }): Promise<void>;
  /** cron 内の失敗の報告先。handler からの呼び出し失敗は呼び出し元へ返す。 */
  onError(error: unknown): void;
  dryingConfig?: DryingConfig;
}

export interface CycleEstimate {
  estimatedDryingHours: number;
}

/** 同じインスタンスを handler 間で共有する。 */
export interface Cycle {
  simulatePlan(): Promise<PlanSimulation>;
  /** 「洗濯したよ」で室内モード・進捗0から開始する。乾燥中の重複操作は無視する。 */
  startDrying(): Promise<CycleEstimate>;
  /** 洗濯済みとして外出モードで開始する。乾燥中なら進捗を引き継いで切り替える。 */
  leaveHouse(): Promise<CycleEstimate>;
  /** 乾燥中の運転を室内モードに切り替える。未開始・完了後は何もしない。 */
  arriveHouse(): Promise<CycleEstimate | void>;
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
 * 「洗濯したよ」で室内モード、「行ってきます」で外出モードの乾燥を開始する。
 * 乾燥中の外出・帰宅では進捗を引き継いで再計画する。
 * cron で予測終了を通知する。
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
  function enqueue<T>(action: () => Promise<T>): Promise<T> {
    const next = pending.then(action);
    pending = next.then(() => {}, () => {});
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

  async function planOperation(presenceMode: PresenceMode): Promise<CycleEstimate> {
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
      case "dehumidify": {
        const message: Parameters<CycleOptions["remoteControl"]["send"]>[0] = {
          acMode: plan.mode,
          temperature: plan.temperature,
        };
        if (plan.fanSpeed !== undefined) message.fanSpeed = plan.fanSpeed;
        await options.remoteControl.send(message);
        break;
      }
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
    try {
      await options.onPlanChanged?.({ ...plan, presenceMode });
    } catch (error) {
      options.onError(error);
    }
    return currentEstimate(running);
  }

  function currentEstimate(cycle: RunningCycle): CycleEstimate {
    return { estimatedDryingHours: Math.max(0, (cycle.finishesAt - now()) / 3_600_000) };
  }

  async function prepareOperation(): Promise<void> {
    if (disposed) throw new Error("乾燥サイクルは破棄されています。");
    await finishIfDue();
  }

  async function changePresence(presenceMode: PresenceMode): Promise<CycleEstimate> {
    if (running?.presenceMode === presenceMode) return currentEstimate(running);
    return planOperation(presenceMode);
  }

  return {
    simulatePlan: () => enqueue(async () => {
      if (disposed) throw new Error("乾燥サイクルは破棄されています。");
      const context = await options.getContext();
      const observation = {
        temperature: context.indoorTemperature, humidity: context.indoorHumidity, observedAt: now(),
      };
      let presenceMode: PresenceMode = "home";
      let dryingProgress = 0;
      if (running) {
        presenceMode = running.presenceMode;
        dryingProgress = updateObservedProgress(running.progress, running.observation, observation);
      }
      return simulateDryingPlan({ ...context, presenceMode, dryingProgress }, options.dryingConfig);
    }),
    startDrying: () => enqueue(async () => {
      // 通知待ちのサイクルを新しい洗濯で上書きしない。
      await prepareOperation();
      if (running) return currentEstimate(running);
      return planOperation("home");
    }),
    leaveHouse: () => enqueue(async () => {
      await prepareOperation();
      return changePresence("away");
    }),
    arriveHouse: () => enqueue(async () => {
      await prepareOperation();
      if (!running) return;
      return changePresence("home");
    }),
    dispose: () => enqueue(async () => {
      disposed = true;
      await task.destroy();
    }),
  };
}
