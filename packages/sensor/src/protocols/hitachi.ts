// SPDX-License-Identifier: LGPL-2.1-only
// Adapted from IRremoteESP8266 ir_Hitachi.{h,cpp}, commit 1e2f0f3.
// Copyright 2018-2020 David Conran.
import {
  setBits,
  updateInvertedBytePairs,
  hasInvertedBytePairs,
  rejectFixedWind,
  hasSignature,
  validateTemperature,
} from "./common.js";
import type { Protocol } from "./common.js";

function reverseBits(byte: number): number {
  let result = 0;
  for (let bit = 0; bit < 8; bit++) {
    result = (result << 1) | ((byte >> bit) & 1);
  }
  return result;
}

function calculateChecksum(state: number[]): number {
  const checksum = state.slice(0, -1).reduce((total, byte) => total - reverseBits(byte), 62);
  return reverseBits(checksum & 0xff);
}

export const hitachi224: Protocol = {
  sectionLengths: [28],
  header: [3300, 1700],
  mark: 400,
  zero: 500,
  one: 1250,
  gap: 100000,
  mostSignificantBitFirst: true,
  isValidState: (state) =>
    hasSignature(state, [0x80, 8, 0x0c, 2, 0xfd]) && calculateChecksum(state) === state[27],
  applyMessage(state, message) {
    setBits(state, 17, 1, message ? 1 : 0);

    if (message) {
      rejectFixedWind(message);
      validateTemperature(message, 16, 32);
      state[9] = message.temperature === 16 ? 0x90 : 0x10;
      state[10] = reverseBits({ cool: 4, heat: 3, dehumidify: 5 }[message.acMode]);
      state[11] = reverseBits(message.temperature << 1);
      let fan = reverseBits(state[13]!);
      if (message.fanSpeed !== undefined) {
        fan = { low: 2, medium: 3, high: 4 }[message.fanSpeed];
      }
      if (message.acMode === "dehumidify") {
        if (message.fanSpeed === "high") {
          throw new Error("Hitachi 224-bit dehumidify supports only low or medium fan speed.");
        }
        // Dry mode cannot retain auto/high from a previous cooling/heating command.
        fan = Math.min(3, Math.max(2, fan));
      }
      state[13] = reverseBits(fan);
    }

    state[27] = calculateChecksum(state);
    return state;
  },
};

export const hitachi424: Protocol = {
  sectionLengths: [53],
  prefix: [29784, 49290],
  header: [3416, 1604],
  mark: 463,
  zero: 372,
  one: 1208,
  gap: 100000,
  isValidState: (state) => hasSignature(state, [1, 0x10, 0]) && hasInvertedBytePairs(state, 3),
  applyMessage(state, message) {
    setBits(state, 27, 0x10, message ? 0x10 : 0);
    state[11] = 0x13; // Power/mode command, never the swing-toggle button.

    if (message) {
      rejectFixedWind(message);
      validateTemperature(message, 16, 32);
      setBits(state, 13, 0xfc, message.temperature << 2);
      let fan = state[25]! >> 4;
      if (message.fanSpeed !== undefined) {
        fan = { low: 2, medium: 3, high: 4 }[message.fanSpeed];
      }
      if (message.acMode === "dehumidify") {
        if (message.fanSpeed === "medium" || message.fanSpeed === "high") {
          throw new Error("Hitachi 424-bit dehumidify supports only low fan speed. Omit fanSpeed for auto/retained speed.");
        }
        if (fan !== 5) {
          fan = Math.min(2, Math.max(1, fan)); // Auto (5) or the two lowest speeds.
        }
      }
      state[25] = (fan << 4) | { cool: 3, heat: 6, dehumidify: 5 }[message.acMode];
      state[9] = 0x92;
      state[29] = 0;
      switch (fan) {
        case 1:
          state[9] = 0x98;
          break;
        case 6:
          state[9] = 0xa9;
          state[29] = 0x30;
          break;
      }
    }

    updateInvertedBytePairs(state, 3);
    return state;
  },
};
