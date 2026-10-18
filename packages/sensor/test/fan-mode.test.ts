import assert from "node:assert/strict";
import { test } from "node:test";
import type { AcMessage } from "@os/api";
import { encode, identify, validateRemote } from "../src/protocol.js";
import { encodeWave } from "../src/protocols/common.js";
import { sharp104 } from "../src/protocols/sharp.js";
import type { LearnedRemote } from "../src/types.js";
import { capture112, capture144 } from "./fixtures.js";
import { japaneseCaptures } from "./japanese-fixtures.js";

type FanSpeed = NonNullable<AcMessage["fanSpeed"]>;
const fanSpeeds: FanSpeed[] = ["low", "medium", "high"];

// Native wire fields from IRremoteESP8266 1e2f0f3 ir_*.{h,cpp}.
// Fan values include wire offsets, auto flags and bit reversal where applicable.
const fields: Record<LearnedRemote["protocol"], {
  dry: [byte: number, mask: number, value: number];
  fan: [byte: number, mask: number, low: number, medium: number, high: number];
  dryFanSpeeds: FanSpeed[];
}> = {
  mitsubishi144: { dry: [6, 0x38, 0x10], fan: [9, 0x87, 1, 2, 3], dryFanSpeeds: fanSpeeds },
  mitsubishi112: { dry: [6, 7, 2], fan: [8, 7, 3, 5, 0], dryFanSpeeds: fanSpeeds },
  daikin280: { dry: [21, 0x70, 0x20], fan: [24, 0xf0, 0x30, 0x50, 0x60], dryFanSpeeds: fanSpeeds },
  daikin2: { dry: [25, 0x70, 0x20], fan: [28, 0xf0, 0x30, 0x50, 0x60], dryFanSpeeds: fanSpeeds },
  panasonic216: { dry: [13, 0xf0, 0x20], fan: [16, 0xf0, 0x40, 0x50, 0x60], dryFanSpeeds: fanSpeeds },
  mitsubishiHeavy152: { dry: [5, 7, 2], fan: [9, 15, 1, 2, 3], dryFanSpeeds: fanSpeeds },
  toshiba72: { dry: [6, 7, 2], fan: [6, 0xe0, 0x60, 0x80, 0xa0], dryFanSpeeds: fanSpeeds },
  toshiba80: { dry: [6, 7, 2], fan: [6, 0xe0, 0x60, 0x80, 0xa0], dryFanSpeeds: fanSpeeds },
  fujitsu120: { dry: [9, 7, 2], fan: [10, 7, 3, 2, 1], dryFanSpeeds: fanSpeeds },
  fujitsu128: { dry: [9, 7, 2], fan: [10, 7, 3, 2, 1], dryFanSpeeds: fanSpeeds },
  hitachi224: { dry: [10, 255, 0xa0], fan: [13, 255, 0x40, 0xc0, 0x20], dryFanSpeeds: ["low", "medium"] },
  hitachi424: { dry: [25, 15, 5], fan: [25, 0xf0, 0x20, 0x30, 0x40], dryFanSpeeds: ["low"] },
  sharp104: { dry: [6, 3, 3], fan: [6, 0x70, 0x40, 0x30, 0x50], dryFanSpeeds: [] },
};

for (const signal of [capture112, capture144, ...japaneseCaptures.map((f) => f.signal)]) {
  const remote = identify(signal);
  const { dry: [modeByte, modeMask, dryMode], fan: [fanByte, fanMask, ...speeds], dryFanSpeeds } = fields[remote.protocol];

  test(`${remote.protocol}: dry mode and all fan speeds produce valid wire fields`, () => {
    const original = structuredClone(remote);
    const dry = identify(encode(remote, { acMode: "dehumidify", temperature: 24 }));
    assert.equal(dry.state[modeByte]! & modeMask, dryMode);
    if (remote.protocol === "mitsubishi144") {
      assert.equal(dry.state[8]! & 15, 2); // Secondary mode field.
    }
    if (remote.protocol === "sharp104") {
      assert.equal(dry.state[4], 0); // Dry has no temperature setting.
      assert.equal(dry.state[6]! & 0x70, 0x20); // Auto fan.
    }

    for (const acMode of ["cool", "heat", "dehumidify"] as const) {
      const baseline = identify(encode(remote, { acMode, temperature: 24 }));
      for (const [index, fanSpeed] of fanSpeeds.entries()) {
        const message: AcMessage = { acMode, temperature: 24, fanSpeed };
        if (acMode === "dehumidify" && !dryFanSpeeds.includes(fanSpeed)) {
          assert.throws(() => encode(remote, message), /fan speed/);
          continue;
        }
        // identify() also checks the complete waveform, checksum and repeated frames.
        const updated = identify(encode(remote, message));
        assert.equal(updated.state[fanByte]! & fanMask, speeds[index], `${acMode}/${fanSpeed}`);
        assert.equal(updated.state[fanByte]! & ~fanMask, baseline.state[fanByte]! & ~fanMask);
        if (acMode === "dehumidify") {
          assert.equal(updated.state[modeByte]! & modeMask, dryMode);
        }
        const retained = identify(encode(updated, { acMode: "heat", temperature: 22 }));
        assert.equal(retained.state[fanByte]! & fanMask, speeds[index], `retain ${fanSpeed}`);
      }
    }
    assert.deepEqual(remote, original);
  });

  test(`${remote.protocol}: omitted fan speed retains the learned setting`, () => {
    const updated = identify(encode(remote, { acMode: "cool", temperature: 25 }));
    assert.equal(updated.state[fanByte]! & fanMask, remote.state[fanByte]! & fanMask);
  });
}

