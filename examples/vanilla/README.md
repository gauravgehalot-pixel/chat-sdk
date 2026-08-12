# Vanilla browser example

This example renders a minimal transcript without a UI framework. Serve it from an origin allowed by the OpsRabbit Embedded Chat preset and provide an authenticated `/api/opsrabbit/chat-token` endpoint.

```html
<ol id="messages"></ol>
<form id="composer">
  <input id="message" required>
  <button>Send</button>
</form>

<script type="module">
  import { OpsRabbitChat } from "https://esm.sh/@opsrabbit/chat@0.2.0";

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
      if (!response.ok) throw new Error("Chat is unavailable");
      return (await response.json()).token;
    },
  });

  const conversation = chat.conversations.create();
  const messages = document.querySelector("#messages");
  const form = document.querySelector("#composer");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.querySelector("#message");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";

    const turn = await conversation.send({ message: text });
    const item = document.createElement("li");
    item.textContent = "";
    messages.append(item);

    for await (const update of chat.turns.events({
      threadId: turn.threadId,
      turnId: turn.turnId,
      afterEventId: Math.max(0, turn.lastEventId - 1),
    })) {
      if (update.type === "assistantText") {
        item.textContent = update.final ? update.text : item.textContent + update.text;
      }
    }
  });
</script>
```

Use DOM text APIs or a reviewed sanitizer when rendering model output. Never assign untrusted message text directly to `innerHTML`.
