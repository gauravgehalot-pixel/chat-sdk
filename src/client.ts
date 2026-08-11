import {
  ChatAuthenticationError,
  ChatConfigurationError,
  ChatProtocolError,
  errorForStatus,
} from "./errors.js";
import { mapChatEvent, parseEventStream } from "./events.js";
import type {
  AccessTokenContext,
  ActiveTurn,
  ApprovalResult,
  ChatConfiguration,
  ChatEvent,
  ChatMessage,
  CitationContent,
  Conversation,
  ConversationHandle,
  ConversationPage,
  ConversationSummary,
  CreateConversationInput,
  GetConversationInput,
  KnowledgeCitation,
  ListConversationsInput,
  OpsRabbitChatOptions,
  ReadCitationInput,
  RequestOptions,
  ResolveApprovalInput,
  SendMessageInput,
  SteerResult,
  SteerTurnInput,
  StopResult,
  StopTurnInput,
  StreamEventsInput,
  StreamOptions,
  TokenRequestReason,
  Turn,
} from "./types.js";

const SDK_VERSION = "0.1.0";
const MAX_CONTEXT_BYTES = 16 * 1024;
const MAX_CONTEXT_DEPTH = 8;
const MAX_CONTEXT_KEYS = 64;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown, context: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ChatProtocolError(`${context} response was not an object.`);
  }
  return value as JsonRecord;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ChatProtocolError(`Response field ${field} was missing.`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ChatConfigurationError(`${label} is required.`);
  return normalized;
}

function snapshotContext(value: unknown): JsonRecord | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ChatConfigurationError("context must be a JSON object.");
  let keys = 0;
  const seen = new Set<object>();
  const copy = (entry: unknown, depth: number): unknown => {
    if (depth > MAX_CONTEXT_DEPTH) throw new ChatConfigurationError(`context must be at most ${String(MAX_CONTEXT_DEPTH)} levels deep.`);
    if (entry === null || typeof entry === "string" || typeof entry === "boolean") return entry;
    if (typeof entry === "number" && Number.isFinite(entry)) return entry;
    if (!entry || typeof entry !== "object") throw new ChatConfigurationError("context must contain only JSON values.");
    if (seen.has(entry)) throw new ChatConfigurationError("context must be acyclic JSON data.");
    seen.add(entry);
    let result: unknown;
    if (Array.isArray(entry)) {
      result = entry.map((item) => copy(item, depth + 1));
    } else {
      if (Object.getPrototypeOf(entry) !== Object.prototype) throw new ChatConfigurationError("context must contain only plain JSON objects.");
      const objectResult: JsonRecord = {};
      for (const key of Object.keys(entry).sort()) {
        keys += 1;
        if (keys > MAX_CONTEXT_KEYS) throw new ChatConfigurationError(`context must contain at most ${String(MAX_CONTEXT_KEYS)} keys.`);
        if (key === "__proto__" || key === "prototype" || key === "constructor") throw new ChatConfigurationError("context contains a reserved key.");
        objectResult[key] = copy((entry as Record<string, unknown>)[key], depth + 1);
      }
      result = objectResult;
    }
    seen.delete(entry);
    return result;
  };
  const snapshot = copy(value, 1) as JsonRecord;
  if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > MAX_CONTEXT_BYTES) throw new ChatConfigurationError(`context must be ${String(MAX_CONTEXT_BYTES)} UTF-8 bytes or fewer.`);
  return snapshot;
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new ChatConfigurationError("baseUrl must be an absolute URL.", { cause });
  }
  if (url.username || url.password) {
    throw new ChatConfigurationError("baseUrl must not include URL credentials.");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new ChatConfigurationError("baseUrl must use HTTPS except on loopback development hosts.");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

function normalizeLimit(value: number | undefined, fallback: number, maximum: number, label: string): number {
  const normalized = value ?? fallback;
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > maximum) {
    throw new ChatConfigurationError(`${label} must be an integer between 1 and ${String(maximum)}.`);
  }
  return normalized;
}