const learned = (protocol: LearnedRemote["protocol"]) =>
  identify(japaneseCaptures.find((fixture) => fixture.protocol === protocol)!.signal);

test("Hitachi dry constrains incompatible retained speeds but retains compatible speeds", () => {
  for (const [protocol, expectedFan] of [["hitachi224", 0xc0], ["hitachi424", 0x20]] as const) {
    const high = identify(encode(learned(protocol), { acMode: "cool", temperature: 26, fanSpeed: "high" }));
    const dry = identify(encode(high, { acMode: "dehumidify", temperature: 24 }));
    const [byte, mask] = fields[protocol].fan;
    assert.equal(dry.state[byte]! & mask, expectedFan);
  }
  const dry224 = identify(encode(learned("hitachi224"), { acMode: "dehumidify", temperature: 24 }));
  assert.equal(dry224.state[13], 0x40); // Auto is not available; use low.
  const dry424 = identify(encode(learned("hitachi424"), { acMode: "dehumidify", temperature: 24 }));
  assert.equal(dry424.state[25], 0x55); // Auto is available on 424-bit.
});

test("Hitachi 424 retains learned min/max fan companion bytes and clears them for explicit speeds", () => {
  for (const [fan, byte9, byte29] of [[1, 0x98, 0], [6, 0xa9, 0x30]] as const) {
    const remote = learned("hitachi424");
    remote.state[25] = (fan << 4) | 3;
    remote.state[26] = remote.state[25]! ^ 255;
    remote.state[9] = byte9;
    remote.state[10] = byte9 ^ 255;
    remote.state[29] = byte29;
    remote.state[30] = byte29 ^ 255;
    const retained = identify(encode(remote, { acMode: "heat", temperature: 22 }));
    assert.equal(retained.state[25]! >> 4, fan);
    assert.equal(retained.state[9], byte9);
    assert.equal(retained.state[29], byte29);
    const low = identify(encode(remote, { acMode: "cool", temperature: 26, fanSpeed: "low" }));
    assert.equal(low.state[9], 0x92);
    assert.equal(low.state[29], 0);
  }
});

test("Sharp cooling-only variants use their own fan levels and reject heating", () => {
  // Upstream TestSharpAcClass.Models real A705/A903 messages.
  const states = [
    [0xaa, 0x5a, 0xcf, 0x10, 0xd1, 0x11, 0x22, 0, 8, 0x80, 0, 0xf0, 0xf1],
    [0xaa, 0x5a, 0xcf, 0x10, 0xcc, 0x11, 0x32, 0, 8, 0x80, 0, 0xf4, 0x61],
  ];
  for (const state of states) {
    const remote = identify(encodeWave(sharp104, state));
    for (const [index, fanSpeed] of fanSpeeds.entries()) {
      const updated = identify(encode(remote, { acMode: "cool", temperature: 26, fanSpeed }));
      assert.equal(updated.state[6]! & 0x70, [0x30, 0x50, 0x70][index]);
    }
    assert.throws(() => encode(remote, { acMode: "heat", temperature: 22 }), /heating/);
    const dry = identify(encode(remote, { acMode: "dehumidify", temperature: 24 }));
    assert.equal(dry.state[4], 0);
    assert.equal(dry.state[6]! & 0x73, 0x23);
    assert.throws(() => validateRemote({ ...remote, sharpModel: "a907" }), /Sharp model/);
  }
  assert.throws(() => validateRemote({ ...learned("sharp104"), sharpModel: "unknown" }), /Sharp model/);
});
