import { loadRemoteControl, loadTemperatureSensor } from "@os/sensor";
import type { AcMessage } from "@os/api";
import { DEFAULT_DRYING_CONFIG } from "@os/core/drying";
import { createLineBot } from "./index.js";
import { createLineApi } from "./line-api.js";
import { createRuntime } from "./runtime.js";

export interface ApplicationConfig {
  channelSecret: string;
  channelAccessToken: string;
  outdoorTemperature: number;
  outdoorHumidity: number;
  comfortTemperature: number;
  port: number;
}

export function readApplicationConfig(env: NodeJS.ProcessEnv): ApplicationConfig {
  function required(name: string): string {
    const value = env[name]?.trim();
    if (!value) throw new Error(`${name}を設定してください。`);
    return value;
  }
  function number(name: string, min: number, max: number, fallback?: number): number {
    let value: number;
    if (env[name] === undefined && fallback !== undefined) {
      value = fallback;
    } else {
      value = Number(required(name));
    }
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(`${name}には${min}〜${max}の数値を設定してください。`);
    }
    return value;
  }
  const config = {
    channelSecret: required("LINE_CHANNEL_SECRET"),
    channelAccessToken: required("LINE_CHANNEL_ACCESS_TOKEN"),
    outdoorTemperature: number("OUTDOOR_TEMPERATURE", -60, 60),
    outdoorHumidity: number("OUTDOOR_HUMIDITY", 0, 100),
    comfortTemperature: number("COMFORT_TEMPERATURE", 16, 28, 24),
    port: number("PORT", 1, 65535, 3000),
  };
  if (!Number.isInteger(config.port)) throw new Error("PORTには整数を設定してください。");
  return config;
}

/** 起動時に実機APIを一度読み込み、一つの家のサイクルを全Webhookで共有する。 */
export async function createApplication(config: ApplicationConfig) {
  const [remoteControl, sensor] = await Promise.all([
    loadRemoteControl(),
    loadTemperatureSensor(),
  ]);
  // デバイスの存在だけでなく、属性の読み取り・実測に成功してから公開する。
  await sensor.measure();
  const line = createLineApi(config.channelAccessToken);
  const runtime = createRuntime({
    remoteControl,
    sensor,
    outdoorTemperature: config.outdoorTemperature,
    outdoorHumidity: config.outdoorHumidity,
    comfortTemperature: config.comfortTemperature,
    dryingConfig: {
      ...DEFAULT_DRYING_CONFIG,
      capabilities: { ...DEFAULT_DRYING_CONFIG.capabilities, allowAutomaticDehumidify: true },
      isOperationSupported(operation) {
        if (operation.mode === "off") return true;
        const message: AcMessage = { acMode: operation.mode, temperature: operation.temperature };
        if (operation.fanSpeed !== undefined) {
          message.fanSpeed = operation.fanSpeed;
        } else {
          // 省略時に「前回の風量を維持」する方式もある。自動候補は手動指定できない機種に限る。
          for (const fanSpeed of DEFAULT_DRYING_CONFIG.capabilities.fanSpeeds.dehumidify) {
            if (remoteControl.supports({ ...message, fanSpeed })) return false;
          }
        }
        return remoteControl.supports(message);
      },
    },
    onFinishDrying: () => line.sendNotificationFinishDrying(),
    onPlanChanged: (plan) => line.sendNotificationDryingPlan(plan),
    onError: (error) => console.error("乾燥制御または通知に失敗しました。", error),
  });
  try {
    return {
      app: createLineBot(config.channelSecret, config.channelAccessToken, runtime.core),
      dispose: runtime.dispose,
    };
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
}
