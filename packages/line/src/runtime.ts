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
  },
  dependencies: Partial<CycleDependencies> = {},
): { core: CoreApi; dispose(): Promise<void> } {
  const cycle = createCycle({
    ...options,
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
