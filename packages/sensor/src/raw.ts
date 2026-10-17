import { validateInteger, validateSignal, type IrSignal } from "./types.js";

/** Signed microsecond timings: +pulse -space +pulse ... */
export function parseRaw(text: string): IrSignal {
  const timings = text
    .trim()
    .split(/\s+/)
    .map((value, index) => {
      const expectedSign = index % 2 === 0 ? "+" : "-";
      if (!/^[+-]\d+$/.test(value) || !value.startsWith(expectedSign)) {
        throw new Error(`Expected ${expectedSign} followed by microseconds at value ${index + 1}.`);
      }
      return validateInteger(Number(value.slice(1)), 1, 2_000_000, "timing");
    });

  // LIRC requires the final entry to be a pulse; trailing idle time is not transmitted.
  if (timings.length % 2 === 0) {
    timings.pop();
  }

  // These recordings contain the envelope only, so use a 38 kHz carrier.
  const signal = { frequencyHz: 38_000, dutyCycle: 50, timings };
  validateSignal(signal);
  return signal;
}
