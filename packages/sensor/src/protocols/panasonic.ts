// SPDX-License-Identifier: LGPL-2.1-only
// Adapted from IRremoteESP8266 ir_Panasonic.{h,cpp}, commit 1e2f0f3.
// Copyright 2015 Kristian Lauszus; 2017, 2018 David Conran.
import {
  setBits,
  hasSignature,
  sumBytes,
  validateTemperature,
  verticalPositions,
} from "./common.js";
import type { Protocol } from "./common.js";

function detectVariant(state: number[]): string {
  if (state[23] === 0x89) {
    return "rkr";
  }
  if (state[17] === 0) {
    if ((state[21]! & 0x10) !== 0 && (state[23]! & 1) !== 0) {
      return "ckp";
    }
    if (state[23]! & 0x80) {
      return "jke";
    }
  }
  if (state[17] === 6 && (state[13]! & 15) === 2) {
    return "lke";
  }
  if (state[23] === 1) {
    return "dke";
  }
  if (state[17] === 6) {
    return "nke";
  }
  return "unknown";
}

export const panasonic216: Protocol = {
  sectionLengths: [8, 19],
  header: [3456, 1728],
  mark: 432,
  zero: 432,
  one: 1296,
  gap: 10000,
  repeatGap: 100000,
  frequencyHz: 36700,
  tolerance: 0.4,
  // CKP power is a toggle. Never infer absolute on/off for that variant.
  isValidState: (state) =>
    hasSignature(state, [2, 0x20, 0xe0, 4, 0]) &&
    hasSignature(state, [2, 0x20, 0xe0, 4, 0], 8) &&
    sumBytes(state, 0, 26, 0xf4) === state[26] &&
    !["ckp", "unknown"].includes(detectVariant(state)),
  applyMessage(state, message) {
    const variant = detectVariant(state);
    setBits(state, 13, 7, message ? 1 : 0); // Absolute power; timers disabled.

    if (message) {
      validateTemperature(message, 16, 30);
      setBits(state, 13, 0xf0, (message.acMode === "cool" ? 3 : 4) << 4);
      setBits(state, 14, 0x3e, message.temperature << 1);
      setBits(state, 16, 0xf0, 0xa0);
      setBits(state, 21, 0x21, 0); // Quiet and powerful (swapped on RKR).

      if (message.windDirectionVertical !== undefined) {
        setBits(state, 16, 15, verticalPositions[message.windDirectionVertical]);
      }
      if (message.windDirectionHorizontal !== undefined) {
        if (
          variant === "jke" ||
          (["nke", "lke"].includes(variant) && message.windDirectionHorizontal !== "center")
        ) {
          throw new Error(
            `Panasonic ${variant.toUpperCase()} cannot set this horizontal position. Omit windDirectionHorizontal.`,
          );
        }
        setBits(state, 17, 15, { left: 10, center: 6, right: 11 }[message.windDirectionHorizontal]);
      }
    }

    state[26] = sumBytes(state, 0, 26, 0xf4);
    return state;
  },
};
