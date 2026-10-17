import assert from "node:assert/strict";
import { execFile, type ExecFileException, type ExecFileOptions } from "node:child_process";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { after, beforeEach, mock, test } from "node:test";
import { capture144 } from "./fixtures.js";

const directory = await fs.mkdtemp(join(tmpdir(), "os-ir-hardware-"));
const sysfs = join(directory, "class/lirc");
const cwd = process.cwd();
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const pins = {
  IR_RX_GPIO: process.env.IR_RX_GPIO,
  IR_TX_GPIO: process.env.IR_TX_GPIO,
  DHT_GPIO: process.env.DHT_GPIO,
};
process.chdir(directory);
Object.defineProperty(process, "platform", { value: "linux" });
after(async () => {
  mock.restoreAll();
  process.chdir(cwd);
  Object.defineProperty(process, "platform", platform);
  for (const [key, value] of Object.entries(pins)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  await fs.rm(directory, { recursive: true, force: true });
});

await fs.mkdir(sysfs, { recursive: true });
for (const [name, type, pin] of [
  ["lirc7", "gpio-ir-receiver", 17],
  ["lirc3", "gpio-ir-tx", 18],
] as const) {
  const path = join(directory, "devices", type);
  const node = join(path, "rc/rc0", name);
  await fs.mkdir(node, { recursive: true });
  await fs.mkdir(join(path, "of_node"));
  await fs.writeFile(join(path, "of_node/compatible"), type + "\0");
  const cells = Buffer.alloc(12);
  cells.writeUInt32BE(1, 0);
  cells.writeUInt32BE(pin, 4);
  await fs.writeFile(join(path, "of_node/gpios"), cells);
  await fs.symlink(node, join(sysfs, name));
}

let source: string;
let executable: string;
let timeout: number | undefined;
let calls: string[][];
let children: ReturnType<typeof execFile>[];
beforeEach(() => {
  source = "";
  executable = process.execPath;
  timeout = undefined;
  calls = [];
  children = [];
  delete process.env.IR_RX_GPIO;
  delete process.env.IR_TX_GPIO;
  delete process.env.DHT_GPIO;
});

// Replace device discovery and ir-ctl; exercise real subprocess streams and termination.
mock.module("node:fs/promises", {
  namedExports: {
    ...fs,
    readdir: (path: string) => {
      assert.equal(path, "/sys/class/lirc");
      return fs.readdir(sysfs);
    },
    realpath: (path: string) => fs.realpath(join(sysfs, basename(path))),
  },
});
mock.module("node:child_process", {
  namedExports: {
    execFile: (
      file: string,
      args: string[],
      options: ExecFileOptions,
      callback: (error: ExecFileException | null, stdout: string, stderr: string) => void,
    ) => {
      assert.equal(file, "ir-ctl");
      assert.notEqual(options.shell, true);
      assert.equal(options.timeout, args.includes("--receive") ? 15_000 : 5_000);
      calls.push(args);
      const child = execFile(
        executable,
        ["-e", source],
        { ...options, encoding: "utf8", timeout: timeout ?? options.timeout },
        callback,
      );
      children.push(child);
      return child;
    },
  },
});
const { bootConfig, findDevice, loadConfig } = await import("../dist/config.js");
const { receive, transmit } = await import("../dist/lirc.js");

function output(text: string): void {
  source = `process.stdout.write(${JSON.stringify(text)}); setInterval(() => {}, 1000);`;
}

async function waitForCommand(): Promise<void> {
  while (calls.length === 0) {
    await setImmediate();
  }
}

test("receive complete repeated AC frames across chunks and preserve spaces longer than 19ms", async () => {
  const raw = capture144.timings.map((value, i) => `${i % 2 === 0 ? "+" : "-"}${value}`).join(" ");
  source = `
    process.stdout.write(${JSON.stringify("-125000\n" + raw.slice(0, 1000))});
    setTimeout(() => process.stdout.write(${JSON.stringify(raw.slice(1000) + " -125000\n")}), 10);
    setInterval(() => {}, 1000);
  `;
  assert.deepEqual(await receive(), capture144);
  assert.deepEqual(calls[0], ["--device", "/dev/lirc7", "--receive", "--timeout", "125000"]);
  assert.equal(children[0]!.signalCode, "SIGTERM");

  output("+9000 -30000 +560 -125000 # carrier 36000Hz\n");
  assert.deepEqual(await receive(), {
    frequencyHz: 36000,
    dutyCycle: 50,
    timings: [9000, 30000, 560],
  });
});

test("reject overflow, early timeout and malformed frames without leaving a receiver running", async () => {
  for (const text of [
    "+9000 -4500 +560 # overflow\n",
    "+9000 -4500 +560 -10000\n",
    "+9000 +4500 +560 -125000\n",
    "+9000 -4500 +560 -125000 # carrier 0Hz\n",
  ]) {
    output(text);
    await assert.rejects(receive());
    assert.equal(children.at(-1)!.signalCode, "SIGTERM");
  }
  source = "process.exit(0);";
  await assert.rejects(receive(), /No complete/);
});

test("timeout and cancellation stop the child before releasing the device", async () => {
  output("");
  timeout = 100;
  await assert.rejects(receive(), { killed: true });
  assert.equal(children[0]!.signalCode, "SIGTERM");

  calls = [];
  timeout = undefined;
  const abort = new AbortController();
  const receiving = receive(abort.signal);
  await waitForCommand();
  await assert.rejects(receive(), /busy/);
  abort.abort();
  await assert.rejects(receiving, { name: "AbortError" });
  assert.equal(children.at(-1)!.signalCode, "SIGTERM");

  output("+9000 -4500 +560 -125000\n");
  await receive();
});

test("send one raw file with carrier and duty cycle, then remove the temporary directory", async () => {
  const sending = transmit(capture144);
  await waitForCommand();
  const args = calls[0]!;
  assert.deepEqual(args.slice(0, 7), [
    "--device",
    "/dev/lirc3",
    "--carrier",
    "38000",
    "--duty-cycle",
    "50",
    "--send",
  ]);
  const file = args[7]!;
  const raw = await fs.readFile(file, "utf8");
  const { parseRaw } = await import("../src/raw.js");
  assert.deepEqual(parseRaw(raw), capture144);
  await sending;
  await assert.rejects(fs.access(dirname(file)), { code: "ENOENT" });
  assert.equal(calls.length, 1);
});

test("propagate process failures and warnings without retrying; clean up failed sends", async () => {
  for (const script of [
    'process.stderr.write("send failed"); process.exit(74);',
    'process.stderr.write("failed to set carrier");',
  ]) {
    source = script;
    const before = calls.length;
    await assert.rejects(transmit(capture144), /failed/);
    assert.equal(calls.length, before + 1);
    await assert.rejects(fs.access(dirname(calls.at(-1)![7]!)), { code: "ENOENT" });
  }
  executable = join(directory, "missing-ir-ctl");
  await assert.rejects(transmit(capture144), { code: "ENOENT" });
  await assert.rejects(fs.access(dirname(calls.at(-1)![7]!)), { code: "ENOENT" });
  await assert.rejects(receive(), { code: "ENOENT" });

  executable = process.execPath;
  source = 'process.stderr.write("failed to set receiving timeout");';
  await assert.rejects(receive(), /failed to set receiving timeout/);
});

test(".envのGPIOを検証し、lirc番号に依存せずデバイスを特定する", async (t) => {
  assert.deepEqual(loadConfig(), { rx: 17, tx: 18, dht: 4 });
  await fs.writeFile(".env", "IR_RX_GPIO=22\nIR_TX_GPIO=23\nDHT_GPIO=24\n");
  assert.deepEqual(loadConfig(), { rx: 22, tx: 23, dht: 24 });
  assert.match(bootConfig(), /gpio_pin=22\ndtoverlay=gpio-ir-tx,gpio_pin=23/);
  await fs.rm(".env");
  delete process.env.IR_RX_GPIO;
  delete process.env.IR_TX_GPIO;
  delete process.env.DHT_GPIO;
  for (const key of ["IR_RX_GPIO", "IR_TX_GPIO", "DHT_GPIO"]) {
    for (const value of ["", "17.5", "-1", "28", "abc"]) {
      process.env[key] = value;
      assert.throws(() => loadConfig());
    }
    delete process.env[key];
  }
  for (const [key, value] of [
    ["IR_RX_GPIO", "18"],
    ["DHT_GPIO", "17"],
    ["DHT_GPIO", "18"],
  ] as const) {
    process.env[key] = value;
    assert.throws(() => loadConfig(), /異なるGPIO/);
    delete process.env[key];
  }
  assert.equal(await findDevice(17, "receive"), "/dev/lirc7");
  assert.equal(await findDevice(18, "send"), "/dev/lirc3");
  await assert.rejects(findDevice(22, "receive"), /found 0/);
  await fs.symlink(join(directory, "devices/gpio-ir-tx/rc/rc0/lirc3"), join(sysfs, "lirc4"));
  t.after(() => fs.rm(join(sysfs, "lirc4")));
  await assert.rejects(findDevice(18, "send"), /found 2/);
});
