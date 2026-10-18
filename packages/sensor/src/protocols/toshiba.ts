// SPDX-License-Identifier: LGPL-2.1-only
// Adapted from IRremoteESP8266 ir_Toshiba.{h,cpp}, commit 1e2f0f3.
// Copyright 2017 David Conran.
import {
  setBits,
  hasInvertedBytePairs,
  rejectFixedWind,
  hasSignature,
  validateTemperature,
} from "./common.js";
import type { Protocol } from "./common.js";

const calculateChecksum = (state: number[]) =>
  state.slice(0, -1).reduce((checksum, byte) => checksum ^ byte, 0);

export const toshiba72: Protocol = {
  sectionLengths: [9],
  header: [4400, 4300],
  mark: 580,
  zero: 490,
  one: 1600,
  gap: 7400,
  copies: 2,
  mostSignificantBitFirst: true,
  tolerance: 0.4,
  isValidState: (state) =>
    hasSignature(state, [0xf2, 0x0d]) &&
    hasInvertedBytePairs(state.slice(0, 4), 0) &&
    (state[2]! & 15) + 6 === state.length &&
    calculateChecksum(state) === state.at(-1),
  applyMessage(state, message) {
    // Normal power/mode commands use 72 bits, including when learned in turbo mode.
    state = state.slice(0, 9);
    setBits(state, 2, 15, 3);
    state[3] = state[2]! ^ 255;
    setBits(state, 4, 0x28, 0);
    let modeCode = 7; // Power off.
    if (message) {
      modeCode = { cool: 1, heat: 3, dehumidify: 2 }[message.acMode];
    }
    setBits(state, 6, 7, modeCode);

    if (message) {
      rejectFixedWind(message);
      validateTemperature(message, 17, 30);
      setBits(state, 5, 0xf0, (message.temperature - 17) << 4);
      if (message.fanSpeed !== undefined) {
        setBits(state, 6, 0xe0, { low: 0x60, medium: 0x80, high: 0xa0 }[message.fanSpeed]);
      }
    }

    state[8] = calculateChecksum(state);
    return state;
  },
};

export const toshiba80: Protocol = { ...toshiba72, sectionLengths: [10] };
