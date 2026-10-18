// SPDX-License-Identifier: LGPL-2.1-only
// Adapted from IRremoteESP8266 ir_Daikin.{h,cpp}, commit 1e2f0f3.
// Copyright 2016 sillyfrog; 2017 sillyfrog, crankyoldgit; 2018-2022 crankyoldgit.
import { setBits, rejectFixedWind, hasSignature, sumBytes, validateTemperature } from "./common.js";
import type { Protocol } from "./common.js";

export const daikin280: Protocol = {
  sectionLengths: [8, 8, 19],
  header: [3650, 1623],
  mark: 428,
  zero: 428,
  one: 1280,
  gap: 29428,
  tolerance: 0.35,
  prefix: [...Array<number>(10).fill(428), 428, 29428],
  isValidState: (state) =>
    [0, 8, 16].every((offset) => hasSignature(state, [0x11, 0xda, 0x27], offset)) &&
    state[7] === sumBytes(state, 0, 7) &&
    state[15] === sumBytes(state, 8, 15) &&
    state[34] === sumBytes(state, 16, 34),
  applyMessage(state, message) {
    setBits(state, 21, 7, message ? 1 : 0);
    state[26] = 0;
    state[27] = 6;
    state[28] = 0x60; // Disabled timer times (0x600 each).
    setBits(state, 32, 0x80, 0x80); // WeeklyTimer is inverted.

    if (message) {
      rejectFixedWind(message);
      validateTemperature(message, 10, 32);
      setBits(state, 21, 0x70, { cool: 0x30, heat: 0x40, dehumidify: 0x20 }[message.acMode]);
      state[22] = message.temperature * 2;
      if (message.fanSpeed !== undefined) {
        setBits(state, 24, 0xf0, { low: 0x30, medium: 0x50, high: 0x60 }[message.fanSpeed]);
      }
      setBits(state, 29, 0x21, 0);
      setBits(state, 32, 4, 0);
    }

    state[7] = sumBytes(state, 0, 7);
    state[15] = sumBytes(state, 8, 15);
    state[34] = sumBytes(state, 16, 34);
    return state;
  },
};

export const daikin2: Protocol = {
  sectionLengths: [20, 19],
  prefix: [10024, 25180],
  header: [3500, 1728],
  mark: 460,
  zero: 420,
  one: 1270,
  gap: 35204,
  frequencyHz: 36700,
  isValidState: (state) =>
    hasSignature(state, [0x11, 0xda, 0x27]) &&
    hasSignature(state, [0x11, 0xda, 0x27], 20) &&
    state[19] === sumBytes(state, 0, 19) &&
    state[38] === sumBytes(state, 20, 38),
  applyMessage(state, message) {
    setBits(state, 25, 7, message ? 1 : 0);
    setBits(state, 6, 0x80, message ? 0 : 0x80); // Complementary power bit.
    setBits(state, 36, 0x20, 0);
    state[30] = 0;
    state[31] = 6;
    state[32] = 0x60;

    if (message) {
      validateTemperature(message, message.acMode === "cool" ? 18 : 10, 32);
      setBits(state, 25, 0x70, { cool: 0x30, heat: 0x40, dehumidify: 0x20 }[message.acMode]);
      setBits(state, 26, 0xfe, message.temperature << 1); // Humidification overrides temperature.
      state[27] = 0;
      if (message.fanSpeed !== undefined) {
        setBits(state, 28, 0xf0, { low: 0x30, medium: 0x50, high: 0x60 }[message.fanSpeed]);
      }
      setBits(state, 33, 0x21, 0);
      setBits(state, 36, 4, 0);

      if (message.windDirectionVertical !== undefined) {
        setBits(state, 18, 15, { up: 1, middle: 3, down: 6 }[message.windDirectionVertical]);
      }
      if (message.windDirectionHorizontal !== undefined) {
        state[17] = { left: 0xa9, center: 0xaa, right: 0xab }[message.windDirectionHorizontal];
      }
      if (
        message.windDirectionVertical !== undefined ||
        message.windDirectionHorizontal !== undefined
      ) {
        setBits(state, 13, 0x80, 0);
      }
    }

    state[19] = sumBytes(state, 0, 19);
    state[38] = sumBytes(state, 20, 38);
    return state;
  },
};
