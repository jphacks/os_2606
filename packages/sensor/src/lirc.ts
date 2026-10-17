import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { findDevice, loadConfig } from "./config.js";
import { parseRaw } from "./raw.js";
import { validateSignal, type IrSignal } from "./types.js";

const LEARNING_TIMEOUT_MS = 15_000;
const FRAME_GAP_US = 125_000;

export function receive(signal?: AbortSignal): Promise<IrSignal> {
  return withDevice("receive", (devicePath) => {
    signal?.throwIfAborted();
    return new Promise<IrSignal>((resolve, reject) => {
      let received: IrSignal | undefined;
      let parseError: unknown;
      // --one-shot stops at a 19ms space, which would truncate repeated AC frames.
      const child = execFile(
        "ir-ctl",
        ["--device", devicePath, "--receive", "--timeout", String(FRAME_GAP_US)],
        { timeout: LEARNING_TIMEOUT_MS, maxBuffer: 64 * 1024, encoding: "utf8" },
        (error, _stdout, stderr) => {
          lines.close();
          signal?.removeEventListener("abort", cancel);
          if (signal?.aborted) {
            reject(signal.reason);
          } else if (parseError) {
            reject(parseError);
          } else if (stderr.trim()) {
            reject(new Error(stderr.trim()));
          } else if (received && (!error || error.killed)) {
            resolve(received);
          } else {
            reject(error ?? new Error("No complete IR signal received."));
          }
        },
      );
      const lines = createInterface({ input: child.stdout! });
      const cancel = () => child.kill();
      // Wait for process exit before releasing the device, including on cancellation.
      signal?.addEventListener("abort", cancel, { once: true });
      lines.on("line", (line) => {
        if (received || parseError || /^-\d+\s*$/.test(line)) {
          return;
        }
        try {
          // ir-ctl ends a line at a receive timeout; preserve every internal space.
          const match = /-(\d+)(?: # carrier (\d+)Hz)?\s*$/.exec(line);
          if (!match || Number(match[1]) < FRAME_GAP_US) {
            throw new Error("Incomplete IR signal or receive buffer overflow.");
          }
          received = parseRaw(line.split(" #")[0]!);
          if (match[2]) {
            received.frequencyHz = Number(match[2]);
            validateSignal(received);
          }
        } catch (error) {
          parseError = error;
        }
        child.kill();
      });
    });
  });
}

export async function transmit(signal: IrSignal): Promise<void> {
  validateSignal(signal);
  return withDevice("send", async (devicePath) => {
    const directory = await mkdtemp(join(tmpdir(), "os-ir-"));
    try {
      const file = join(directory, "signal.ir");
      // ir-ctl rewinds its input, so it needs a file rather than a stdin pipe.
      const content = signal.timings.map((value, i) => `${i % 2 === 0 ? "+" : "-"}${value}`);
      await writeFile(file, content.join(" ") + "\n");
      await new Promise<void>((resolve, reject) => {
        execFile(
          "ir-ctl",
          [
            "--device",
            devicePath,
            "--carrier",
            String(signal.frequencyHz),
            "--duty-cycle",
            String(signal.dutyCycle),
            "--send",
            file,
          ],
          { timeout: 5_000 },
          (error, _stdout, stderr) => {
            if (error || stderr.trim()) {
              reject(error ?? new Error(stderr.trim()));
            } else {
              resolve();
            }
          },
        );
      });
      await delay(FRAME_GAP_US / 1000);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

const busyDevices = new Set<string>();

async function withDevice<T>(
  direction: "receive" | "send",
  operation: (devicePath: string) => Promise<T>,
): Promise<T> {
  if (process.platform !== "linux") {
    throw new Error("IR hardware requires Linux on Raspberry Pi.");
  }
  const config = loadConfig();
  const gpio = direction === "receive" ? config.rx : config.tx;
  const devicePath = await findDevice(gpio, direction);
  if (busyDevices.has(devicePath)) {
    throw new Error(`${devicePath} is busy.`);
  }
  busyDevices.add(devicePath);
  try {
    return await operation(devicePath);
  } finally {
    busyDevices.delete(devicePath);
  }
}
