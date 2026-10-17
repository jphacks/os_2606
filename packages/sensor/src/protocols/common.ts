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
  footerMark?: number;
  copies?: number;
  headerTolerance?: number;
  isValidState(state: number[]): boolean;
  /** May mutate state. An omitted message means power off. */
  applyMessage(state: number[], message?: AcMessage): number[];
}

export const verticalPositions = { up: 1, middle: 3, down: 5 } as const;
export const horizontalPositions = { left: 2, center: 3, right: 4 } as const;

/** Exclude the final byte where the checksum is stored. */
export function sumBytes(state: number[]): number {
  return state.slice(0, -1).reduce((total, byte) => total + byte, 0) & 0xff;
}

export function hasSignature(state: number[], signature: number[]): boolean {
  return signature.every((byte, index) => state[index] === byte);
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

const matches = (value: number | undefined, expected: number, tolerance: number) =>
  value !== undefined && Math.abs(value - expected) <= expected * tolerance;

/** Decode every section and repeated copy; do not accept a matching prefix alone. */
export function decodeWave(protocol: Protocol, signal: IrSignal): number[] | undefined {
  if (!matches(signal.frequencyHz, 38000, 0.05)) {
    return;
  }

  // Each byte has 8 pulse/space pairs. Each section adds a header pair, footer and gap.
  const sectionTimingCount = protocol.sectionLengths.reduce(
    (total, bytes) => total + bytes * 8 * 2 + 4,
    0,
  );
  const frameTimingCount = sectionTimingCount - 1; // No trailing gap.
  if ((signal.timings.length + 1) % (frameTimingCount + 1) !== 0) {
    return;
  }

  const tolerance = 0.3;
  const timings = signal.timings;
  let offset = 0;
  let firstState: number[] | undefined;

  while (offset < timings.length) {
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
            byte |= 1 << bit;
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
    if (offset < timings.length && !matches(timings[offset++], protocol.gap, tolerance)) {
      return;
    }
  }
  return firstState;
}

export function encodeWave(protocol: Protocol, state: number[]): IrSignal {
  const sectionLengths = protocol.sectionLengths;
  const timings: number[] = [];

  for (let copy = 0; copy < (protocol.copies ?? 1); copy++) {
    if (copy) {
      timings.push(protocol.gap);
    }
    let offset = 0;
    for (let section = 0; section < sectionLengths.length; section++) {
      if (section) {
        timings.push(protocol.gap);
      }
      timings.push(...protocol.header);
      for (let byteIndex = 0; byteIndex < sectionLengths[section]!; byteIndex++) {
        const byte = state[offset++]!;
        for (let bit = 0; bit < 8; bit++) {
          const space = byte & (1 << bit) ? protocol.one : protocol.zero;
          timings.push(protocol.mark, space);
        }
      }
      timings.push(protocol.footerMark ?? protocol.mark);
    }
  }
  return { frequencyHz: 38000, dutyCycle: 50, timings };
}
