// SPDX-License-Identifier: LGPL-2.1-only
// Adapted from IRremoteESP8266 ir_Sharp.{h,cpp}, commit 1e2f0f3.
// Copyright 2009 Ken Shirriff; 2017, 2019 David Conran.
import { setBits, rejectFixedWind, hasSignature, validateTemperature } from "./common.js";
import type { Protocol } from "./common.js";

function calculateChecksum(state: number[]): number {
  const xor = state.slice(0, 12).reduce((checksum, byte) => checksum ^ byte, state[12]! & 15);
  return (xor ^ (xor >> 4)) & 15;
}

export const sharp104: Protocol = {
  sectionLengths: [13],
  header: [3800, 1900],
  mark: 470,
  zero: 500,
  one: 1400,
  gap: 100000,
  isValidState(state) {
    const storedChecksum = state[12]! >> 4;
    return (
      hasSignature(state, [0xaa, 0x5a, 0xcf, 0x10]) && calculateChecksum(state) === storedChecksum
    );
  },
  applyMessage(state, message) {
    setBits(state, 5, 0xf0, message ? 0x10 : 0x20); // Absolute on-from-off / off.
    setBits(state, 6, 8, 0); // Clean mode conflicts with power commands.
    state[7] = 0;
    state[10] = 0; // Cancel timers; ordinary power command.
    setBits(state, 8, 7, 0); // Ignore vane: do not replay a learned swing toggle.

    if (message) {
      rejectFixedWind(message); // Dedicated vane commands are outside this minimal API backend.
      validateTemperature(message, 15, 30);
      const isCoolingOnly = Boolean(state[11]! & 0x10);
      if (isCoolingOnly && message.acMode === "heat") {
        throw new Error("This Sharp A705/A903 variant does not support heating.");
      }
      const isA705 = isCoolingOnly && Boolean(state[4]! & 0x10);
      state[4] = (isA705 ? 0xd0 : 0xc0) | (message.temperature - 15);
      setBits(state, 6, 0x73, 0x20 | (message.acMode === "cool" ? 2 : 1));
    }

    setBits(state, 12, 0xf0, calculateChecksum(state) << 4);
    return state;
  },
};
