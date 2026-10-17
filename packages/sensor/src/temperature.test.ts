import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { loadTemperatureSensor } from "./temperature.js";

const io = vi.hoisted(() => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
  realpath: vi.fn(),
  loadEnvFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => io);
vi.mock("node:process", () => ({ loadEnvFile: io.loadEnvFile }));

const directory = "/sys/bus/iio/devices";
const files = new Map<string, string | Buffer | Error>();
const missing = () => Object.assign(new Error("not found"), { code: "ENOENT" });

function addSensor(name: string, gpio: number): string {
  const path = `${directory}/${name}`;
  const gpios = Buffer.alloc(12);
  gpios.writeUInt32BE(1, 0);
  gpios.writeUInt32BE(gpio, 4);
  files.set(`${path}/of_node/compatible`, "dht11\0");
  files.set(`${path}/of_node/gpios`, gpios);
  files.set(`${path}/in_temp_input`, "23400\n");
  files.set(`${path}/in_humidityrelative_input`, "56700\n");
  return path;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DHT_GPIO", undefined);
  files.clear();
  io.readdir.mockResolvedValue(["iio:device7"]);
  addSensor("iio:device7", 4);
  io.readFile.mockImplementation(async (path: string) => {
    const value = files.get(path);
    if (value === undefined) {
      throw missing();
    }
    if (value instanceof Error) {
      throw value;
    }
    return value;
  });
});

afterEach(() => vi.unstubAllEnvs());

test(".envのGPIOでDHT11を選び、温度と相対湿度の単位を変換する", async () => {
  io.loadEnvFile.mockImplementation(() => vi.stubEnv("DHT_GPIO", "23"));
  io.readdir.mockResolvedValue(["iio:device7", "iio:device9", "iio:device10", "trigger0"]);
  const path = addSensor("iio:device9", 23);
  files.set(`${directory}/iio:device10/of_node/compatible`, "other-sensor\0");
  files.set(`${directory}/iio:device7/in_temp_input`, "10000\n");

  const sensor = await loadTemperatureSensor();
  expect(io.loadEnvFile).toHaveBeenCalledOnce();
  expect(await sensor.measure()).toEqual({ temperature: 23.4, humidity: 56.7 });
  files.set(`${path}/in_temp_input`, "24100\n");
  expect(await sensor.measure()).toEqual({ temperature: 24.1, humidity: 56.7 });
});

test(".envがない場合はGPIO4を使用する", async () => {
  io.loadEnvFile.mockImplementation(() => {
    throw missing();
  });
  expect(await (await loadTemperatureSensor()).measure()).toEqual({
    temperature: 23.4,
    humidity: 56.7,
  });
});

test("不正なGPIOではデバイスを読み取らない", async () => {
  for (const gpio of ["", "17.5", "-1", "28", "abc"]) {
    vi.stubEnv("DHT_GPIO", gpio);
    await expect(loadTemperatureSensor()).rejects.toThrow(/DHT_GPIO/);
  }
  expect(io.readdir).not.toHaveBeenCalled();
});

test("ドライバーが未設定なら必要なoverlay設定を案内する", async () => {
  io.readdir.mockRejectedValue(missing());
  await expect(loadTemperatureSensor()).rejects.toThrow("dtoverlay=dht11,gpiopin=4");
});

test("指定GPIOに該当するセンサーが0台または複数台なら拒否する", async () => {
  addSensor("iio:device7", 23);
  await expect(loadTemperatureSensor()).rejects.toThrow("0台");
  addSensor("iio:device7", 4);
  addSensor("iio:device8", 4);
  io.readdir.mockResolvedValue(["iio:device7", "iio:device8"]);
  await expect(loadTemperatureSensor()).rejects.toThrow("2台");
});

test("読み取り失敗を伝え、次の測定は再試行できる", async () => {
  const path = `${directory}/iio:device7/in_temp_input`;
  const error = Object.assign(new Error("DHT11 read failed"), { code: "EIO" });
  const sensor = await loadTemperatureSensor();
  files.set(path, error);
  await expect(sensor.measure()).rejects.toBe(error);
  expect(io.readFile).not.toHaveBeenCalledWith(
    `${directory}/iio:device7/in_humidityrelative_input`,
    "utf8",
  );
  files.set(path, "25000\n");
  expect(await sensor.measure()).toEqual({ temperature: 25, humidity: 56.7 });
});

test("空の値や不正な測定値を正常値として扱わない", async () => {
  const sensor = await loadTemperatureSensor();
  const path = `${directory}/iio:device7`;
  for (const value of ["", "\n", "NaN", "25000oops"]) {
    files.set(`${path}/in_temp_input`, value);
    await expect(sensor.measure()).rejects.toThrow("数値");
  }
  files.set(`${path}/in_temp_input`, "25000\n");
  files.set(`${path}/in_humidityrelative_input`, "101000\n");
  await expect(sensor.measure()).rejects.toThrow("0〜100%");
});

test("権限エラーをセンサー未接続として隠さない", async () => {
  const error = Object.assign(new Error("permission denied"), { code: "EACCES" });
  files.set(`${directory}/iio:device7/of_node/gpios`, error);
  await expect(loadTemperatureSensor()).rejects.toBe(error);
});
