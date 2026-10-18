import assert from "node:assert/strict";
import { test } from "node:test";
import { encode, identify } from "../src/protocol.js";
import type { AcMessage } from "@os/api";
import type { IrSignal } from "../src/types.js";
import { capture112, capture112State, capture144, capture144State } from "./fixtures.js";

const cool: AcMessage = {
  acMode: "cool",
  temperature: 26,
  windDirectionVertical: "up",
  windDirectionHorizontal: "left",
};

test("identify real 144-bit and 112-bit captures with timing jitter", () => {
  assert.deepEqual(identify(capture144), {
    version: 1,
    protocol: "mitsubishi144",
    state: capture144State,
  });
  assert.deepEqual(identify(capture112), {
    version: 1,
    protocol: "mitsubishi112",
    state: capture112State,
  });
});

test("generate complete cool/heat states and explicit off, without mutating the learned state", () => {
  const remote144 = identify(capture144);
  const wave = encode(remote144, { ...cool, temperature: 26.5 });
  assert.equal(wave.timings.length, 583);
  assert.equal(wave.timings[291], 15500);
  assert.deepEqual(wave.timings.slice(0, 291), wave.timings.slice(292));
  assert.deepEqual(
    identify(wave).state,
    [0x23, 0xcb, 0x26, 1, 0, 0x20, 0x18, 0x1a, 0x26, 0x49, 0, 0, 0, 0, 0, 0, 8, 0xde],
  );
  assert.deepEqual(
    identify(
      encode(remote144, {
        ...cool,
        acMode: "heat",
        temperature: 20,
        windDirectionVertical: "middle",
        windDirectionHorizontal: "center",
      }),
    ).state,
    [0x23, 0xcb, 0x26, 1, 0, 0x20, 8, 4, 0x30, 0x59, 0, 0, 0, 0, 0, 0, 0x18, 0xe2],
  );
  assert.deepEqual(identify(encode(remote144)).state, capture144State);
  assert.deepEqual(remote144.state, capture144State);

  const remote112 = identify(capture112);
  assert.deepEqual(
    identify(encode(remote112, cool)).state,
    [0x23, 0xcb, 0x26, 1, 0, 0x24, 3, 5, 0x0a, 0, 0, 0, 8, 0x53],
  );
  assert.deepEqual(
    identify(
      encode(remote112, {
        ...cool,
        acMode: "heat",
        temperature: 22,
        windDirectionVertical: "down",
        windDirectionHorizontal: "right",
      }),
    ).state,
    [0x23, 0xcb, 0x26, 1, 0, 0x24, 1, 9, 0x2a, 0, 0, 0, 0x10, 0x7d],
  );
  assert.deepEqual(
    identify(encode(remote112)).state,
    [0x23, 0xcb, 0x26, 1, 0, 0x20, 3, 8, 0x3a, 0, 0, 0, 0x30, 0xaa],
  );
  assert.deepEqual(remote112.state, capture112State);
});

test("reject unsupported formats, corrupt checksums, mismatching repeats and truncated frames", () => {
  const corrupted = structuredClone(capture144);
  corrupted.timings[3] = 420; // Flip a signature bit in the first copy.
  const badChecksum = structuredClone(capture112);
  badChecksum.timings[211] = 1250; // Flip the low checksum bit.
  const tclHeader = { ...capture112, timings: [3000, ...capture112.timings.slice(1)] };
  const signals: IrSignal[] = [
    corrupted,
    badChecksum,
    tclHeader,
    { ...capture144, timings: capture144.timings.slice(0, -2) },
    { ...capture112, frequencyHz: 40000 },
    { frequencyHz: 38000, dutyCycle: 50, timings: [9000, 4500, 560] },
  ];
  for (const signal of signals) {
    assert.throws(() => identify(signal));
  }
});

test("reject unsupported temperature steps and malformed commands before transmission", () => {
  const remote = identify(capture112);
  for (const temperature of [15, 32, 26.5, NaN, Infinity]) {
    assert.throws(() => encode(remote, { ...cool, temperature }));
  }
  assert.throws(() => encode(identify(capture144), { ...cool, temperature: 26.25 }));
  assert.throws(() => encode(remote, { ...cool, acMode: "dry" } as unknown as AcMessage));
  for (const fanSpeed of ["auto", "max", "", null, 1, {}, "toString"]) {
    assert.throws(
      () => encode(remote, { ...cool, fanSpeed } as unknown as AcMessage),
      /fan speed/,
    );
  }
  assert.throws(() =>
    encode(remote, { ...cool, windDirectionVertical: "left" } as unknown as AcMessage),
  );
});

test("power-off does not restore a timer that was enabled during learning", () => {
  const remote = identify(capture144);
  remote.state[5] = 0x20;
  remote.state[11] = 72;
  remote.state[12] = 48;
  remote.state[13] = 15;
  remote.state[17] = remote.state.slice(0, 17).reduce((sum, byte) => sum + byte, 0) & 255;
  const off = identify(encode(remote));
  assert.equal(off.state[5]! & 0x20, 0);
  assert.deepEqual(off.state.slice(11, 14), [0, 0, 0]);
});
