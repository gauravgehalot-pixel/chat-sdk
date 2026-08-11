import { describe, expect, it, vi } from "vitest";
import {
  ChatAuthenticationError,
  ChatAuthorizationError,
  ChatConfigurationError,
  ChatExpiredError,
  ChatConflictError,
  ChatNotFoundError,
  ChatProtocolError,
  ChatRateLimitError,
  ChatServerError,
  OpsRabbitChat,
} from "../src/index.js";

function json(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(value), {
    ...init,
    status: init.status ?? 200,
    headers,
  });
}

function firstFetchCall(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  const call = fetchMock.mock.calls.at(0);
  if (!call) throw new Error("Expected fetch to be called.");
  return call;
}

function requestUrl(value: string | URL | Request) {
  if (typeof value === "string") return value;
  return value instanceof URL ? value.toString() : value.url;
}

function client(fetchImplementation: typeof fetch, getAccessToken = vi.fn(() => "token-1")) {
  return new OpsRabbitChat({
    baseUrl: "https://opsrabbit.example/api",
    widgetId: "widget-1",
    tenantId: "tenant-a",
    agentName: "support-agent",
    getAccessToken,
    fetch: fetchImplementation,
  });
}

describe("OpsRabbitChat configuration", () => {
  it("rejects unsafe and incomplete client configuration", () => {
    const base = { widgetId: "w", tenantId: "t", agentName: "a", getAccessToken: () => "token" };
    expect(() => new OpsRabbitChat({ ...base, baseUrl: "relative" })).toThrow(ChatConfigurationError);
    expect(() => new OpsRabbitChat({ ...base, baseUrl: "http://example.com" })).toThrow("HTTPS");
    expect(() => new OpsRabbitChat({ ...base, baseUrl: "https://user:password@example.com/api" })).toThrow("URL credentials");
    expect(() => new OpsRabbitChat({ ...base, baseUrl: "http://localhost:8384/api", widgetId: " " })).toThrow("widgetId");
    expect(() => new OpsRabbitChat({ ...base, baseUrl: "https://example.com", getAccessToken: null as never })).toThrow("getAccessToken");
  });

  it("loads the effective, versioned server configuration", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({
      chat_api_version: "1",
      widget: { id: "widget-1", tenant_id: "tenant-a", agent_name: "support-agent", thread_retention_minutes: 30, settings: { showActivity: "hidden" } },
      external_user_id: "customer-user-1",
      external_display_name: "Customer User",
    }));
    const getToken = vi.fn(() => "token-1");
    const configuration = await client(fetchMock, getToken).getConfiguration();
    expect(configuration).toMatchObject({ apiVersion: "1", externalUserId: "customer-user-1", threadRetentionMinutes: 30 });
    expect(getToken).toHaveBeenCalledWith({ reason: "configuration", agentName: "support-agent", widgetId: "widget-1", tenantId: "tenant-a" });
    const [, request] = firstFetchCall(fetchMock);
    expect(new Headers(request?.headers).get("authorization")).toBe("Bearer token-1");
    expect(new Headers(request?.headers).get("x-opsrabbit-chat-sdk-version")).toBe("0.1.0");
  });

  it("uses safe defaults for optional configuration attribution", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({
      widget: { id: "widget-1", tenant_id: "tenant-a", agent_name: "support-agent", settings: {} },
      external_user_id: "customer-user-1",
    }));
    await expect(client(fetchMock).getConfiguration()).resolves.toMatchObject({
      apiVersion: "1", externalDisplayName: null, threadRetentionMinutes: 0,
    });
  });
});

