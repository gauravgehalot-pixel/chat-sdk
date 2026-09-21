# `@opsrabbit/chat`

TypeScript SDK and optional framework-neutral chat widget for integrating OpsRabbit agents and caller-scoped conversation history into web applications.

The SDK supplies transport, public types, safe error mapping, replayable event parsing, and an optional web-component UI. It does not persist messages, mint browser credentials, or grant access. Your backend authenticates your user and issues a short-lived OpsRabbit Embedded Chat JWT; OpsRabbit remains responsible for tenant isolation, agent and thread permissions, retention, event scrubbing, approvals, and rate limits.

`ChatEvent` includes `clientAction` for a trusted host-generated navigation hint.
It contains a closed target enum and localization key, never a URL or executable
payload; malformed actions map to `unknown` and must be ignored.

## Install

```bash
npm install @opsrabbit/chat
```

Before creating a client, an OpsRabbit administrator and the customer backend owner must configure an Embedded Chat preset and its RSA signing keys. Follow the [end-to-end setup guide](docs/setup.md); the private key stays only in the customer backend, while OpsRabbit stores only the public key.

The initial release is ESM-only and targets modern browsers. Node.js 20 or newer is supported for server-rendering and tests through its standards-compatible Fetch and Web Streams APIs. Repository development and publication use the version pinned in `.nvmrc`.

## React Native

Use the supported headless native export with a saved **native** Embedded Chat preset. The standard React Native global `fetch` does not provide a progressively readable SSE response body, so it is insufficient for chat streaming. Supply a streaming-capable Fetch implementation explicitly. Expo applications can use `expo/fetch`; other runtimes must provide an equivalent standards-compatible implementation with `Headers`, `TextEncoder`, and readable response streams. The native app obtains a fresh short-lived token from its own authenticated backend; that backend must verify platform attestation (for example App Attest/Play Integrity) before signing the token. Never bundle the RSA signing key, an OpsRabbit administrative credential, or an attestation-provider secret in the app.

```ts
import { OpsRabbitNativeChat } from "@opsrabbit/chat/react-native";
import { fetch as expoFetch } from "expo/fetch";

const chat = new OpsRabbitNativeChat({
  baseUrl: "https://opsrabbit.example.com/api",
  widgetId: "ecw_mobile_support",
  tenantId: "tenant-a",
  agentName: "support-agent",
  getAccessToken: ({ signal }) => getMobileChatToken(signal),
  fetch: expoFetch,
});
```

The registered native client ID is an identifier, not an app secret. Keep it in the customer backend and place it only in that backend's signed token after app attestation succeeds; the SDK never needs it.

## Create a client

For a quick UI, import `@opsrabbit/chat/widget` and use `<opsrabbit-chat>`. See the [widget guide, including Angular](docs/widget.md).

```ts
import { OpsRabbitChat } from "@opsrabbit/chat";

const chat = new OpsRabbitChat({
  baseUrl: "https://opsrabbit.example.com/api",
  widgetId: "ecw_support",
  tenantId: "tenant-a",
  agentName: "support-agent",
  getAccessToken: async ({ signal }) => {
    const response = await fetch("/api/opsrabbit/chat-token", {
      credentials: "same-origin",
      signal,
    });
    if (!response.ok) throw new Error("Unable to start chat");
    return (await response.json()).token;
  },
});
```

`getAccessToken` is called for every operation and stream connection. The SDK does not cache the token. Your application may cache a token until shortly before its expiry, but must never place the JWT signing key or an OpsRabbit administrative credential in browser code.

Create one saved Embedded Chat preset and SDK client per agent when your UI can trigger different agents. OpsRabbit requires the preset, short-lived token's `agent_name`, requested `agentName`, and widget service principal's agent grant to agree.

## List conversations

```ts
const page = await chat.conversations.list({ search: "payment failure", limit: 20 });

for (const conversation of page.conversations) {
  console.log(conversation.id, conversation.title, conversation.updatedAt);
}

if (page.nextCursor) {
  const nextPage = await chat.conversations.list({
    limit: 20,
    cursor: page.nextCursor,
    search: "payment failure",
  });
}
```

OpsRabbit returns only conversations bound to the token's exact external user, widget, tenant, and configured agent. This API never lists every conversation handled by an agent.

## Send and stream

```ts
const conversation = chat.conversations.create({
  context: { accountId: "acct-123", orderId: "order-456", locale: "en-US" },
  bindings: { workspaceId: "workspace-123" },
});
const turn = await conversation.send({ message: "Why did checkout fail?" });

for await (const event of chat.turns.events({
  threadId: turn.threadId,
  turnId: turn.turnId,
  afterEventId: Math.max(0, turn.lastEventId - 1),
})) {
  if (event.type === "assistantText") {
    console.log(event.text);
  }
  if (event.type === "turnFailed") {
    console.error(event.message);
  }
}
```

To continue later, keep the returned `threadId` and the handle's `conversationId` in application state:

```ts
await chat.turns.send({
  threadId,
  conversationId,
  message: "Can you check the payment provider too?",
});
```

The SDK does not automatically persist either identifier and does not automatically reconnect or retry mutations. See [conversation and streaming semantics](docs/conversations.md).

## Abort work

```ts
const controller = new AbortController();

for await (const event of chat.turns.events(
  { threadId, afterEventId },
  { signal: controller.signal },
)) {
  // Render event.
}

controller.abort();
```

Aborting the local stream does not stop the OpsRabbit turn. Call `chat.turns.stop({ threadId })` when the user intends to stop server-side execution.

## Documentation

- [End-to-end OpsRabbit setup](docs/setup.md)
- [Authentication and security](docs/authentication.md)
- [Drop-in widget and Angular integration](docs/widget.md)
- [Node and Python development token helpers](docs/testing-tokens.md)
- [Conversations and streaming](docs/conversations.md)
- [API reference](docs/api.md)
- [Vanilla browser example](examples/vanilla/README.md)
- [Token endpoint example](examples/token-server/README.md)
- [Security policy](SECURITY.md)
- [Release process](docs/releasing.md)

## Development

```bash
nvm use
npm install
npm run quality
```

Tests run serially and the packed artifact is verified before publication.

## License

Apache-2.0
