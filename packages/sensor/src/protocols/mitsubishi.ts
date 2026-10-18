// SPDX-License-Identifier: LGPL-2.1-only
// Adapted from IRremoteESP8266 ir_Mitsubishi.{h,cpp}, commit 1e2f0f3.
// Copyright 2009 Ken Shirriff; 2017-2021 David Conran; 2019 Mark Kuchel.
import type { AcMessage } from "@os/api";
import {
  setBits,
  horizontalPositions,
  hasSignature,
  sumBytes,
  validateTemperature,
  verticalPositions,
} from "./common.js";
import type { Protocol } from "./common.js";

const isValidState = (state: number[]) =>
  hasSignature(state, [0x23, 0xcb, 0x26, 1, 0]) && sumBytes(state) === state.at(-1);

function applyMessage(state: number[], message?: AcMessage): number[] {
  const is144Bit = state.length === 18;
  const powerMask = is144Bit ? 0x20 : 4;
  setBits(state, 5, powerMask, message ? powerMask : 0);

  if (is144Bit) {
    state[11] = 0;
    state[12] = 0;
    setBits(state, 13, 15, 0); // Disable timers for both on and off.
  }

  if (message) {
    validateTemperature(message, 16, 31, is144Bit ? 0.5 : 1);
    const verticalPosition =
      message.windDirectionVertical && verticalPositions[message.windDirectionVertical];
    const horizontalPosition =
      message.windDirectionHorizontal && horizontalPositions[message.windDirectionHorizontal];
    const modeCode = message.acMode === "cool" ? 3 : 1;

    if (is144Bit) {
      // Low four bits encode degrees above 16°C; bit 4 adds half a degree.
      const wholeDegrees = Math.floor(message.temperature - 16);
      const halfDegreeFlag = message.temperature % 1 ? 0x10 : 0;
      setBits(state, 6, 0x38, modeCode << 3);
      setBits(state, 7, 0x1f, wholeDegrees | halfDegreeFlag);
      setBits(state, 8, 15, message.acMode === "cool" ? 6 : 0);
      if (horizontalPosition !== undefined) {
        setBits(state, 8, 0xf0, horizontalPosition << 4);
      }
      setBits(state, 9, 0xc7, 0xc0); // Auto fan; keep unspecified vane positions.
      if (verticalPosition !== undefined) {
        setBits(state, 9, 0x38, verticalPosition << 3);
        setBits(state, 16, 0x38, verticalPosition << 3);
      }
      setBits(state, 14, 0x20, 0);
      setBits(state, 15, 0x20, 0);
      if (verticalPosition !== undefined || horizontalPosition !== undefined) {
        setBits(state, 6, 0x40, 0);
        setBits(state, 15, 7, 0);
        setBits(state, 16, 2, 0);
      }
    } else {
      setBits(state, 6, 7, modeCode);
      setBits(state, 7, 15, 31 - message.temperature);
      if (verticalPosition !== undefined) {
        setBits(state, 8, 0x38, verticalPosition << 3);
      }
      if (horizontalPosition !== undefined) {
        setBits(state, 12, 0x3c, horizontalPosition << 2);
      }
    }
  }

  state[state.length - 1] = sumBytes(state);
  return state;
}

export const mitsubishi144: Protocol = {
  sectionLengths: [18],
  header: [3400, 1750],
  mark: 450,
  zero: 420,
  one: 1300,
  footerMark: 440,
  gap: 15500,
  copies: 2,
  isValidState,
  applyMessage,
};

export const mitsubishi112: Protocol = {
  sectionLengths: [14],
  header: [3450, 1696],
  headerTolerance: 0.05,
  mark: 450,
  zero: 385,
  one: 1250,
  gap: 100000,
  isValidState,
  applyMessage,
};
