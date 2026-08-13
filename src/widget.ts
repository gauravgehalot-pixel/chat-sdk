import { OpsRabbitChat } from "./client.js";
import type { AccessTokenProvider, ConversationHandle, CreateConversationInput, JsonObject } from "./types.js";

export interface OpsRabbitChatWidgetOptions {
  getAccessToken?: AccessTokenProvider;
  context?: JsonObject;
  bindings?: JsonObject;
}

const runtimeGlobal: { HTMLElement?: typeof HTMLElement; customElements?: CustomElementRegistry } = globalThis;
const ServerHTMLElement = function ServerHTMLElement(): void { /* SSR construction fallback. */ };
const HTMLElementBase = runtimeGlobal.HTMLElement ?? ServerHTMLElement as unknown as typeof HTMLElement;

function requiredElement(root: ShadowRoot, selector: string): Element {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Chat widget template is missing ${selector}.`);
  return element;
}

function nonEmpty(value: string | null, fallback: string): string {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) return fallback;
  return trimmed;
}

export class OpsRabbitChatElement extends HTMLElementBase {
  #options: OpsRabbitChatWidgetOptions = {};
  #started = false;
  #conversation?: ConversationHandle;
  #threadId?: string;

  configure(options: OpsRabbitChatWidgetOptions): void {
    this.#options = { ...options };
  }

  connectedCallback(): void {
    if (this.#started) return;
    this.#started = true;
    this.#render();
  }

  #requiredAttribute(name: string): string {
    const value = this.getAttribute(name)?.trim();
    if (!value) throw new Error(`<opsrabbit-chat> requires the ${name} attribute.`);
    return value;
  }

  #render(): void {
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host{display:block;font:14px system-ui;color:#18202b}.shell{border:1px solid #d8dee8;border-radius:12px;overflow:hidden;background:#fff}.title{padding:12px 16px;font-weight:650;border-bottom:1px solid #e7ebf0}.messages{height:320px;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px}.message{padding:9px 11px;border-radius:10px;max-width:85%;white-space:pre-wrap}.user{align-self:flex-end;background:#1769e0;color:white}.assistant{align-self:flex-start;background:#f0f3f7}.error{color:#a51d2d}.composer{display:flex;gap:8px;padding:10px;border-top:1px solid #e7ebf0}textarea{flex:1;resize:none;min-height:38px;padding:8px;border:1px solid #cbd3df;border-radius:8px;font:inherit}button{border:0;border-radius:8px;background:#1769e0;color:white;padding:0 16px;font:inherit;cursor:pointer}button:disabled{opacity:.55}</style><section class="shell"><header class="title"></header><div class="messages" role="log" aria-live="polite"></div><form class="composer"><textarea rows="1"></textarea><button type="submit">Send</button></form></section>`;
    const title = requiredElement(root, ".title") as HTMLElement;
    const messages = requiredElement(root, ".messages") as HTMLElement;
    const form = requiredElement(root, "form") as HTMLFormElement;
    const textarea = requiredElement(root, "textarea") as HTMLTextAreaElement;
    const button = requiredElement(root, "button") as HTMLButtonElement;
    title.textContent = nonEmpty(this.getAttribute("title"), "Chat with OpsRabbit");
    textarea.placeholder = nonEmpty(this.getAttribute("placeholder"), "Ask a question…");
    const append = (role: "user" | "assistant" | "error", text: string): HTMLElement => {
      const node = document.createElement("div");
      node.className = `message ${role}`;
      node.textContent = text;
      messages.append(node);
      messages.scrollTop = messages.scrollHeight;
      return node;
    };
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const message = textarea.value.trim();
      if (!message || button.disabled) return;
      textarea.value = "";
      append("user", message);
      button.disabled = true;
      void this.#send(message, append).finally(() => { button.disabled = false; textarea.focus(); });
    });
  }

  async #send(message: string, append: (role: "user" | "assistant" | "error", text: string) => HTMLElement): Promise<void> {
    try {
      const tokenUrl = this.getAttribute("token-url")?.trim();
      const getAccessToken = this.#options.getAccessToken ?? (tokenUrl ? async () => {
        const response = await fetch(tokenUrl, { method: "POST", credentials: "same-origin", headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("Unable to obtain a chat token.");
        const body = await response.json() as { token?: unknown };
        if (typeof body.token !== "string") throw new Error("The token endpoint returned an invalid response.");
        return body.token;
      } : undefined);
      if (!getAccessToken) throw new Error("Configure getAccessToken or provide token-url.");
      const chat = new OpsRabbitChat({
        baseUrl: this.#requiredAttribute("api-url"), widgetId: this.#requiredAttribute("widget-id"),
        tenantId: this.#requiredAttribute("tenant-id"), agentName: this.#requiredAttribute("agent-name"), getAccessToken,
      });
      const input: CreateConversationInput = { ...(this.#options.context ? { context: this.#options.context } : {}), ...(this.#options.bindings ? { bindings: this.#options.bindings } : {}) };
      this.#conversation ??= chat.conversations.create(input);
      const turn = await this.#conversation.send({ message, ...(this.#threadId ? { threadId: this.#threadId } : {}) });
      this.#threadId = turn.threadId;
      const output = append("assistant", "");
      for await (const event of chat.turns.events({ threadId: turn.threadId, turnId: turn.turnId, afterEventId: Math.max(0, turn.lastEventId - 1) })) {
        if (event.type === "assistantText") output.textContent = event.final ? event.text : `${output.textContent}${event.text}`;
        if (event.type === "turnFailed") throw new Error(event.message ?? "The agent turn failed.");
      }
    } catch (error) {
      append("error", error instanceof Error ? error.message : "Chat failed.");
    }
  }
}

export function registerOpsRabbitChatWidget(tagName = "opsrabbit-chat"): void {
  const registry = runtimeGlobal.customElements;
  if (!registry) return;
  if (!registry.get(tagName)) registry.define(tagName, OpsRabbitChatElement);
}

registerOpsRabbitChatWidget();
