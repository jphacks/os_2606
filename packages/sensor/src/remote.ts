import type { AcMessage, RemoteControl } from "@os/api";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { receive, transmit } from "./lirc.js";
import { encode, identify, validateRemote } from "./protocol.js";
import type { IrSignal, LearnedRemote } from "./types.js";

const remotePath = (): string => process.env.IR_REMOTE_PATH ?? "data/ir/remote.json";

/** Only replace the previous learned remote after decoding and validation succeed. */
export async function saveSignal(signal: IrSignal): Promise<LearnedRemote> {
  return saveRemote(identify(signal));
}

async function saveRemote(learnedRemote: LearnedRemote, remoteFile = remotePath()): Promise<LearnedRemote> {
  await mkdir(dirname(remoteFile), { recursive: true });
  const temporaryFile = `${remoteFile}.${randomUUID()}.tmp`;

  // Replace atomically so a failed write preserves the last usable settings.
  try {
    await writeFile(temporaryFile, JSON.stringify(learnedRemote, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryFile, remoteFile);
  } finally {
    await rm(temporaryFile, { force: true });
  }
  return learnedRemote;
}

export async function learnRemote(abortSignal?: AbortSignal): Promise<LearnedRemote> {
  const signal = await receive(abortSignal);
  abortSignal?.throwIfAborted();
  return saveSignal(signal);
}

export async function loadRemoteControl(): Promise<RemoteControl> {
  const remoteFile = remotePath();
  const savedData = await readFile(remoteFile, "utf8");
  let learnedRemote = validateRemote(JSON.parse(savedData));
  let sendQueue = Promise.resolve();

  const enqueueSend = async (message?: AcMessage): Promise<void> => {
    // Snapshot caller input, but resolve omitted settings after earlier sends finish.
    const messageSnapshot = message ? { ...message } : undefined;
    const sendTask = sendQueue.then(async () => {
      const signal = encode(learnedRemote, messageSnapshot);
      const nextRemote = messageSnapshot ? identify(signal) : undefined;
      if (nextRemote && learnedRemote.sharpModel !== undefined) {
        nextRemote.sharpModel = learnedRemote.sharpModel;
      }

      await transmit(signal);
      if (nextRemote) {
        learnedRemote = nextRemote;
        try {
          await saveRemote(learnedRemote, remoteFile);
        } catch (cause) {
          throw new Error("IR was sent, but saving the last settings failed.", { cause });
        }
      }
    });

    // Report this send's error to its caller, while allowing the queue to continue.
    sendQueue = sendTask.catch(() => {});
    return sendTask;
  };

  return {
    supports(message) {
      try {
        encode(learnedRemote, message);
        return true;
      } catch {
        return false;
      }
    },
    send: (message) => {
      if (!message || typeof message !== "object") {
        return Promise.reject(new Error("An AC message is required."));
      }
      return enqueueSend(message);
    },
    stop: () => enqueueSend(),
  };
}
