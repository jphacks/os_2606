import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRaw } from "../src/raw.js";

test("raw recordings retain pulse/space timings and internal gaps, excluding final idle time", () => {
  const recording = "  +8419 -4242 +501 -583 +472 -13140\n+8419 -4242 +501 -19704\n";
  const signal = parseRaw(recording);
  assert.deepEqual(signal, {
    frequencyHz: 38000,
    dutyCycle: 50,
    timings: [8419, 4242, 501, 583, 472, 13140, 8419, 4242, 501],
  });
  assert.deepEqual(parseRaw(recording.trim().replace(/ -19704$/, "")), signal);
});

test("raw recordings reject invalid signs, timings and signals beyond LIRC limits", () => {
  for (const recording of [
    "",
    "-9000 +4500 -560",
    "+9000 +4500 +560",
    "+9000 -4500 560",
    "+9000 -4500 +0",
    "+9000 -4500 +560.5",
    "+9000 -4500 +560 -NaN",
    "+9000 -4500 +560 -2000001",
    "+9000 -4500",
    "+1000000 -1000000 +560",
    `${"+560 -560 ".repeat(512)}+560`,
  ]) {
    assert.throws(() => parseRaw(recording), recording);
  }
});
