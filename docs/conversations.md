# Conversations and streaming

## Identifiers

- `conversationId` is the external continuity key. It is scoped to the authenticated widget and external user.
- `threadId` is the opaque canonical OpsRabbit thread resource id.
- `turnId` identifies one agent execution inside a thread.
- `eventId` is a monotonically increasing replay cursor within a thread.

Keep these values distinct. A conversation id is not permission to read a thread, and an event cursor is not authority.

## Listing

`chat.conversations.list()` uses opaque keyset pagination ordered by most recently updated conversation. The server evaluates the exact external-user/widget/tenant/agent binding, current thread read permission, and retention before pagination. Hidden resources do not contribute rows or counts.

Pass `search` to match conversation titles and indexed user/assistant messages. Search is case-insensitive, limited to 200 characters, and runs inside the same caller-scoped query before pagination. Recently written message text can take a short time to appear while OpsRabbit's existing thread index catches up:

```ts
const page = await chat.conversations.list({ search: "payment failure", limit: 20 });
```

Search never includes internal tool activity, reasoning, hidden events, or another external user's conversations.
Keep `search` unchanged while following `nextCursor`; cursors are bound to the normalized search and the host rejects filter mismatches. SDK 0.2 also requires an explicit search acknowledgement from OpsRabbit, so an older host cannot silently return an unfiltered page.

The cursor may expire or become invalid after server upgrades. Treat a `ChatConfigurationError` for an old cursor as a reason to restart from the first page.

## Creating and continuing

`chat.conversations.create()` creates a local handle and external conversation id. OpsRabbit creates the canonical thread when the first message is sent.

To continue a conversation, supply both the `threadId` returned by OpsRabbit and the original `conversationId`. OpsRabbit verifies that both match the authenticated external identity.

### Application context

`conversations.create({ context })` may include a JSON object, for example `{ accountId, orderId, locale }`. The handle snapshots it immediately and sends it only with the first message. OpsRabbit stores it with the conversation and presents it to the selected agent as untrusted application data so the agent can map values into tool arguments. Context is immutable for that conversation; start a new conversation to change it.

This is the supported way to send application metadata needed by plugin tools. Tool schemas should still declare the required arguments: the agent reads the immutable context and maps the relevant values into those arguments. Plugins do not receive the entire context as an implicit trusted authorization object. Validate identifiers inside the plugin/service, and never use context alone to grant tenant or resource access.

Context is bounded to 16 KiB, eight levels, and 64 keys. Do not put secrets, bearer tokens, raw credentials, authorization decisions, or instructions in it. Context never grants access: every tool and resource still performs its normal server-side authorization. It inherits the thread's retention and deletion lifecycle.

## Event replay

`chat.turns.events()` returns an `AsyncIterable<ChatEvent>`. Save the greatest processed `eventId` in caller-owned state if the UI supports reconnection. Reconnect with that id as `afterEventId`.

The SDK does not reconnect automatically in its first release because retry policy belongs to the application and intermediaries may terminate streams differently. It also does not retry `send()` automatically because safe mutation retries require an explicit idempotency contract.

OpsRabbit scrubs events before they reach the SDK. Hidden activity arrives only as a hidden activity marker; compact mode contains bounded safe output. Unknown future events are represented without copying arbitrary raw fields.

## Retention

Conversation listing and hydration follow the Embedded Chat preset's retained-thread policy. Expired terminal conversations disappear from lists and return `ChatExpiredError` only after the server has first verified that the conversation belongs to the caller. Active queued or running work follows the host's fail-closed retention behavior.

The SDK does not store conversations. If an application copies content to local storage, analytics, logs, crash reports, or exports, those copies follow the application's own deletion and retention policy.
