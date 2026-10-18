// SPDX-License-Identifier: LGPL-2.1-only
// Adapted from IRremoteESP8266 ir_MitsubishiHeavy.{h,cpp}, commit 1e2f0f3.
// Copyright 2019 David Conran.
import {
  setBits,
  horizontalPositions,
  updateInvertedBytePairs,
  hasInvertedBytePairs,
  hasSignature,
  validateTemperature,
  verticalPositions,
} from "./common.js";
import type { Protocol } from "./common.js";

export const mitsubishiHeavy152: Protocol = {
  sectionLengths: [19],
  header: [3140, 1630],
  mark: 370,
  zero: 1220,
  one: 420,
  gap: 100000,
  isValidState: (state) =>
    hasSignature(state, [0xad, 0x51, 0x3c, 0xe5, 0x1a]) && hasInvertedBytePairs(state, 5),
  applyMessage(state, message) {
    setBits(state, 5, 8, message ? 8 : 0);

    if (message) {
      validateTemperature(message, 17, 31);
      setBits(state, 5, 0x27, { cool: 1, heat: 4, dehumidify: 2 }[message.acMode]); // Clean disabled.
      setBits(state, 7, 15, message.temperature - 17);
      if (message.fanSpeed !== undefined) {
        setBits(state, 9, 15, { low: 1, medium: 2, high: 3 }[message.fanSpeed]);
      }
      setBits(state, 15, 0xc0, 0);

      if (message.windDirectionVertical !== undefined) {
        setBits(state, 11, 0xe0, verticalPositions[message.windDirectionVertical] << 5);
      }
      if (message.windDirectionHorizontal !== undefined) {
        setBits(state, 13, 15, horizontalPositions[message.windDirectionHorizontal]);
      }
      if (
        message.windDirectionVertical !== undefined ||
        message.windDirectionHorizontal !== undefined
      ) {
        setBits(state, 11, 0x12, 0); // Disable 3D auto when setting a fixed position.
      }
    }

    updateInvertedBytePairs(state, 5);
    return state;
  },
};