function requestInit(method: "GET" | "POST", signal?: AbortSignal, body?: string): RequestInit {
  return {
    method,
    ...(signal ? { signal } : {}),
    ...(body !== undefined ? { body } : {}),
  };
}

function mapActiveTurns(value: unknown): ActiveTurn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const turn = item !== null && typeof item === "object" && !Array.isArray(item) ? item as JsonRecord : {};
    const status = turn.status;
    const turnId = optionalString(turn.turn_id);
    return turnId && (status === "queued" || status === "running") ? [{ turnId, status }] : [];
  });
}

function mapConversationSummary(value: unknown): ConversationSummary {
  const item = asRecord(value, "Conversation");
  return {
    id: requiredString(item.id, "id"),
    conversationId: requiredString(item.conversation_id, "conversation_id"),
    title: requiredString(item.title, "title"),
    status: requiredString(item.status, "status"),
    createdAt: requiredString(item.created_at, "created_at"),
    updatedAt: requiredString(item.updated_at, "updated_at"),
    messageCount: numberValue(item.message_count),
    activeTurns: mapActiveTurns(item.active_turns),
  };
}

function mapCitation(value: unknown): KnowledgeCitation {
  const item = asRecord(value, "Citation");
  return {
    evidenceId: requiredString(item.evidence_id, "evidence_id"),
    sourceId: requiredString(item.source_id, "source_id"),
    documentId: requiredString(item.document_id, "document_id"),
    sourceName: optionalString(item.source_name) ?? "",
    documentTitle: requiredString(item.document_title, "document_title"),
    page: typeof item.page === "number" ? item.page : null,
    url: typeof item.url === "string" ? item.url : null,
    hasStoredContent: item.has_stored_content === true,
  };
}

function mapMessage(value: unknown): ChatMessage {
  const item = asRecord(value, "Message");
  const updatedAt = optionalString(item.updated_at);
  return {
    id: requiredString(item.id, "id"),
    turnId: optionalString(item.turn_id) ?? "",
    role: requiredString(item.role, "role"),
    content: optionalString(item.content) ?? "",
    createdAt: requiredString(item.created_at, "created_at"),
    ...(updatedAt ? { updatedAt } : {}),
    knowledgeCitations: Array.isArray(item.knowledge_citations) ? item.knowledge_citations.map(mapCitation) : [],
  };
}

export class OpsRabbitChat {
  readonly conversations: {
    list: (input?: ListConversationsInput, options?: RequestOptions) => Promise<ConversationPage>;
    get: (id: string, input?: GetConversationInput, options?: RequestOptions) => Promise<Conversation>;
    create: (input?: CreateConversationInput) => ConversationHandle;
  };
  readonly turns: {
    send: (input: SendMessageInput, options?: RequestOptions) => Promise<Turn>;
    events: (input: StreamEventsInput, options?: StreamOptions) => AsyncIterable<ChatEvent>;
    stop: (input: StopTurnInput, options?: RequestOptions) => Promise<StopResult>;
    steer: (input: SteerTurnInput, options?: RequestOptions) => Promise<SteerResult>;
  };
  readonly approvals: {
    resolve: (input: ResolveApprovalInput, options?: RequestOptions) => Promise<ApprovalResult>;
  };
  readonly citations: {
    read: (input: ReadCitationInput, options?: RequestOptions) => Promise<CitationContent>;
  };

