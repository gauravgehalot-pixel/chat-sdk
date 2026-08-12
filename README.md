# `@opsrabbit/chat`

Headless TypeScript SDK for integrating OpsRabbit agents and caller-scoped conversation history into web applications.

The SDK supplies transport, public types, safe error mapping, and replayable event parsing. It does not render UI, persist messages, mint credentials, or grant access. Your backend authenticates your user and issues a short-lived OpsRabbit Embedded Chat JWT; OpsRabbit remains responsible for tenant isolation, agent and thread permissions, retention, event scrubbing, approvals, and rate limits.

## Install

```bash
npm install @opsrabbit/chat
```

Before creating a client, an OpsRabbit administrator and the customer backend owner must configure an Embedded Chat preset and its RSA signing keys. Follow the [end-to-end setup guide](docs/setup.md); the private key stays only in the customer backend, while OpsRabbit stores only the public key.

The initial release is ESM-only and targets modern browsers. Node.js 20 or newer is supported for server-rendering and tests through its standards-compatible Fetch and Web Streams APIs. Repository development and publication use the version pinned in `.nvmrc`.

## Create a client

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
