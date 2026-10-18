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
// Promise版の待機も偽タイマーで進める。
vi.mock("node:timers/promises", () => ({
  setTimeout: (milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
}));

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
  vi.useFakeTimers();
  vi.resetAllMocks();
  for (const key of ["IR_RX_GPIO", "IR_TX_GPIO", "DHT_GPIO"]) {
    vi.stubEnv(key, undefined);
  }
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

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

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

test("不正なGPIOや赤外線と重複したGPIOではデバイスを読み取らない", async () => {
  for (const gpio of ["", "17.5", "-1", "28", "abc", "17", "18"]) {
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

test.each(["EIO", "EAGAIN", "ETIMEDOUT"])("%sは2秒待ってから取り直す", async (code) => {
  const path = `${directory}/iio:device7/in_temp_input`;
  const sensor = await loadTemperatureSensor();
  io.readFile.mockClear();
  files.set(path, Object.assign(new Error("DHT11 read failed"), { code }));

  const measurement = sensor.measure();
  await vi.advanceTimersByTimeAsync(1999);
  expect(io.readFile).toHaveBeenCalledTimes(1);

  files.set(path, "25000\n");
  await vi.advanceTimersByTimeAsync(1);
  expect(await measurement).toEqual({ temperature: 25, humidity: 56.7 });
  expect(io.readFile).toHaveBeenCalledTimes(3);
  expect(vi.getTimerCount()).toBe(0);
});

test("湿度の読み取りに失敗した場合は温度も取り直す", async () => {
  const path = `${directory}/iio:device7`;
  const sensor = await loadTemperatureSensor();
  io.readFile.mockClear();
  files.set(
    `${path}/in_humidityrelative_input`,
    Object.assign(new Error("DHT11 read failed"), { code: "EIO" }),
  );

  const measurement = sensor.measure();
  await vi.advanceTimersByTimeAsync(1999);
  expect(io.readFile).toHaveBeenCalledTimes(2);

  files.set(`${path}/in_temp_input`, "25000\n");
  files.set(`${path}/in_humidityrelative_input`, "60000\n");
  await vi.advanceTimersByTimeAsync(1);
  expect(await measurement).toEqual({ temperature: 25, humidity: 60 });
  expect(io.readFile).toHaveBeenCalledTimes(4);
});

test("3回失敗したら最後のエラーを伝え、次の測定は再試行できる", async () => {
  const sensor = await loadTemperatureSensor();
  io.readFile.mockClear();
  const errors = ["EIO", "EAGAIN", "ETIMEDOUT"].map((code) =>
    Object.assign(new Error(`DHT11 read failed: ${code}`), { code }),
  );
  for (const error of errors) {
    io.readFile.mockRejectedValueOnce(error);
  }

  const result = expect(sensor.measure()).rejects.toBe(errors[2]);
  await vi.advanceTimersByTimeAsync(3999);
  expect(io.readFile).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  await result;
  expect(io.readFile).toHaveBeenCalledTimes(3);
  expect(vi.getTimerCount()).toBe(0);
  expect(io.readFile).not.toHaveBeenCalledWith(
    `${directory}/iio:device7/in_humidityrelative_input`,
    "utf8",
  );

  expect(await sensor.measure()).toEqual({ temperature: 23.4, humidity: 56.7 });
});

test.each(["EACCES", "ENOENT", "EINVAL"])("%sはリトライせずに伝える", async (code) => {
  const sensor = await loadTemperatureSensor();
  io.readFile.mockClear();
  const error = Object.assign(new Error("DHT11 read failed"), { code });
  files.set(`${directory}/iio:device7/in_temp_input`, error);

  await expect(sensor.measure()).rejects.toBe(error);
  expect(io.readFile).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
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
  expect(vi.getTimerCount()).toBe(0);
});

test("権限エラーをセンサー未接続として隠さない", async () => {
  const error = Object.assign(new Error("permission denied"), { code: "EACCES" });
  files.set(`${directory}/iio:device7/of_node/gpios`, error);
  await expect(loadTemperatureSensor()).rejects.toBe(error);
});
