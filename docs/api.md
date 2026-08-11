# API reference

## `new OpsRabbitChat(options)`

Required options:

- `baseUrl`: absolute OpsRabbit API URL. HTTPS is required outside loopback development.
- `widgetId`: enabled Embedded Chat preset id.
- `tenantId`: preset tenant id.
- `agentName`: agent selected for this client. Create a saved Embedded Chat preset and client per agent when an application offers multiple agents.
- `getAccessToken(context)`: returns a short-lived JWT. Receives `reason`, the full `widgetId`/`tenantId`/`agentName` preset tuple, and optional `signal`; use those values only to select a server-owned preset mapping, never as authorization by themselves.

Optional `fetch` supplies a standards-compatible Fetch implementation for testing or supported server runtimes.

## Configuration

`getConfiguration(options?)` returns the effective contract version, widget/tenant/agent identity, external identity attribution, retention, and scrubbed presentation settings.

## Conversations

- `conversations.list({ limit?, cursor? }, options?)`
- `conversations.get(threadId, { messageLimit?, eventLimit? }, options?)`
- `conversations.create({ conversationId?, context? })`

The returned handle has `conversationId` and `send()`. It snapshots context at creation and includes it until the initial send succeeds; context is never attached to a continuation with an existing `threadId`.

## Turns

- `turns.send({ conversationId, message, threadId?, title? }, options?)`
- `turns.events({ threadId, afterEventId?, turnId? }, options?)`
- `turns.stop({ threadId }, options?)`
- `turns.steer({ threadId, turnId, message }, options?)`

Every request and stream accepts an `AbortSignal`. Stream options additionally accept bounded parser limits for advanced integrations.

## Approvals

`approvals.resolve({ approvalId, decision, matchScope? }, options?)` accepts `allow-once` or `deny`. Persistent approval rules are intentionally unavailable through the public chat boundary.

## Citations

`citations.read({ threadId, messageId, sourceId, documentId }, options?)` returns an `ArrayBuffer`, media type, and content disposition after OpsRabbit revalidates citation membership and thread access.

## Errors

SDK validation, authentication-response, HTTP, and protocol errors extend `ChatError` and may contain safe `status`, `requestId`, and `retryAfterMs` fields:

- `ChatConfigurationError`
- `ChatAuthenticationError`
- `ChatAuthorizationError`
- `ChatNotFoundError`
- `ChatExpiredError`
- `ChatRateLimitError`
- `ChatConflictError`
- `ChatProtocolError`
- `ChatServerError`

Do not make authorization decisions from error text. A `404` can intentionally hide a resource the caller cannot read.

Errors thrown by the application's `getAccessToken` callback and network errors thrown by its Fetch implementation propagate unchanged so applications can preserve their own authentication and connectivity handling. Abort errors also propagate unchanged. A callback that returns a non-string or blank token produces `ChatAuthenticationError`.
