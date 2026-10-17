import { readFile, readdir, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { loadEnvFile } from "node:process";
import { validateInteger } from "./types.js";

export function loadConfig(): { rx: number; tx: number; dht: number } {
  try {
    loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const env = process.env;
  for (const key of ["IR_RX_GPIO", "IR_TX_GPIO", "DHT_GPIO"]) {
    if (env[key] !== undefined && !/^\d+$/.test(env[key]!)) {
      throw new Error(`${key}にはBCM GPIO番号を指定してください。`);
    }
  }

  const rx = validateInteger(Number(env.IR_RX_GPIO ?? 17), 0, 27, "IR_RX_GPIO");
  const tx = validateInteger(Number(env.IR_TX_GPIO ?? 18), 0, 27, "IR_TX_GPIO");
  const dht = validateInteger(Number(env.DHT_GPIO ?? 4), 0, 27, "DHT_GPIO");
  if (rx === tx || rx === dht || tx === dht) {
    throw new Error("IR_RX_GPIO、IR_TX_GPIO、DHT_GPIOには異なるGPIOピンを指定してください。");
  }
  return { rx, tx, dht };
}

export function bootConfig(): string {
  const config = loadConfig();
  return `dtoverlay=gpio-ir,gpio_pin=${config.rx}\ndtoverlay=gpio-ir-tx,gpio_pin=${config.tx}\n`;
}

/** Follow sysfs ancestors to the gpio-ir device-tree node, independent of lirc numbering. */
export async function findDevice(gpio: number, direction: "receive" | "send"): Promise<string> {
  const sysfsDirectory = "/sys/class/lirc";
  validateInteger(gpio, 0, 27, "GPIO");
  let deviceNames: string[];
  try {
    deviceNames = await readdir(sysfsDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    deviceNames = [];
  }
  const matchingDevices: string[] = [];
  const expectedCompatible = direction === "receive" ? "gpio-ir-receiver" : "gpio-ir-tx";

  for (const name of deviceNames.filter((name) => /^lirc\d+$/.test(name))) {
    let devicePath = await realpath(join(sysfsDirectory, name));
    for (
      let depth = 0;
      depth < 8 && devicePath !== dirname(devicePath);
      depth++, devicePath = dirname(devicePath)
    ) {
      try {
        const compatibleData = await readFile(join(devicePath, "of_node/compatible"), "utf8");
        const compatibleTypes = compatibleData.split("\0");
        if (!compatibleTypes.includes(expectedCompatible)) {
          continue;
        }
        const gpioCells = await readFile(join(devicePath, "of_node/gpios"));
        // Raspberry Pi overlays use <gpio-controller pin flags> (big-endian DT cells).
        if (gpioCells.length === 12 && gpioCells.readUInt32BE(4) === gpio) {
          matchingDevices.push(`/dev/${name}`);
        }
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }
  }

  if (matchingDevices.length !== 1) {
    throw new Error(
      `Expected one ${direction} device on GPIO${gpio}, found ${matchingDevices.length}. Apply 'pnpm ir boot-config' to /boot/firmware/config.txt and reboot.`,
    );
  }
  return matchingDevices[0]!;
}
