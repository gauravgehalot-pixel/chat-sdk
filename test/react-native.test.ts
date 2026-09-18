import { describe, expect, it, vi } from "vitest";
import { OpsRabbitNativeChat } from "../src/react-native.js";

async function collect<T>(events: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const event of events) result.push(event);
  return result;
}

describe("OpsRabbitNativeChat", () => {
  it("requires an injected streaming Fetch implementation", () => {
    expect(() => new OpsRabbitNativeChat({
      baseUrl: "https://opsrabbit.example.test/api", widgetId: "widget-1", tenantId: "tenant-1", agentName: "support", getAccessToken: () => "native-token",
    } as unknown as ConstructorParameters<typeof OpsRabbitNativeChat>[0])).toThrow("requires a streaming Fetch API implementation");
  });

  it("uses the headless transport without requiring an app-held native client identifier", async () => {
    const getAccessToken = vi.fn(() => "native-token");
    const fetch: typeof globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({ thread_id: "thread-1", turn_id: "turn-1", last_event_id: 0 }), { status: 200 }));
    const chat = new OpsRabbitNativeChat({
      baseUrl: "https://opsrabbit.example.test/api", widgetId: "widget-1", tenantId: "tenant-1", agentName: "support", getAccessToken, fetch,
    });

    await chat.turns.send({ conversationId: "conversation-1", message: "Help" });

    expect(getAccessToken).toHaveBeenCalledWith({
      reason: "send_message",
      agentName: "support",
      widgetId: "widget-1",
      tenantId: "tenant-1",
    });
  });

  it("uses the caller-provided streaming fetch for native event streams", async () => {
    const getAccessToken = vi.fn(() => "native-token");
    const encoder = new TextEncoder();
    const streamingFetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"message_delta","event_id":1,"turn_id":"turn-1","delta":"Hello"}\n\ndata: {"type":"turn_completed","event_id":2,"turn_id":"turn-1"}\n\n'));
        controller.close();
      },
    }), { status: 200 })));
    const chat = new OpsRabbitNativeChat({
      baseUrl: "https://opsrabbit.example.test/api", widgetId: "widget-1", tenantId: "tenant-1", agentName: "support", getAccessToken, fetch: streamingFetch,
    });

    await expect(collect(chat.turns.events({ threadId: "thread-1", turnId: "turn-1" })))
      .resolves.toEqual([
        expect.objectContaining({ type: "assistantText", text: "Hello" }),
        expect.objectContaining({ type: "turnCompleted" }),
      ]);
    expect(getAccessToken).toHaveBeenCalledWith(expect.objectContaining({ reason: "stream_events" }));
    expect(streamingFetch.mock.calls[0]?.[0]).toContain("/widget/chat/threads/thread-1/events/stream?");
  });

  it("surfaces malformed native streams as safe protocol errors", async () => {
    const encoder = new TextEncoder();
    const chat = new OpsRabbitNativeChat({
      baseUrl: "https://opsrabbit.example.test/api", widgetId: "widget-1", tenantId: "tenant-1", agentName: "support", getAccessToken: () => "native-token",
      fetch: () => Promise.resolve(new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode("data: not-json\n\n"));
          controller.close();
        },
      }), { status: 200 })),
    });

    await expect(collect(chat.turns.events({ threadId: "thread-1" }))).rejects.toThrow("Chat event contained invalid JSON.");
  });
});
