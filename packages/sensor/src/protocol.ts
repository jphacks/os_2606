import type { AcMessage } from "@os/api";
import { validateInteger, validateSignal } from "./types.js";
import type { IrSignal, LearnedRemote } from "./types.js";
import {
  decodeWave,
  encodeWave,
  horizontalPositions,
  setBits,
  verticalPositions,
} from "./protocols/common.js";
import type { Protocol } from "./protocols/common.js";
import { mitsubishi112, mitsubishi144 } from "./protocols/mitsubishi.js";
import { daikin280, daikin2 } from "./protocols/daikin.js";
import { panasonic216 } from "./protocols/panasonic.js";
import { mitsubishiHeavy152 } from "./protocols/mitsubishi-heavy.js";
import { toshiba72, toshiba80 } from "./protocols/toshiba.js";
import { fujitsu120, fujitsu128 } from "./protocols/fujitsu.js";
import { hitachi224, hitachi424 } from "./protocols/hitachi.js";
import { sharp104 } from "./protocols/sharp.js";

const protocols: Record<LearnedRemote["protocol"], Protocol> = {
  mitsubishi144,
  mitsubishi112,
  daikin280,
  daikin2,
  panasonic216,
  mitsubishiHeavy152,
  toshiba72,
  toshiba80,
  fujitsu120,
  fujitsu128,
  hitachi224,
  hitachi424,
  sharp104,
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
  const result: LearnedRemote = { version: 1, protocol, state };
  if (protocol === "sharp104") {
    let detectedModel: NonNullable<LearnedRemote["sharpModel"]> = "a907";
    if (state[11]! & 0x10) {
      detectedModel = "a903";
      if (state[4]! & 0x10) {
        detectedModel = "a705";
      }
    }
    const model = remote.sharpModel ?? detectedModel;
    if (
      (model !== "a705" && model !== "a903" && model !== "a907") ||
      (model === "a907") !== (detectedModel === "a907") ||
      (state[4] !== 0 && model !== detectedModel)
    ) {
      throw new Error("Invalid learned Sharp model.");
    }
    result.sharpModel = model;
  }
  return result;
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
  return validateRemote(candidates[0]!);
}

/** Undefined message means explicit power-off; no power toggle is used. */
export function encode(value: LearnedRemote, message?: AcMessage): IrSignal {
  const remote = validateRemote(value);
  if (message) {
    const invalidMode = !["cool", "heat", "dehumidify"].includes(message.acMode);
    const invalidFanSpeed =
      message.fanSpeed !== undefined && !["low", "medium", "high"].includes(message.fanSpeed);
    const invalidVertical =
      message.windDirectionVertical !== undefined &&
      !Object.hasOwn(verticalPositions, message.windDirectionVertical);
    const invalidHorizontal =
      message.windDirectionHorizontal !== undefined &&
      !Object.hasOwn(horizontalPositions, message.windDirectionHorizontal);

    if (invalidMode || invalidFanSpeed || invalidVertical || invalidHorizontal) {
      throw new Error("Invalid AC mode, fan speed or wind direction.");
    }
  }

  const format = protocols[remote.protocol];
  if (message && message.acMode !== "dehumidify" && remote.sharpModel === "a705") {
    // Restore the variant before encoding a new temperature after dry mode.
    setBits(remote.state, 4, 0x10, 0x10);
  }
  const updatedState = format.applyMessage(remote.state, message);
  const signal = encodeWave(format, updatedState);
  validateSignal(signal);
  return signal;
}
