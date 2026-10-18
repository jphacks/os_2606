import type { AcMessage } from "@os/api";
import type { IrSignal } from "../types.js";

/** Timing values are microseconds; section lengths count bytes. */
export interface Protocol {
  sectionLengths: number[];
  header: [number, number];
  mark: number;
  zero: number;
  one: number;
  gap: number;
  frequencyHz?: number;
  prefix?: number[];
  footerMark?: number;
  copies?: number;
  mostSignificantBitFirst?: boolean;
  tolerance?: number;
  headerTolerance?: number;
  repeatGap?: number;
  isValidState(state: number[]): boolean;
  /** May mutate state or return a shorter command. An omitted message means power off. */
  applyMessage(state: number[], message?: AcMessage): number[];
}

export const verticalPositions = { up: 1, middle: 3, down: 5 } as const;
export const horizontalPositions = { left: 2, center: 3, right: 4 } as const;

/** By default, exclude the final byte where the checksum is stored. */
export function sumBytes(state: number[], start = 0, end = state.length - 1, initial = 0): number {
  return state.slice(start, end).reduce((total, byte) => total + byte, initial) & 0xff;
}

export function hasSignature(state: number[], signature: number[], offset = 0): boolean {
  return signature.every((byte, index) => state[offset + index] === byte);
}

export function setBits(state: number[], byteIndex: number, mask: number, value: number): void {
  state[byteIndex] = (state[byteIndex]! & ~mask) | (value & mask);
}

export function validateTemperature(message: AcMessage, min: number, max: number, step = 1): void {
  if (
    !Number.isFinite(message.temperature) ||
    message.temperature < min ||
    message.temperature > max ||
    !Number.isInteger(message.temperature / step)
  ) {
    throw new Error(
      `Temperature must be ${min}–${max}°C in ${step}°C steps for this protocol/mode.`,
    );
  }
}

export function rejectFixedWind(message: AcMessage): void {
  if (
    message.windDirectionVertical !== undefined ||
    message.windDirectionHorizontal !== undefined
  ) {
    throw new Error(
      "This protocol does not support fixed wind positions. Omit the wind direction fields.",
    );
  }
}

export function hasInvertedBytePairs(state: number[], start: number): boolean {
  for (let index = start; index + 1 < state.length; index += 2) {
    if ((state[index]! ^ state[index + 1]!) !== 0xff) {
      return false;
    }
  }
  return true;
}

export function updateInvertedBytePairs(state: number[], start: number): void {
  for (let index = start; index + 1 < state.length; index += 2) {
    state[index + 1] = state[index]! ^ 0xff;
  }
}

const matches = (value: number | undefined, expected: number, tolerance: number) =>
  value !== undefined && Math.abs(value - expected) <= expected * tolerance;

/** Decode every section and repeated copy; do not accept a matching prefix alone. */
export function decodeWave(protocol: Protocol, signal: IrSignal): number[] | undefined {
  // Demodulating GPIO receivers assume 38 kHz; some protocols transmit at 36.7 kHz.
  if (!matches(signal.frequencyHz, protocol.frequencyHz ?? 38000, 0.05)) {
    return;
  }

  const prefix = protocol.prefix ?? [];
  // Each byte has 8 pulse/space pairs. Each section adds a header pair, footer and gap.
  const sectionTimingCount = protocol.sectionLengths.reduce(
    (total, bytes) => total + bytes * 8 * 2 + 4,
    0,
  );
  const frameTimingCount = prefix.length + sectionTimingCount - 1; // No trailing gap.
  if ((signal.timings.length + 1) % (frameTimingCount + 1) !== 0) {
    return;
  }

  const tolerance = protocol.tolerance ?? 0.3;
  const timings = signal.timings;
  let offset = 0;
  let firstState: number[] | undefined;

  while (offset < timings.length) {
    for (const duration of prefix) {
      if (!matches(timings[offset++], duration, tolerance)) {
        return;
      }
    }

    const state: number[] = [];
    for (let section = 0; section < protocol.sectionLengths.length; section++) {
      if (
        !matches(timings[offset++], protocol.header[0], protocol.headerTolerance ?? tolerance) ||
        !matches(timings[offset++], protocol.header[1], tolerance)
      ) {
        return;
      }
      for (let byteIndex = 0; byteIndex < protocol.sectionLengths[section]!; byteIndex++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          if (!matches(timings[offset++], protocol.mark, tolerance)) {
            return;
          }
          const space = timings[offset++];
          if (matches(space, protocol.one, tolerance)) {
            byte |= 1 << (protocol.mostSignificantBitFirst ? 7 - bit : bit);
          } else if (!matches(space, protocol.zero, tolerance)) {
            return;
          }
        }
        state.push(byte);
      }
      if (!matches(timings[offset++], protocol.footerMark ?? protocol.mark, tolerance)) {
        return;
      }
      if (
        section < protocol.sectionLengths.length - 1 &&
        !matches(timings[offset++], protocol.gap, tolerance)
      ) {
        return;
      }
    }
    if (!protocol.isValidState(state)) {
      return;
    }
    if (firstState && !firstState.every((byte, index) => state[index] === byte)) {
      return;
    }
    firstState = state;
    if (
      offset < timings.length &&
      !matches(timings[offset++], protocol.repeatGap ?? protocol.gap, tolerance)
    ) {
      return;
    }
  }
  return firstState;
}

export function encodeWave(protocol: Protocol, state: number[]): IrSignal {
  // Fujitsu off and Toshiba normal-mode commands have a shorter, single section.
  const fullStateLength = protocol.sectionLengths.reduce((total, length) => total + length, 0);
  const sectionLengths =
    fullStateLength === state.length ? protocol.sectionLengths : [state.length];
  const timings: number[] = [];

  for (let copy = 0; copy < (protocol.copies ?? 1); copy++) {
    if (copy) {
      timings.push(protocol.repeatGap ?? protocol.gap);
    }
    timings.push(...(protocol.prefix ?? []));
    let offset = 0;
    for (let section = 0; section < sectionLengths.length; section++) {
      if (section) {
        timings.push(protocol.gap);
      }
      timings.push(...protocol.header);
      for (let byteIndex = 0; byteIndex < sectionLengths[section]!; byteIndex++) {
        const byte = state[offset++]!;
        for (let bit = 0; bit < 8; bit++) {
          const bitPosition = protocol.mostSignificantBitFirst ? 7 - bit : bit;
          const space = byte & (1 << bitPosition) ? protocol.one : protocol.zero;
          timings.push(protocol.mark, space);
        }
      }
      timings.push(protocol.footerMark ?? protocol.mark);
    }
  }
  return { frequencyHz: protocol.frequencyHz ?? 38000, dutyCycle: 50, timings };
}