describe("conversation operations", () => {
  it("lists caller-scoped conversations with cursor mapping", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({
      conversations: [{
        id: "thread-1", conversation_id: "conversation-1", title: "Support", status: "open",
        created_at: "2026-08-11T00:00:00.000Z", updated_at: "2026-08-11T00:01:00.000Z", message_count: 2,
        active_turns: [{ turn_id: "turn-1", status: "running" }],
      }],
      next_cursor: "cursor-2",
    }));
    const result = await client(fetchMock).conversations.list({ limit: 10, cursor: "cursor-1" });
    expect(result.conversations[0]).toMatchObject({ id: "thread-1", conversationId: "conversation-1", messageCount: 2 });
    expect(result.nextCursor).toBe("cursor-2");
    expect(requestUrl(firstFetchCall(fetchMock)[0])).toContain("limit=10");
    expect(requestUrl(firstFetchCall(fetchMock)[0])).toContain("cursor=cursor-1");
  });

  it("creates a local handle and sends a new turn without retaining the token", async () => {
    const getToken = vi.fn().mockReturnValueOnce("token-1").mockReturnValueOnce("token-2");
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ thread_id: "thread-1", turn_id: "turn-1", user_message_id: "message-1", last_event_id: 12 }))
      .mockResolvedValueOnce(json({ thread_id: "thread-1", turn_id: "turn-2", last_event_id: 18 }));
    const chat = client(fetchMock, getToken);
    const conversation = chat.conversations.create({ conversationId: "conversation-1", context: { accountId: "acct-1", plan: "enterprise" } });
    await conversation.send({ message: "Hello" });
    await chat.turns.send({ conversationId: "conversation-1", threadId: "thread-1", message: "Again" });
    expect(getToken).toHaveBeenNthCalledWith(1, { reason: "send_message", agentName: "support-agent", widgetId: "widget-1", tenantId: "tenant-a" });
    expect(getToken).toHaveBeenNthCalledWith(2, { reason: "send_message", agentName: "support-agent", widgetId: "widget-1", tenantId: "tenant-a" });
    expect(new Headers(firstFetchCall(fetchMock)[1]?.headers).get("authorization")).toBe("Bearer token-1");
    const firstBody = firstFetchCall(fetchMock)[1]?.body;
    if (typeof firstBody !== "string") throw new Error("Expected a JSON request body.");
    expect(JSON.parse(firstBody)).toMatchObject({
      context: { accountId: "acct-1", plan: "enterprise" },
    });
    const secondCall = fetchMock.mock.calls.at(1);
    if (!secondCall) throw new Error("Expected fetch to be called twice.");
    expect(new Headers(secondCall[1]?.headers).get("authorization")).toBe("Bearer token-2");
  });

  it("requires an explicit conversation id when secure UUID generation is unavailable", () => {
    vi.stubGlobal("crypto", undefined);
    try {
      const chat = client(vi.fn<typeof fetch>());
      expect(() => chat.conversations.create()).toThrow(ChatConfigurationError);
      expect(chat.conversations.create({ conversationId: "supplied-id" }).conversationId).toBe("supplied-id");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("snapshots JSON context before token acquisition and sends it only on the first handle send", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ thread_id: "thread-1", turn_id: "turn-1", last_event_id: 1 }))
      .mockResolvedValueOnce(json({ thread_id: "thread-1", turn_id: "turn-2", last_event_id: 2 }));
    const original = { nested: { value: "original" } };
    const conversation = client(fetchMock).conversations.create({ conversationId: "context-1", context: original });
    original.nested.value = "mutated";
    await conversation.send({ message: "First" });
    await conversation.send({ message: "Second", threadId: "thread-1" });
    const firstBody = fetchMock.mock.calls[0]?.[1]?.body;
    const secondBody = fetchMock.mock.calls[1]?.[1]?.body;
    if (typeof firstBody !== "string" || typeof secondBody !== "string") throw new Error("Expected JSON bodies.");
    expect(JSON.parse(firstBody)).toMatchObject({ context: { nested: { value: "original" } } });
    expect(JSON.parse(secondBody)).not.toHaveProperty("context");
  });

  it("rejects lossy, cyclic, deep, and oversized context before requesting a token", () => {
    const getToken = vi.fn(() => "token");
    const chat = client(vi.fn<typeof fetch>(), getToken);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => chat.conversations.create({ context: cyclic as never })).toThrow(ChatConfigurationError);
    expect(() => chat.conversations.create({ context: { invalid: BigInt(1) } as never })).toThrow(ChatConfigurationError);
    expect(() => chat.conversations.create({ context: { value: "x".repeat(17_000) } })).toThrow(ChatConfigurationError);
    let deep: Record<string, unknown> = {};
    for (let index = 0; index < 9; index += 1) deep = { child: deep };
    expect(() => chat.conversations.create({ context: deep as never })).toThrow(ChatConfigurationError);
    expect(getToken).not.toHaveBeenCalled();
  });

  it("retains initial context after token failure and rejects attaching it to a continuation", async () => {
    const getToken = vi.fn().mockRejectedValueOnce(new Error("token unavailable")).mockResolvedValueOnce("token");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ thread_id: "thread-1", turn_id: "turn-1", last_event_id: 1 }));
    const conversation = client(fetchMock, getToken).conversations.create({ conversationId: "retry-context", context: { accountId: "acct-1" } });
    await expect(conversation.send({ message: "First" })).rejects.toThrow("token unavailable");
    expect(() => conversation.send({ message: "Invalid", threadId: "existing" })).toThrow(ChatConfigurationError);
    await conversation.send({ message: "Retry" });
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    if (typeof body !== "string") throw new Error("Expected JSON body.");
    expect(JSON.parse(body)).toMatchObject({ context: { accountId: "acct-1" } });
  });

  it("hydrates scrubbed messages, citations, events, and active turns", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({
      id: "thread-1", conversation_id: "conversation-1", title: "Support", status: "open",
      created_at: "2026-08-11T00:00:00.000Z", updated_at: "2026-08-11T00:01:00.000Z",
      active_turns: [{ turn_id: "turn-1", status: "queued" }], messages_truncated: false,
      messages: [{ id: "message-1", turn_id: "turn-1", role: "assistant", content: "See [K1]", created_at: "2026-08-11T00:01:00.000Z", knowledge_citations: [{ evidence_id: "K1", source_id: "s", document_id: "d", document_title: "Guide", source_name: "Knowledge", page: 2, url: null, has_stored_content: true }] }],
      events: [{ type: "turn_started", event_id: 2, turn_id: "turn-1" }],
    }));
    const result = await client(fetchMock).conversations.get("thread-1");
    expect(result.messages[0]?.knowledgeCitations[0]).toMatchObject({ evidenceId: "K1", documentTitle: "Guide" });
    expect(result.events[0]).toMatchObject({ type: "turnStarted" });
  });

  it("preserves the total server message count when hydration is truncated", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({
      id: "thread-1", conversation_id: "conversation-1", title: "Support", status: "open",
      created_at: "2026-08-11T00:00:00.000Z", updated_at: "2026-08-11T00:01:00.000Z",
      message_count: 100, messages_truncated: true,
      messages: [{ id: "message-1", role: "user", content: "Loaded", created_at: "2026-08-11T00:00:00.000Z" }],
    }));
    await expect(client(fetchMock).conversations.get("thread-1", { messageLimit: 50 })).resolves.toMatchObject({
      messageCount: 100, messagesTruncated: true,
    });
  });

  it("validates list and message inputs before making a request", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const chat = client(fetchMock);
    await expect(chat.conversations.list({ limit: 0 })).rejects.toBeInstanceOf(ChatConfigurationError);
    await expect(chat.turns.send({ conversationId: "x", message: " " })).rejects.toBeInstanceOf(ChatConfigurationError);
    await expect(chat.turns.events({ threadId: "thread-1", afterEventId: -1 })[Symbol.asyncIterator]().next()).rejects.toBeInstanceOf(ChatConfigurationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("stream and runtime operations", () => {
  it("streams only the requested turn and stops at its terminal event", async () => {
    const body = [
      { type: "text_delta", event_id: 1, turn_id: "other", delta: "hidden" },
      { type: "turn_completed", event_id: 2, turn_id: "other" },
      { type: "text_delta", event_id: 3, turn_id: "turn-1", delta: "Hello" },
      { type: "turn_completed", event_id: 4, turn_id: "turn-1" },
      { type: "text_delta", event_id: 4, turn_id: "turn-1", delta: "late" },
    ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 200 }));
    const events = [];
    for await (const event of client(fetchMock).turns.events({ threadId: "thread-1", turnId: "turn-1", afterEventId: 0 })) events.push(event);
    expect(events.map((event) => event.type)).toEqual(["assistantText", "turnCompleted"]);
  });

  it("supports stop, steer, approval, and protected citation reads", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ stopped: true }))
      .mockResolvedValueOnce(json({ accepted: true }))
      .mockResolvedValueOnce(json({ resolved: true }))
      .mockResolvedValueOnce(new Response("document", { headers: { "content-type": "text/plain", "content-disposition": "inline" } }));
    const chat = client(fetchMock);
    await expect(chat.turns.stop({ threadId: "thread-1" })).resolves.toMatchObject({ stopped: true });
    await expect(chat.turns.steer({ threadId: "thread-1", turnId: "turn-1", message: "Focus" })).resolves.toMatchObject({ accepted: true });
    await expect(chat.approvals.resolve({ approvalId: "approval-1", decision: "allow-once" })).resolves.toMatchObject({ resolved: true });
    const citation = await chat.citations.read({ threadId: "thread-1", messageId: "message-1", sourceId: "source-1", documentId: "document-1" });
    expect(citation.contentType).toBe("text/plain");
    expect(new TextDecoder().decode(citation.bytes)).toBe("document");
  });
});

