# Drop-in chat widget

`@opsrabbit/chat/widget` registers a framework-neutral `<opsrabbit-chat>` web component. It uses Shadow DOM and works in plain JavaScript, Angular, React, Vue, and other modern browsers.

```js
import "@opsrabbit/chat/widget";
```

```html
<opsrabbit-chat api-url="https://opsrabbit.example.com/api" widget-id="ecw_support"
  tenant-id="tenant-a" agent-name="support-agent"
  token-url="/api/opsrabbit/chat-token" title="Support assistant">
</opsrabbit-chat>
```

`token-url` receives a same-origin `POST` for each operation and must return `{ "token": "..." }`. The endpoint must authenticate the current application user and set `Cache-Control: no-store, private`. Never put an RSA private key, pre-minted JWT, or OpsRabbit administrative credential in frontend code.

Programmatic configuration can supply deterministic tool bindings:

```js
document.querySelector("opsrabbit-chat").configure({
  context: { locale: "en-US" },
  bindings: { workspaceId: "workspace-123" },
});
```

## Angular

Import the registration module once in `main.ts`:

```ts
import "@opsrabbit/chat/widget";
```

For a standalone component, allow the custom element and configure it after Angular creates the view:

```ts
import { AfterViewInit, CUSTOM_ELEMENTS_SCHEMA, Component, ElementRef, ViewChild } from "@angular/core";
import type { OpsRabbitChatElement } from "@opsrabbit/chat/widget";

@Component({
  selector: "app-support-chat",
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<opsrabbit-chat #chat api-url="https://opsrabbit.example.com/api"
    widget-id="ecw_support" tenant-id="tenant-a" agent-name="support-agent"
    token-url="/api/opsrabbit/chat-token" title="Support assistant"></opsrabbit-chat>`,
})
export class SupportChatComponent implements AfterViewInit {
  @ViewChild("chat", { static: true }) chat!: ElementRef<OpsRabbitChatElement>;

  ngAfterViewInit(): void {
    this.chat.nativeElement.configure({
      bindings: { workspaceId: "workspace-123" },
      context: { locale: "en-US" },
    });
  }
}
```

With an NgModule application, add `CUSTOM_ELEMENTS_SCHEMA` to that module. For Angular SSR, import the registration module only in the browser. The module is SSR-safe, but registration is useful only where `customElements` exists.

## React

Import the registration module once in your browser entry point, such as `main.tsx`:

```ts
import "@opsrabbit/chat/widget";
```

Add the custom element to React's JSX types in a declaration file such as `src/opsrabbit-chat.d.ts`:

```ts
import type { DetailedHTMLProps, HTMLAttributes } from "react";
import type { OpsRabbitChatElement } from "@opsrabbit/chat/widget";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "opsrabbit-chat": DetailedHTMLProps<
        HTMLAttributes<OpsRabbitChatElement>,
        OpsRabbitChatElement
      > & {
        "api-url": string;
        "widget-id": string;
        "tenant-id": string;
        "agent-name": string;
        "token-url"?: string;
        title?: string;
        placeholder?: string;
      };
    }
  }
}
```

You can then use a typed ref to supply context and deterministic tool bindings:

```tsx
import { useEffect, useRef } from "react";
import type { OpsRabbitChatElement } from "@opsrabbit/chat/widget";

export function SupportChat() {
  const chatRef = useRef<OpsRabbitChatElement>(null);

  useEffect(() => {
    chatRef.current?.configure({
      context: { locale: "en-US" },
      bindings: { workspaceId: "workspace-123" },
    });
  }, []);

  return (
    <opsrabbit-chat
      ref={chatRef}
      api-url="https://opsrabbit.example.com/api"
      widget-id="ecw_support"
      tenant-id="tenant-a"
      agent-name="support-agent"
      token-url="/api/opsrabbit/chat-token"
      title="Support assistant"
    />
  );
}
```

For SSR frameworks such as Next.js, put this component behind a client boundary and import `@opsrabbit/chat/widget` only from client-side code. The token endpoint remains a server route authenticated with the application's normal user session; do not expose the signing key through React environment variables or client bundles.

`context` and `bindings` are snapshotted onto the first message. Do not place secrets in either object. See [conversation semantics](conversations.md) for their trust model.
