import type { AcMessage } from "@os/api";
import { validateInteger, validateSignal } from "./types.js";
import type { IrSignal, LearnedRemote } from "./types.js";
import {
  decodeWave,
  encodeWave,
  horizontalPositions,
  verticalPositions,
} from "./protocols/common.js";
import type { Protocol } from "./protocols/common.js";
import { mitsubishi112, mitsubishi144 } from "./protocols/mitsubishi.js";

const protocols: Record<LearnedRemote["protocol"], Protocol> = {
  mitsubishi144,
  mitsubishi112,
};

/** Validate and copy the state so encoding cannot mutate the caller's learned remote. */
export function validateRemote(value: unknown): LearnedRemote {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid learned remote.");
  }
  const remote = value as Record<string, unknown>;
  if (
    remote.version !== 1 ||
    typeof remote.protocol !== "string" ||
    !Object.hasOwn(protocols, remote.protocol)
  ) {
    throw new Error("Unsupported learned remote. Learn a supported remote first.");
  }
  const protocol = remote.protocol as LearnedRemote["protocol"];
  const format = protocols[protocol];
  const expectedLength = format.sectionLengths.reduce((total, length) => total + length, 0);
  if (!Array.isArray(remote.state) || remote.state.length !== expectedLength) {
    throw new Error("Invalid learned state length.");
  }
  const state = remote.state.map((byte: unknown) => validateInteger(byte, 0, 255, "state byte"));
  if (!format.isValidState(state)) {
    throw new Error("Invalid IR signature, checksum or unsupported variant.");
  }
  return { version: 1, protocol, state };
}

/** Identify the wire format and retain variant bytes; no model setting is required. */
export function identify(signal: IrSignal): LearnedRemote {
  validateSignal(signal);
  const candidates: LearnedRemote[] = [];
  for (const protocol of Object.keys(protocols) as LearnedRemote["protocol"][]) {
    const state = decodeWave(protocols[protocol], signal);
    if (state) {
      candidates.push({ version: 1, protocol, state });
    }
  }
  if (candidates.length !== 1) {
    throw new Error(
      "Unsupported or incomplete IR signal. Capture a temperature/mode button with the remote powered on; short/toggle commands cannot identify a complete AC state.",
    );
  }
  return candidates[0]!;
}

/** Undefined message means explicit power-off; no power toggle is used. */
export function encode(value: LearnedRemote, message?: AcMessage): IrSignal {
  const remote = validateRemote(value);
  if (message) {
    const invalidMode = message.acMode !== "cool" && message.acMode !== "heat";
    const invalidVertical =
      message.windDirectionVertical !== undefined &&
      !Object.hasOwn(verticalPositions, message.windDirectionVertical);
    const invalidHorizontal =
      message.windDirectionHorizontal !== undefined &&
      !Object.hasOwn(horizontalPositions, message.windDirectionHorizontal);

    if (invalidMode || invalidVertical || invalidHorizontal) {
      throw new Error("Invalid AC mode or wind direction.");
    }
  }

  const format = protocols[remote.protocol];
  const updatedState = format.applyMessage(remote.state, message);
  const signal = encodeWave(format, updatedState);
  validateSignal(signal);
  return signal;
}
