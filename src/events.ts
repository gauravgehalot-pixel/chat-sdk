import { ChatProtocolError } from "./errors.js";
import type { ChatEvent } from "./types.js";

const DEFAULT_MAX_EVENT_BYTES = 256 * 1024;
const DEFAULT_MAX_BUFFER_BYTES = 512 * 1024;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function integer(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export function mapChatEvent(value: unknown): ChatEvent {
  const event = record(value);
  const rawType = text(event.type) || "unknown";
  const eventId = integer(event.event_id) ?? 0;
  const turnId = text(event.turn_id);

  if (["assistant_message", "message_delta", "text_delta", "done"].includes(rawType)) {
    return {
      type: "assistantText",
      eventId,
      turnId,
      text: text(event.content) || text(event.full_content) || text(event.delta) || text(event.text),
      final: rawType === "done" || event.final === true || typeof event.full_content === "string",
    };
  }
  if (rawType === "turn_started" || rawType === "turn.started") {
    return { type: "turnStarted", eventId, turnId };
  }
  if (["turn_completed", "turn.completed", "task_done"].includes(rawType)) {
    return { type: "turnCompleted", eventId, turnId };
  }
  if (["turn_failed", "turn.failed", "error"].includes(rawType)) {
    return { type: "turnFailed", eventId, turnId, message: text(event.message) || "Chat turn failed." };
  }
  if (["turn_cancelled", "turn.cancelled", "stopped"].includes(rawType)) {
    const message = text(event.message);
    return { type: "turnCancelled", eventId, turnId, ...(message ? { message } : {}) };
  }
  if (rawType.includes("approval") && text(event.approval_id)) {
    return {
      type: "approvalRequested",
      eventId,
      turnId,
      approvalId: text(event.approval_id),
      summary: text(event.summary) || text(event.message),
    };
  }
  if (rawType === "activity_hidden" || event.compact === true || rawType.includes("tool") || rawType.includes("task") || rawType.includes("subagent")) {
    const output = text(event.output);
    const label = text(event.label) || text(event.message);
    return {
      type: "activity",
      eventId,
      turnId,
      ...(label ? { label } : {}),
      ...(output ? { output } : {}),
      hidden: event.hidden === true || rawType === "activity_hidden",
    };
  }
  return {
    type: "unknown",
    ...(integer(event.event_id) !== undefined ? { eventId } : {}),
    ...(turnId ? { turnId } : {}),
    rawType,
  };
}

export interface ParseEventStreamOptions {
  maxEventBytes?: number;
  maxBufferBytes?: number;
}

export async function* parseEventStream(
  stream: ReadableStream<Uint8Array>,
  options: ParseEventStreamOptions = {},
): AsyncGenerator<ChatEvent> {
  const maxEventBytes = options.maxEventBytes ?? DEFAULT_MAX_EVENT_BYTES;
  const maxBufferBytes = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;
  if (!Number.isSafeInteger(maxEventBytes) || maxEventBytes < 1024 || !Number.isSafeInteger(maxBufferBytes) || maxBufferBytes < maxEventBytes) {
    throw new ChatConfigurationError("Invalid event stream size limits.");
  }
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamDone = false;
  try {
    while (!streamDone) {
      const { done, value } = await reader.read();
      streamDone = done;
      if (done) {
        buffer += decoder.decode();
      } else if (value.byteLength > 0) {
        buffer += decoder.decode(value, { stream: true });
      }
      const trailingCarriageReturn = !done && buffer.endsWith("\r") ? "\r" : "";
      const parseableBuffer = trailingCarriageReturn ? buffer.slice(0, -1) : buffer;
      const normalized = parseableBuffer.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
      const chunks = normalized.split("\n\n");
      buffer = `${chunks.pop() ?? ""}${trailingCarriageReturn}`;
      if (new TextEncoder().encode(buffer).byteLength > maxBufferBytes) {
        throw new ChatProtocolError("Chat event stream buffer exceeded its configured limit.");
      }
      for (const chunk of chunks) {
        if (new TextEncoder().encode(chunk).byteLength > maxEventBytes) {
          throw new ChatProtocolError("Chat event exceeded its configured size limit.");
        }
        const data = chunk
          .split("\n")
          .filter((line) => line === "data" || line.startsWith("data:"))
          .map((line) => line === "data" ? "" : line.slice(5).replace(/^ /, ""))
          .join("\n");
        if (!data) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch (cause) {
          throw new ChatProtocolError("Chat event contained invalid JSON.", { cause });
        }
        yield mapChatEvent(parsed);
      }
    }
    if (buffer.trim() && !buffer.trimStart().startsWith(":")) {
      throw new ChatProtocolError("Chat event stream ended with an incomplete event.");
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

// Kept local to avoid a circular import through the package entry point.
import { ChatConfigurationError } from "./errors.js";
