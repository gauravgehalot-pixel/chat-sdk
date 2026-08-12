export type TokenRequestReason =
  | "configuration"
  | "list_conversations"
  | "get_conversation"
  | "send_message"
  | "stream_events"
  | "stop_turn"
  | "steer_turn"
  | "resolve_approval"
  | "read_citation"
  | "list_insight_queries"
  | "get_insight_query"
  | "run_insight_query"
  | "list_insight_dashboards"
  | "get_insight_dashboard"
  | "render_insight_dashboard";

export interface AccessTokenContext {
  reason: TokenRequestReason;
  agentName: string;
  widgetId: string;
  tenantId: string;
  signal?: AbortSignal;
}

export type AccessTokenProvider = (context: AccessTokenContext) => Promise<string> | string;

export interface OpsRabbitChatOptions {
  baseUrl: string;
  widgetId: string;
  tenantId: string;
  agentName: string;
  getAccessToken: AccessTokenProvider;
  fetch?: typeof globalThis.fetch;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface StreamOptions extends RequestOptions {
  maxEventBytes?: number;
  maxBufferBytes?: number;
}

export interface ChatConfiguration {
  apiVersion: string;
  widgetId: string;
  tenantId: string;
  agentName: string;
  externalUserId: string;
  externalDisplayName: string | null;
  threadRetentionMinutes: number;
  settings: Readonly<Record<string, unknown>>;
  capabilities: Readonly<{ insights: boolean }>;
}

export interface ListConversationsInput {
  limit?: number;
  cursor?: string;
}

export interface ConversationSummary {
  id: string;
  conversationId: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  activeTurns: readonly ActiveTurn[];
}

export interface ConversationPage {
  conversations: readonly ConversationSummary[];
  nextCursor: string | null;
}

export interface GetConversationInput {
  messageLimit?: number;
  eventLimit?: number;
}

export interface KnowledgeCitation {
  evidenceId: string;
  sourceId: string;
  documentId: string;
  sourceName: string;
  documentTitle: string;
  page: number | null;
  url: string | null;
  hasStoredContent: boolean;
}

export interface ChatMessage {
  id: string;
  turnId: string;
  role: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  knowledgeCitations: readonly KnowledgeCitation[];
}

export interface ActiveTurn {
  turnId: string;
  status: "queued" | "running";
}

export interface Conversation extends ConversationSummary {
  messages: readonly ChatMessage[];
  events: readonly ChatEvent[];
  messagesTruncated: boolean;
}

export interface CreateConversationInput {
  conversationId?: string;
  context?: JsonObject;
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject { readonly [key: string]: JsonValue }

export interface SendMessageInput {
  conversationId: string;
  message: string;
  threadId?: string;
  title?: string;
}

export interface Turn {
  threadId: string;
  turnId: string;
  userMessageId?: string;
  lastEventId: number;
}

export interface StreamEventsInput {
  threadId: string;
  afterEventId?: number;
  turnId?: string;
}

export interface StopTurnInput {
  threadId: string;
}

export type StopResult = Record<string, unknown> & { stopped: boolean };

export interface SteerTurnInput {
  threadId: string;
  turnId: string;
  message: string;
}

export type SteerResult = Record<string, unknown>;

export interface ResolveApprovalInput {
  approvalId: string;
  decision: "allow-once" | "deny";
  matchScope?: "exact" | "base";
}

export type ApprovalResult = Record<string, unknown>;

export interface ReadCitationInput {
  threadId: string;
  messageId: string;
  sourceId: string;
  documentId: string;
}

export interface CitationContent {
  bytes: ArrayBuffer;
  contentType: string;
  contentDisposition: string | null;
}

export interface ListInsightsInput {
  limit?: number;
}

export type InsightWidgetType = "metric" | "table" | "text" | "bar" | "line" | "area" | "pie" | "donut" | "scatter";

export interface SavedInsightQuery {
  id: string;
  name: string;
  description: string | null;
  providerPluginId: string;
  datasetId: string | null;
  semanticQuery: Readonly<JsonObject>;
  visualizationHint: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SavedInsightQueryList {
  queries: readonly SavedInsightQuery[];
}

export interface SavedInsightQueryResult {
  query: SavedInsightQuery;
  result: unknown;
}

export interface InsightDashboardWidget {
  id: string;
  type: InsightWidgetType;
  title: string;
  description: string | null;
  savedQueryId: string | null;
  textContent: string | null;
  config: Readonly<JsonObject>;
  position: Readonly<JsonObject>;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface InsightDashboard {
  id: string;
  title: string;
  description: string | null;
  layout: Readonly<JsonObject>;
  widgets: readonly InsightDashboardWidget[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface InsightDashboardList {
  dashboards: readonly InsightDashboard[];
}

export interface RenderInsightDashboardInput {
  range?: string;
  agentBases?: readonly string[];
  sourceId?: string | null;
  hourlyCostUsd?: number;
  minutesSaved?: number;
}

export interface RenderedInsightWidget {
  widget: InsightDashboardWidget;
  ok: boolean;
  query?: SavedInsightQuery;
  result?: unknown;
  error?: string;
}

export interface RenderedInsightDashboard {
  dashboard: InsightDashboard;
  widgets: readonly RenderedInsightWidget[];
}

export interface AssistantTextEvent {
  type: "assistantText";
  eventId: number;
  turnId: string;
  text: string;
  final: boolean;
}

export interface ActivityEvent {
  type: "activity";
  eventId: number;
  turnId: string;
  label?: string;
  output?: string;
  hidden: boolean;
}

export interface TurnStateEvent {
  type: "turnStarted" | "turnCompleted" | "turnFailed" | "turnCancelled";
  eventId: number;
  turnId: string;
  message?: string;
}

export interface ApprovalRequestedEvent {
  type: "approvalRequested";
  eventId: number;
  turnId: string;
  approvalId: string;
  summary: string;
}

export interface UnknownEvent {
  type: "unknown";
  eventId?: number;
  turnId?: string;
  rawType: string;
}

export type ChatEvent =
  | AssistantTextEvent
  | ActivityEvent
  | TurnStateEvent
  | ApprovalRequestedEvent
  | UnknownEvent;

export interface ConversationHandle {
  readonly conversationId: string;
  send(input: Omit<SendMessageInput, "conversationId">, options?: RequestOptions): Promise<Turn>;
}
