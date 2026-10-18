import type { CoreApi, TemperatureSensor } from "@os/api";
import { createCycle, getHouseConfig, updateHouseConfig } from "@os/core";
import type { CycleDependencies, CycleOptions } from "@os/core";

/** 一つの家に対するサイクルを共有し、LINEのコマンドを実際の入出力へ接続する。 */
export function createRuntime(
  options: Omit<CycleOptions, "getContext"> & {
    sensor: TemperatureSensor;
    outdoorTemperature: number;
    outdoorHumidity: number;
    comfortTemperature: number;
    onTemperatureChanged?(temperature: number): Promise<void>;
  },
  dependencies: Partial<CycleDependencies> = {},
): { core: CoreApi; dispose(): Promise<void> } {
  let lastTemperature: number | undefined;
  const cycle = createCycle({
    ...options,
    remoteControl: {
      stop: () => options.remoteControl.stop(),
      async send(message) {
        await options.remoteControl.send(message);
        if (lastTemperature === message.temperature) return;
        lastTemperature = message.temperature;
        try {
          await options.onTemperatureChanged?.(message.temperature);
        } catch (error) {
          // 通知の失敗で、送信済みの操作や乾燥計画を失敗扱いにしない。
          options.onError(error);
        }
      },
    },
    async getContext() {
      const { temperature, humidity } = await options.sensor.measure();
      return {
        indoorTemperature: temperature,
        indoorHumidity: humidity,
        outdoorTemperature: options.outdoorTemperature,
        outdoorHumidity: options.outdoorHumidity,
        comfortTemperature: options.comfortTemperature,
      };
    },
  }, dependencies);
  return {
    core: {
      startDrying: () => cycle.startDrying(),
      leaveHouse: () => cycle.leaveHouse(),
      arriveHouse: () => cycle.arriveHouse(),
      async laundryPositionFromAC(position) {
        await updateHouseConfig({ ...(await getHouseConfig()), laundryPositionFromAC: position });
      },
      async setUpHouseConfig(region) {
        await updateHouseConfig({ ...(await getHouseConfig()), region });
      },
      async hangLaundryEvidence() {
        return cycle.startDrying();
      },
    },
    dispose: () => cycle.dispose(),
  };
}
