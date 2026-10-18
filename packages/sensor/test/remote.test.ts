import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseFlipper } from "../src/flipper.js";
import { identify } from "../src/protocol.js";
import { encodeWave } from "../src/protocols/common.js";
import { sharp104 } from "../src/protocols/sharp.js";
import type { AcMessage, RemoteControl } from "@os/api";
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
  await t.test("missing file uses Mitsubishi 144 without receiving, and retains successful settings", async () => {
    const remote = await loadRemoteControl();
    assert.equal(sent.length, 0);
    await remote.stop();
    const stopped = identify(sent.at(-1)!);
    assert.equal(stopped.protocol, "mitsubishi144");
    assert.equal(stopped.state[5]! & 0x20, 0);
    await remote.send({ acMode: "dehumidify", temperature: 24, fanSpeed: "high" });
    const reloaded = await loadRemoteControl();
    await reloaded.send({ acMode: "cool", temperature: 26 });
    const cooled = identify(sent.at(-1)!);
    assert.equal(cooled.protocol, "mitsubishi144");
    assert.equal(cooled.state[5]! & 0x20, 0x20);
    assert.equal(cooled.state[6]! & 0x38, 0x18);
    assert.equal(cooled.state[7]! & 0x1f, 10);
    assert.equal(cooled.state[9]! & 0x87, 3);
    await writeFile(file, "broken JSON");
    await assert.rejects(loadRemoteControl(), SyntaxError);
    await rm(file);
    sent.length = 0;
  });
  const learned = await learnRemote();
  assert.equal(learned.protocol, "mitsubishi112");
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")).state, capture112State);
  const remote = await loadRemoteControl();
  const message: AcMessage = {
    acMode: "cool",
    temperature: 26,
    fanSpeed: "low",
    windDirectionVertical: "up",
    windDirectionHorizontal: "center",
  };
  const first = remote.send(message);
  message.temperature = 30;
  message.fanSpeed = "high";
  await Promise.all([first, remote.stop()]);
  assert.equal(identify(sent[0]!).state[7], 5); // 31 - 26, snapshot at invocation.
  assert.equal(identify(sent[0]!).state[8]! & 7, 3); // Low, snapshot before caller changed it.
  assert.equal(identify(sent[1]!).state[5]! & 4, 0);
  await assert.rejects(remote.send(undefined as unknown as AcMessage));
  await assert.rejects(
    remote.send({ ...message, fanSpeed: "auto" } as unknown as AcMessage),
    /fan speed/,
  );
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

  // Failed direction/fan changes must not leak into the next queued, omitted settings.
  fail = true;
  const badWind = remote.send({ ...message, windDirectionHorizontal: "right" });
  const retainedWind = remote.send({ acMode: "dehumidify", temperature: 22 });
  await assert.rejects(badWind, /write failed/);
  await retainedWind;
  assert.equal(identify(sent.at(-1)!).state[12]! & 0x3c, 0x0c); // Last successful center, not right or learned auto.
  assert.equal(identify(sent.at(-1)!).state[6]! & 7, 2); // Dry.
  assert.equal(identify(sent.at(-1)!).state[8]! & 7, 3); // Last successful low.
  const reloaded = await loadRemoteControl();
  await reloaded.send({ acMode: "cool", temperature: 25 });
  assert.equal(identify(sent.at(-1)!).state[12]! & 0x3c, 0x0c);
  assert.equal(identify(sent.at(-1)!).state[8]! & 7, 3);

  await t.test("Sharp A705 survives dry, stop and reload before cooling again", async () => {
    // Upstream TestSharpAcClass.Models real A705 message.
    const state = [0xaa, 0x5a, 0xcf, 0x10, 0xd1, 0x11, 0x22, 0, 8, 0x80, 0, 0xf0, 0xf1];
    await saveSignal(encodeWave(sharp104, state));
    const sharp = await loadRemoteControl();
    await sharp.send({ acMode: "dehumidify", temperature: 24 });
    assert.equal(identify(sent.at(-1)!).state[4], 0);
    assert.equal(JSON.parse(await readFile(file, "utf8")).sharpModel, "a705");
    await sharp.stop();
    assert.equal(identify(sent.at(-1)!).state[4], 0); // Keep the dry temperature encoding on off.
    const reloadedSharp = await loadRemoteControl();
    await assert.rejects(reloadedSharp.send({ acMode: "heat", temperature: 22 }), /heating/);
    await reloadedSharp.send({ acMode: "cool", temperature: 26, fanSpeed: "high" });
    const cooled = identify(sent.at(-1)!);
    assert.equal(cooled.state[4], 0xdb); // A705 model bit restored, not A903's 0xcb.
    assert.equal(cooled.state[6]! & 0x70, 0x70);
    assert.equal(cooled.sharpModel, "a705");
  });
  const previousPath = process.env.IR_REMOTE_PATH;
  try {
    const customFile = join(directory, "custom/remote.json");
    process.env.IR_REMOTE_PATH = customFile;
    await saveSignal(capture112);
    const customRemote: RemoteControl = await loadRemoteControl();
    const before = sent.length;
    const stored = await readFile(customFile, "utf8");
    assert.equal(customRemote.supports({ acMode: "dehumidify", temperature: 24, fanSpeed: "low" }), true);
    assert.equal(customRemote.supports({ acMode: "cool", temperature: 24.25, fanSpeed: "high" }), false);
    assert.equal(sent.length, before); // Capability checks must not send or persist anything.
    assert.equal(await readFile(customFile, "utf8"), stored);
    process.env.IR_REMOTE_PATH = join(directory, "different/remote.json");
    await customRemote.send({ acMode: "heat", temperature: 22, fanSpeed: "high" });
    assert.equal(JSON.parse(await readFile(customFile, "utf8")).state[8] & 7, 0);
  } finally {
    if (previousPath === undefined) delete process.env.IR_REMOTE_PATH;
    else process.env.IR_REMOTE_PATH = previousPath;
  }
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
