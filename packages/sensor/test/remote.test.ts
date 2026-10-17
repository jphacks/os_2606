import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseFlipper } from "../src/flipper.js";
import { identify } from "../src/protocol.js";
import type { AcMessage } from "@os/api";
import type { IrSignal } from "../src/types.js";
import { capture112, capture112State } from "./fixtures.js";

test("learn, persist, reload and serialize send/off; failed sends do not block later calls", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "os-ir-"));
  const cwd = process.cwd();
  process.chdir(directory);
  t.after(async () => {
    process.chdir(cwd);
    await rm(directory, { recursive: true, force: true });
  });
  const file = join(directory, "data/ir/remote.json");
  const sent: IrSignal[] = [];
  let active = false;
  let fail = false;
  t.mock.module("../dist/lirc.js", {
    namedExports: {
      receive: async () => structuredClone(capture112),
      transmit: async (signal: IrSignal) => {
        assert.equal(active, false);
        active = true;
        await new Promise((resolve) => setImmediate(resolve));
        active = false;
        if (fail) {
          fail = false;
          throw new Error("write failed");
        }
        sent.push(signal);
      },
    },
  });
  const { learnRemote, loadRemoteControl } = await import("../dist/index.js");
  const { saveSignal } = await import("../dist/remote.js");
  const learned = await learnRemote();
  assert.equal(learned.protocol, "mitsubishi112");
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")).state, capture112State);
  const remote = await loadRemoteControl();
  const message: AcMessage = {
    acMode: "cool",
    temperature: 26,
    windDirectionVertical: "up",
    windDirectionHorizontal: "center",
  };
  const first = remote.send(message);
  message.temperature = 30;
  await Promise.all([first, remote.stop()]);
  assert.equal(identify(sent[0]!).state[7], 5); // 31 - 26, snapshot at invocation.
  assert.equal(identify(sent[1]!).state[5]! & 4, 0);
  await assert.rejects(remote.send(undefined as unknown as AcMessage));
  assert.equal(sent.length, 2);
  fail = true;
  const rejected = remote.send(message);
  const recovery = remote.stop();
  await assert.rejects(rejected, /write failed/);
  await recovery;
  assert.equal(sent.length, 3);
  const saved = await readFile(file, "utf8");
  await assert.rejects(saveSignal({ ...capture112, timings: [9000, 4500, 560] }), /Unsupported/);
  assert.equal(await readFile(file, "utf8"), saved);

  // A failed direction change must not leak into the next queued, omitted direction.
  fail = true;
  const badWind = remote.send({ ...message, windDirectionHorizontal: "right" });
  const retainedWind = remote.send({ acMode: "heat", temperature: 22 });
  await assert.rejects(badWind, /write failed/);
  await retainedWind;
  assert.equal(identify(sent.at(-1)!).state[12]! & 0x3c, 0x0c); // Last successful center, not right or learned auto.
  const reloaded = await loadRemoteControl();
  await reloaded.send({ acMode: "cool", temperature: 25 });
  assert.equal(identify(sent.at(-1)!).state[12]! & 0x3c, 0x0c);
});

const flipper = `Filetype: IR signals file
Version: 1
#
name: Cool
type: raw
frequency: 38000
duty_cycle: 0.330000
data: ${capture112.timings.join(" ")} 100000
`;

test("import a Flipper raw button for the same learning pipeline", () => {
  const signal = parseFlipper(flipper, "Cool");
  assert.equal(signal.dutyCycle, 33);
  assert.deepEqual(identify(signal).state, capture112State);
  assert.throws(() => parseFlipper(flipper, "Missing"), /found 0/);
  assert.throws(() => parseFlipper(flipper.replace("type: raw", "type: parsed"), "Cool"), /raw/);
  assert.throws(
    () => parseFlipper(flipper + flipper.slice(flipper.indexOf("name:")), "Cool"),
    /found 2/,
  );
  assert.throws(() => parseFlipper(flipper.replace(" 100000", " NaN"), "Cool"), /timing/);
});
