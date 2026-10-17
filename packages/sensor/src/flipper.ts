import { validateInteger, validateSignal } from "./types.js";
import type { IrSignal } from "./types.js";

/** Import one raw button from a Flipper IRDB .ir file. */
export function parseFlipper(text: string, button: string): IrSignal {
  const header = new Map<string, string>();
  const buttonBlocks: Map<string, string>[] = [];
  let currentFields = header;

  for (const line of text.split(/\r?\n/).map((line) => line.trim())) {
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 1) {
      throw new Error("Invalid Flipper IR line.");
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key === "name") {
      currentFields = new Map();
      buttonBlocks.push(currentFields);
    }
    if (currentFields.has(key)) {
      throw new Error(`Duplicate Flipper field: ${key}`);
    }
    currentFields.set(key, value);
  }

  if (header.get("Filetype") !== "IR signals file" || header.get("Version") !== "1") {
    throw new Error("Unsupported Flipper IR file.");
  }

  const matchingButtons = buttonBlocks.filter(
    (buttonFields) => buttonFields.get("name") === button,
  );
  if (matchingButtons.length !== 1) {
    throw new Error(
      `Expected one Flipper button named '${button}', found ${matchingButtons.length}.`,
    );
  }
  const buttonFields = matchingButtons[0]!;
  if (buttonFields.get("type") !== "raw") {
    throw new Error("Only Flipper raw signals are supported.");
  }

  const timings = (buttonFields.get("data") ?? "").split(/\s+/).map((value) => {
    if (!/^\d+$/.test(value)) {
      throw new Error("Invalid Flipper timing.");
    }
    return validateInteger(Number(value), 1, 2_000_000, "timing");
  });
  validateInteger(timings.length, 3, 1024, "timing count");
  // Some files include a final idle space; LIRC writes must end with a pulse.
  if (timings.length % 2 === 0) {
    timings.pop();
  }

  const dutyCycleFraction = Number(buttonFields.get("duty_cycle"));
  if (!Number.isFinite(dutyCycleFraction) || dutyCycleFraction <= 0 || dutyCycleFraction >= 1) {
    throw new Error("Invalid Flipper duty cycle.");
  }
  const signal = {
    frequencyHz: Number(buttonFields.get("frequency")),
    dutyCycle: Math.round(dutyCycleFraction * 100),
    timings,
  };
  validateSignal(signal);
  return signal;
}
