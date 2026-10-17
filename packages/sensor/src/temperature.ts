import type { TemperatureSensor } from "@os/api";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "./config.js";

const deviceDirectory = "/sys/bus/iio/devices";

/** DHT_GPIOに接続したDHT11をLinuxのIIOドライバーから読み取る。 */
export async function loadTemperatureSensor(): Promise<TemperatureSensor> {
  const { dht } = loadConfig();
  const devicePath = await findSensor(dht);

  return {
    async measure() {
      // ドライバーが温湿度を一緒に測定し、成功した値を2秒間保持する。
      const temperature = await readMeasurement(devicePath, "in_temp_input");
      const humidity = await readMeasurement(devicePath, "in_humidityrelative_input");
      if (humidity < 0 || humidity > 100) {
        throw new Error("DHT11の相対湿度が0〜100%の範囲外です。");
      }
      return { temperature, humidity };
    },
  };
}

async function findSensor(gpio: number): Promise<string> {
  let deviceNames: string[];
  try {
    deviceNames = await readdir(deviceDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    deviceNames = [];
  }

  const matches: string[] = [];
  for (const name of deviceNames.filter((name) => /^iio:device\d+$/.test(name))) {
    const devicePath = join(deviceDirectory, name);
    try {
      const compatible = await readFile(join(devicePath, "of_node/compatible"), "utf8");
      if (!compatible.split("\0").includes("dht11")) {
        continue;
      }
      const gpios = await readFile(join(devicePath, "of_node/gpios"));
      // Raspberry PiのDevice Tree: <GPIOコントローラー ピン番号 フラグ>。
      if (gpios.length === 12 && gpios.readUInt32BE(4) === gpio) {
        matches.push(devicePath);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  if (matches.length !== 1) {
    throw new Error(
      `GPIO${gpio}のDHT11は1台必要ですが、${matches.length}台見つかりました。/boot/firmware/config.txtにdtoverlay=dht11,gpiopin=${gpio}を設定して再起動してください。`,
    );
  }
  return matches[0]!;
}

async function readMeasurement(devicePath: string, attribute: string): Promise<number> {
  const text = (await readFile(join(devicePath, attribute), "utf8")).trim();
  const value = Number(text);
  if (!/^-?\d+$/.test(text) || !Number.isSafeInteger(value)) {
    throw new Error(`DHT11の${attribute}が数値ではありません。`);
  }
  // IIOの温度はミリ°C、相対湿度は0.001%単位。
  return value / 1000;
}