describe("authentication and safe errors", () => {
  it("rejects an empty token before calling OpsRabbit", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(client(fetchMock, vi.fn(() => " ")).getConfiguration()).rejects.toBeInstanceOf(ChatAuthenticationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a non-string token returned by plain JavaScript", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(client(fetchMock, vi.fn(() => null as never)).getConfiguration()).rejects.toBeInstanceOf(ChatAuthenticationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates token-provider and network failures without exposing credentials", async () => {
    const providerError = new Error("application session expired");
    await expect(client(vi.fn<typeof fetch>(), vi.fn(() => { throw providerError; })).getConfiguration()).rejects.toBe(providerError);
    const networkError = new TypeError("network unavailable");
    await expect(client(vi.fn<typeof fetch>().mockRejectedValue(networkError)).getConfiguration()).rejects.toBe(networkError);
  });

  it("validates privileged approval inputs at runtime", () => {
    const fetchMock = vi.fn<typeof fetch>();
    const chat = client(fetchMock);
    expect(() => chat.approvals.resolve({ approvalId: "approval-1", decision: "always" as never })).toThrow(ChatConfigurationError);
    expect(() => chat.approvals.resolve({ approvalId: "approval-1", decision: "deny", matchScope: "all" as never })).toThrow(ChatConfigurationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [400, ChatConfigurationError],
    [401, ChatAuthenticationError],
    [403, ChatAuthorizationError],
    [404, ChatNotFoundError],
    [409, ChatConflictError],
    [410, ChatExpiredError],
    [429, ChatRateLimitError],
    [500, ChatServerError],
  ])("maps status %s to a typed safe error", async (status, ErrorType) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ message: "Safe message" }, { status, headers: { "x-request-id": "request-1", "retry-after": "2" } }));
    const error = await client(fetchMock).getConfiguration().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ErrorType);
    expect(error).toMatchObject({ message: "Safe message", status, requestId: "request-1", retryAfterMs: 2000 });
  });

  it("does not echo tokens or malformed server bodies", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("token-1 secret", { status: 500 }));
    const error: unknown = await client(fetchMock).getConfiguration().catch((caught: unknown) => caught);
    if (!(error instanceof Error)) throw new Error("Expected an error response.");
    expect(error.message).toBe("OpsRabbit request failed with status 500.");
    expect(error.message).not.toContain("token-1");
  });

  it("rejects malformed successful JSON", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("not-json", { status: 200 }));
    await expect(client(fetchMock).getConfiguration()).rejects.toBeInstanceOf(ChatProtocolError);
  });
});