  readonly #baseUrl: string;
  readonly #widgetId: string;
  readonly #tenantId: string;
  readonly #agentName: string;
  readonly #getAccessToken: OpsRabbitChatOptions["getAccessToken"];
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: OpsRabbitChatOptions) {
    this.#baseUrl = normalizeBaseUrl(options.baseUrl);
    this.#widgetId = normalizeIdentifier(options.widgetId, "widgetId");
    this.#tenantId = normalizeIdentifier(options.tenantId, "tenantId");
    this.#agentName = normalizeIdentifier(options.agentName, "agentName");
    if (typeof options.getAccessToken !== "function") throw new ChatConfigurationError("getAccessToken is required.");
    this.#getAccessToken = options.getAccessToken;
    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (typeof fetchImplementation !== "function") throw new ChatConfigurationError("A Fetch API implementation is required.");
    this.#fetch = fetchImplementation.bind(globalThis);

    this.conversations = {
      list: (input, requestOptions) => this.#listConversations(input, requestOptions),
      get: (id, input, requestOptions) => this.#getConversation(id, input, requestOptions),
      create: (input) => this.#createConversation(input),
    };
    this.turns = {
      send: (input, requestOptions) => this.#send(input, requestOptions),
      events: (input, streamOptions) => this.#events(input, streamOptions),
      stop: (input, requestOptions) => this.#post<StopResult>(`/widget/chat/threads/${encodeURIComponent(normalizeIdentifier(input.threadId, "threadId"))}/stop`, "stop_turn", this.#authBody(), requestOptions),
      steer: (input, requestOptions) => this.#post<SteerResult>(`/widget/chat/threads/${encodeURIComponent(normalizeIdentifier(input.threadId, "threadId"))}/turns/${encodeURIComponent(normalizeIdentifier(input.turnId, "turnId"))}/steer`, "steer_turn", { ...this.#authBody(), message: normalizeIdentifier(input.message, "message") }, requestOptions),
    };
    this.approvals = {
      resolve: (input, requestOptions) => {
        const decision: unknown = input.decision;
        const matchScope: unknown = input.matchScope;
        if (decision !== "allow-once" && decision !== "deny") {
          throw new ChatConfigurationError("decision must be allow-once or deny.");
        }
        if (matchScope !== undefined && matchScope !== "exact" && matchScope !== "base") {
          throw new ChatConfigurationError("matchScope must be exact or base.");
        }
        return this.#post<ApprovalResult>(`/widget/chat/approvals/${encodeURIComponent(normalizeIdentifier(input.approvalId, "approvalId"))}/resolve`, "resolve_approval", { ...this.#authBody(), decision, ...(matchScope ? { match_scope: matchScope } : {}) }, requestOptions);
      },
    };
    this.citations = {
      read: (input, requestOptions) => this.#readCitation(input, requestOptions),
    };
  }

  async getConfiguration(options?: RequestOptions): Promise<ChatConfiguration> {
    const payload = await this.#post<JsonRecord>("/widget/chat/config", "configuration", this.#authBody(), options);
    const widget = asRecord(payload.widget, "Configuration widget");
    return {
      apiVersion: optionalString(payload.chat_api_version) ?? "1",
      widgetId: requiredString(widget.id, "widget.id"),
      tenantId: requiredString(widget.tenant_id, "widget.tenant_id"),
      agentName: requiredString(widget.agent_name, "widget.agent_name"),
      externalUserId: requiredString(payload.external_user_id, "external_user_id"),
      externalDisplayName: typeof payload.external_display_name === "string" ? payload.external_display_name : null,
      threadRetentionMinutes: numberValue(widget.thread_retention_minutes),
      settings: Object.freeze(asRecord(widget.settings, "Configuration settings")),
    };
  }

  #authBody(): JsonRecord {
    return { widget_id: this.#widgetId, tenant_id: this.#tenantId, agent_name: this.#agentName };
  }

  #authQuery(): URLSearchParams {
    return new URLSearchParams({ widget_id: this.#widgetId, tenant_id: this.#tenantId, agent_name: this.#agentName });
  }

  #createConversation(input: CreateConversationInput = {}): ConversationHandle {
    const suppliedConversationId = input.conversationId?.trim();
    const runtimeCrypto = globalThis.crypto as Crypto | undefined;
    const generatedConversationId = !suppliedConversationId && runtimeCrypto && typeof runtimeCrypto.randomUUID === "function"
      ? runtimeCrypto.randomUUID()
      : undefined;
    const conversationId = suppliedConversationId && suppliedConversationId.length > 0
      ? suppliedConversationId
      : generatedConversationId;
    if (!conversationId) throw new ChatConfigurationError("conversationId is required when crypto.randomUUID is unavailable.");
    normalizeIdentifier(conversationId, "conversationId");
    const context = snapshotContext(input.context);
    let firstSend = true;
    return {
      conversationId,
      send: (message, options) => {
        const initialContext = firstSend ? context : undefined;
        firstSend = false;
        return this.#send({ ...message, conversationId }, options, initialContext);
      },
    };
  }

  async #listConversations(input: ListConversationsInput = {}, options?: RequestOptions): Promise<ConversationPage> {
    const query = this.#authQuery();
    query.set("limit", String(normalizeLimit(input.limit, 20, 100, "limit")));
    if (input.cursor) query.set("cursor", normalizeIdentifier(input.cursor, "cursor"));
    const payload = await this.#requestJson<JsonRecord>(`/widget/chat/conversations?${query}`, "list_conversations", requestInit("GET", options?.signal));
    if (!Array.isArray(payload.conversations)) throw new ChatProtocolError("Conversation list response was malformed.");
    return {
      conversations: payload.conversations.map(mapConversationSummary),
      nextCursor: typeof payload.next_cursor === "string" ? payload.next_cursor : null,
    };
  }

  async #getConversation(id: string, input: GetConversationInput = {}, options?: RequestOptions): Promise<Conversation> {
    const query = this.#authQuery();
    query.set("messages", String(normalizeLimit(input.messageLimit, 50, 100, "messageLimit")));
    query.set("event_limit", String(normalizeLimit(input.eventLimit, 200, 400, "eventLimit")));
    const payload = await this.#requestJson<JsonRecord>(`/widget/chat/threads/${encodeURIComponent(normalizeIdentifier(id, "conversation id"))}?${query}`, "get_conversation", requestInit("GET", options?.signal));
    const summary = mapConversationSummary({
      ...payload,
      conversation_id: requiredString(payload.conversation_id, "conversation_id"),
      message_count: typeof payload.message_count === "number"
        ? payload.message_count
        : Array.isArray(payload.messages) ? payload.messages.length : 0,
    });
    return {
      ...summary,
      messages: Array.isArray(payload.messages) ? payload.messages.map(mapMessage) : [],
      events: Array.isArray(payload.events) ? payload.events.map(mapChatEvent) : [],
      messagesTruncated: payload.messages_truncated === true,
    };
  }

  async #send(input: SendMessageInput, options?: RequestOptions, context?: JsonRecord): Promise<Turn> {
    const payload = await this.#post<JsonRecord>("/widget/chat/turns", "send_message", {
      ...this.#authBody(),
      conversation_id: normalizeIdentifier(input.conversationId, "conversationId"),
      message: normalizeIdentifier(input.message, "message"),
      ...(input.threadId ? { thread_id: normalizeIdentifier(input.threadId, "threadId") } : {}),
      ...(input.title ? { title: input.title.trim() } : {}),
      ...(context ? { context } : {}),
    }, options);
    const userMessageId = optionalString(payload.user_message_id);
    return {
      threadId: requiredString(payload.thread_id, "thread_id"),
      turnId: requiredString(payload.turn_id, "turn_id"),
      ...(userMessageId ? { userMessageId } : {}),
      lastEventId: numberValue(payload.last_event_id),
    };
  }

  async *#events(input: StreamEventsInput, options: StreamOptions = {}): AsyncIterable<ChatEvent> {
    const threadId = normalizeIdentifier(input.threadId, "threadId");
    const afterEventId = input.afterEventId ?? 0;
    if (!Number.isSafeInteger(afterEventId) || afterEventId < 0) throw new ChatConfigurationError("afterEventId must be a non-negative integer.");
    const query = this.#authQuery();
    query.set("after_event_id", String(afterEventId));
    const response = await this.#request(`/widget/chat/threads/${encodeURIComponent(threadId)}/events/stream?${query}`, "stream_events", requestInit("GET", options.signal));
    if (!response.body) throw new ChatProtocolError("Chat event stream response had no body.");
    for await (const event of parseEventStream(response.body, {
      ...(options.maxEventBytes !== undefined ? { maxEventBytes: options.maxEventBytes } : {}),
      ...(options.maxBufferBytes !== undefined ? { maxBufferBytes: options.maxBufferBytes } : {}),
    })) {
      const matchesTurn = !input.turnId || !("turnId" in event) || !event.turnId || event.turnId === input.turnId;
      if (matchesTurn) yield event;
      if (matchesTurn && (event.type === "turnCompleted" || event.type === "turnFailed" || event.type === "turnCancelled")) return;
    }
  }

  async #readCitation(input: ReadCitationInput, options?: RequestOptions): Promise<CitationContent> {
    const query = this.#authQuery();
    const path = `/widget/chat/threads/${encodeURIComponent(normalizeIdentifier(input.threadId, "threadId"))}/messages/${encodeURIComponent(normalizeIdentifier(input.messageId, "messageId"))}/knowledge-citations/${encodeURIComponent(normalizeIdentifier(input.sourceId, "sourceId"))}/${encodeURIComponent(normalizeIdentifier(input.documentId, "documentId"))}/content?${query}`;
    const response = await this.#request(path, "read_citation", requestInit("GET", options?.signal));
    return {
      bytes: await response.arrayBuffer(),
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
      contentDisposition: response.headers.get("content-disposition"),
    };
  }

  #post<T>(path: string, reason: TokenRequestReason, body: JsonRecord, options?: RequestOptions): Promise<T> {
    return this.#requestJson<T>(path, reason, requestInit("POST", options?.signal, JSON.stringify(body)));
  }

  async #requestJson<T>(path: string, reason: TokenRequestReason, init: RequestInit): Promise<T> {
    const response = await this.#request(path, reason, init);
    try {
      return await response.json() as T;
    } catch (cause) {
      const requestId = response.headers.get("x-request-id");
      throw new ChatProtocolError("OpsRabbit returned invalid JSON.", {
        status: response.status,
        ...(requestId ? { requestId } : {}),
        cause,
      });
    }
  }

  async #request(path: string, reason: TokenRequestReason, init: RequestInit): Promise<Response> {
    const tokenContext: AccessTokenContext = init.signal
      ? { reason, agentName: this.#agentName, widgetId: this.#widgetId, tenantId: this.#tenantId, signal: init.signal }
      : { reason, agentName: this.#agentName, widgetId: this.#widgetId, tenantId: this.#tenantId };
    const providedToken: unknown = await this.#getAccessToken(tokenContext);
    if (typeof providedToken !== "string") throw new ChatAuthenticationError("getAccessToken must return a token string.");
    const token = providedToken.trim();
    if (!token) throw new ChatAuthenticationError("getAccessToken returned an empty token.");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("X-OpsRabbit-Chat-SDK-Version", SDK_VERSION);
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    const response = await this.#fetch(`${this.#baseUrl}${path}`, { ...init, headers });
    if (response.ok) return response;
    const requestId = response.headers.get("x-request-id") ?? undefined;
    const retryAfter = response.headers.get("retry-after");
    const retryAfterMs = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : undefined;
    let message = `OpsRabbit request failed with status ${String(response.status)}.`;
    try {
      const payload = asRecord(await response.json(), "Error");
      message = optionalString(payload.detail) ?? optionalString(payload.message) ?? message;
    } catch {
      // Preserve the safe generic message for non-JSON error responses.
    }
    throw errorForStatus(message, {
      status: response.status,
      ...(requestId ? { requestId } : {}),
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    });
  }
}
