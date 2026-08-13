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

`context` and `bindings` are snapshotted onto the first message. Do not place secrets in either object. See [conversation semantics](conversations.md) for their trust model.
