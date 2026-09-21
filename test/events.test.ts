import { describe, expect, it } from "vitest";
import { ChatConfigurationError, ChatProtocolError } from "../src/errors.js";
import { mapChatEvent, parseEventStream } from "../src/events.js";

function stream(...chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function byteStream(...chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

describe("mapChatEvent", () => {
  it("maps assistant, terminal, activity, approval, and unknown events", () => {
    expect(mapChatEvent({ type: "text_delta", event_id: 1, turn_id: "turn-1", delta: "Hi" })).toEqual({
      type: "assistantText", eventId: 1, turnId: "turn-1", text: "Hi", final: false,
    });
    expect(mapChatEvent({ type: "done", event_id: 2, turn_id: "turn-1", content: "Hi" })).toMatchObject({ type: "assistantText", final: true });
    expect(mapChatEvent({ type: "assistant_message", event_id: 2, turn_id: "turn-1", full_content: "Final" })).toMatchObject({ text: "Final", final: true });
    expect(mapChatEvent({ type: "turn_started", event_id: 3, turn_id: "turn-1" })).toMatchObject({ type: "turnStarted" });
    expect(mapChatEvent({ type: "task_done", event_id: 4, turn_id: "turn-1" })).toMatchObject({ type: "turnCompleted" });
    expect(mapChatEvent({ type: "turn_failed", event_id: 5, turn_id: "turn-1" })).toMatchObject({ type: "turnFailed", message: "Chat turn failed." });
    expect(mapChatEvent({ type: "stopped", event_id: 6, turn_id: "turn-1", message: "Stopped" })).toMatchObject({ type: "turnCancelled", message: "Stopped" });
    expect(mapChatEvent({ type: "turn_cancelled", event_id: 6, turn_id: "turn-1" })).toEqual({ type: "turnCancelled", eventId: 6, turnId: "turn-1" });
    expect(mapChatEvent({ type: "activity_hidden", event_id: 7, hidden: true })).toMatchObject({ type: "activity", hidden: true });
    expect(mapChatEvent({ type: "tool_started", event_id: 8, output: "Searching" })).toMatchObject({ type: "activity", output: "Searching" });
    expect(mapChatEvent({ type: "task_started", event_id: 8, label: "Task" })).toMatchObject({ type: "activity", label: "Task", hidden: false });
    expect(mapChatEvent({ type: "approval_requested", event_id: 9, approval_id: "approval-1", summary: "Run command" })).toMatchObject({ type: "approvalRequested", approvalId: "approval-1" });
    expect(mapChatEvent({ type: "future_event", event_id: 10, turn_id: "turn-1", secret: "omitted" })).toEqual({ type: "unknown", eventId: 10, turnId: "turn-1", rawType: "future_event" });
    expect(mapChatEvent(null)).toEqual({ type: "unknown", rawType: "unknown" });
  });

  it("accepts only closed, non-executable client actions", () => {
    expect(mapChatEvent({ type: "client_action", event_id: 11, turn_id: "turn-1", target: "bookings", label_key: "chat.cta.bookings", resource_ref: "booking_1" })).toEqual({
      type: "clientAction", eventId: 11, turnId: "turn-1", target: "bookings", labelKey: "chat.cta.bookings", resourceRef: "booking_1",
    });
    expect(mapChatEvent({ type: "client_action", event_id: 11, turn_id: "turn-1", target: "admin_campaigns", label_key: "chat.cta.campaigns" })).toMatchObject({
      type: "clientAction", target: "admin_campaigns", labelKey: "chat.cta.campaigns",
    });
    expect(mapChatEvent({ type: "client_action", event_id: 12, target: "https://example.test", label_key: "chat.cta.bookings" })).toMatchObject({ type: "unknown" });
    expect(mapChatEvent({ type: "client_action", event_id: 13, target: "bookings", label_key: "javascript:alert(1)" })).toMatchObject({ type: "unknown" });
  });

  it("accepts only structurally safe opaque suggested follow-up ids", () => {
    expect(mapChatEvent({ type: "suggested_follow_up", event_id: 14, turn_id: "turn-1", suggestion_id: "customer_service_history" })).toEqual({
      type: "suggestedFollowUp", eventId: 14, turnId: "turn-1", suggestionId: "customer_service_history",
    });
    expect(mapChatEvent({ type: "suggested_follow_up", event_id: 15, suggestion_id: "show me parts" })).toMatchObject({ type: "unknown" });
    expect(mapChatEvent({ type: "suggested_follow_up", event_id: 16, suggestion_id: "javascript:alert" })).toMatchObject({ type: "unknown" });
  });
});

describe("parseEventStream", () => {
  it("parses chunked UTF-8, comments, CRLF, and multi-line data", async () => {
    const source = stream(
      ": keepalive\r\n\r\ndata: {\"type\":\"text_delta\",\r\n",
      "data: \"event_id\":1,\"turn_id\":\"turn-1\",\"delta\":\"hé\"}\r\n\r\n",
    );
    const events = [];
    for await (const event of parseEventStream(source)) events.push(event);
    expect(events).toEqual([{ type: "assistantText", eventId: 1, turnId: "turn-1", text: "hé", final: false }]);
  });

  it("rejects invalid JSON, incomplete events, and oversized data", async () => {
    await expect(async () => {
      for await (const _event of parseEventStream(stream("data: nope\n\n"))) void _event;
    }).rejects.toBeInstanceOf(ChatProtocolError);
    await expect(async () => {
      for await (const _event of parseEventStream(stream("data: {}"))) void _event;
    }).rejects.toThrow("incomplete event");
    await expect(async () => {
      for await (const _event of parseEventStream(stream(`data: ${"x".repeat(2000)}\n\n`), { maxEventBytes: 1024, maxBufferBytes: 2048 })) void _event;
    }).rejects.toThrow("event exceeded");
  });

  it("validates configured stream bounds", async () => {
    await expect(async () => {
      for await (const _event of parseEventStream(stream(""), { maxEventBytes: 10 })) void _event;
    }).rejects.toBeInstanceOf(ChatConfigurationError);
  });

  it("preserves CRLF and UTF-8 characters split across network chunks", async () => {
    const bytes = new TextEncoder().encode('data: {"type":"text_delta","event_id":1,"delta":"hé"}\r\n\r\n');
    const carriageReturn = bytes.indexOf(13);
    const multibyteStart = bytes.indexOf(195);
    const source = byteStream(
      bytes.slice(0, multibyteStart + 1),
      bytes.slice(multibyteStart + 1, carriageReturn + 1),
      bytes.slice(carriageReturn + 1),
    );
    const events = [];
    for await (const event of parseEventStream(source)) events.push(event);
    expect(events).toEqual([{ type: "assistantText", eventId: 1, turnId: "", text: "hé", final: false }]);
  });

  it("accepts one large network chunk containing many individually bounded events", async () => {
    const payload = Array.from({ length: 900 }, (_, index) => `data: {"type":"turn_started","event_id":${String(index)}}\n\n`).join("");
    const events = [];
    for await (const event of parseEventStream(stream(payload), { maxEventBytes: 1024, maxBufferBytes: 2048 })) events.push(event);
    expect(events).toHaveLength(900);
  });
});
