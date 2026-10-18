// SPDX-License-Identifier: LGPL-2.1-only
// Adapted from IRremoteESP8266 ir_Fujitsu.{h,cpp}, commit 1e2f0f3.
// Copyright 2017 Jonny Graham; 2018-2022 David Conran; 2021 siriuslzx.
import { setBits, rejectFixedWind, hasSignature, sumBytes, validateTemperature } from "./common.js";
import type { Protocol } from "./common.js";

const calculateChecksum = (state: number[]) =>
  (state.length === 15 ? 0x9b - sumBytes(state) : -sumBytes(state, 7)) & 255;

export const fujitsu128: Protocol = {
  sectionLengths: [16],
  header: [3324, 1574],
  mark: 448,
  zero: 390,
  one: 1182,
  gap: 8100,
  isValidState: (state) =>
    hasSignature(state, [0x14, 0x63]) &&
    (state[2]! & ~0x30) === 0 &&
    state[3] === 0x10 &&
    state[4] === 0x10 &&
    state[5] === (state.length === 15 ? 0xfc : 0xfe) &&
    state[6] === state.length - 7 &&
    (state[7] === 0x30 || (state.length === 16 && state[7] === 0x31)) &&
    calculateChecksum(state) === state.at(-1),
  applyMessage(state, message) {
    if (!message) {
      // Preserve the remote ID in the header and send the short off command.
      const offCommand = [...state.slice(0, 5), 0x02];
      if (state.length === 16) {
        offCommand.push(0xfd); // Inverse command byte for the 128-bit variant.
      }
      return offCommand;
    }

    rejectFixedWind(message);
    const usesHalfDegrees = state[7] === 0x31;
    validateTemperature(message, 16, 30, usesHalfDegrees ? 0.5 : 1);

    const temperatureBase = usesHalfDegrees ? 8 : 16;
    const temperatureScale = usesHalfDegrees ? 2 : 4;
    const encodedTemperature = (message.temperature - temperatureBase) * temperatureScale;
    state[8] = (encodedTemperature << 2) | 1; // Power-on bit.
    setBits(state, 9, 0x3f, { cool: 1, heat: 4, dehumidify: 2 }[message.acMode]); // Timers/10°C heat off.
    if (message.fanSpeed !== undefined) {
      setBits(state, 10, 7, { low: 3, medium: 2, high: 1 }[message.fanSpeed]);
    }
    state[11] = 0;
    state[12] = 0;
    state[13] = 0;

    state[state.length - 1] = calculateChecksum(state);
    return state;
  },
};

export const fujitsu120: Protocol = { ...fujitsu128, sectionLengths: [15] };
