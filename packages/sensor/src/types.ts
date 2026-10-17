export interface IrSignal {
  frequencyHz: number;
  dutyCycle: number;
  /** Microseconds; alternating pulse/space, starting and ending with a pulse. */
  timings: number[];
}

export function validateInteger(value: unknown, min: number, max: number, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

export function validateSignal(signal: IrSignal): void {
  validateInteger(signal.frequencyHz, 10_000, 100_000, "frequencyHz");
  validateInteger(signal.dutyCycle, 1, 99, "dutyCycle");
  // Linux LIRC allows at most 1024 entries and requires an odd count.
  validateInteger(signal.timings.length, 3, 1023, "timing count");
  if (signal.timings.length % 2 !== 1) {
    throw new Error("The signal must end with a pulse.");
  }
  const duration = signal.timings.reduce(
    (sum, value) => sum + validateInteger(value, 1, 2_000_000, "timing"),
    0,
  );
  if (duration > 2_000_000) {
    throw new Error("The signal exceeds the 2-second limit.");
  }
}
