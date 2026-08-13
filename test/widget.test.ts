// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerOpsRabbitChatWidget } from "../src/widget.js";
import type { OpsRabbitChatElement } from "../src/widget.js";

afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

function element(): OpsRabbitChatElement {
  const node = document.createElement("opsrabbit-chat") as OpsRabbitChatElement;
  node.setAttribute("api-url", "https://opsrabbit.example/api");
  node.setAttribute("widget-id", "widget");
  node.setAttribute("tenant-id", "tenant");
  node.setAttribute("agent-name", "agent");
  document.body.append(node);
  return node;
}

function shadow(node: OpsRabbitChatElement): ShadowRoot {
  if (!node.shadowRoot) throw new Error("missing shadow root");
  return node.shadowRoot;
}

function query(root: ShadowRoot, selector: string): Element {
  const result = root.querySelector(selector);
  if (!result) throw new Error(`missing ${selector}`);
  return result;
}

function requestBody(fetchMock: { mock: { calls: unknown[][] } }, index: number): Record<string, unknown> {
  const call = fetchMock.mock.calls[index];
  const init = call?.[1];
  if (!init || typeof init !== "object" || !("body" in init) || typeof init.body !== "string") throw new Error("missing request body");
  const value: unknown = JSON.parse(init.body);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid request body");
  return value as Record<string, unknown>;
}

describe("OpsRabbitChatElement", () => {
  it("registers idempotently and renders configurable labels", () => {
    registerOpsRabbitChatWidget();
    registerOpsRabbitChatWidget();
    const node = element();
    expect(node.shadowRoot?.querySelector(".title")?.textContent).toBe("Chat with OpsRabbit");
    expect(node.shadowRoot?.querySelector("textarea")?.getAttribute("placeholder")).toBe("Ask a question…");
  });

  it("gets a token, sends, streams, and continues the same conversation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ thread_id: "thread-1", turn_id: "turn-1", last_event_id: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response('event: message\ndata: {"event_id":2,"type":"text_delta","turn_id":"turn-1","text":"Hello","final":true}\n\nevent: message\ndata: {"event_id":3,"type":"turn_completed","turn_id":"turn-1"}\n\n', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ thread_id: "thread-1", turn_id: "turn-2", last_event_id: 3 }), { status: 200 }))
      .mockResolvedValueOnce(new Response('event: message\ndata: {"event_id":4,"type":"turn_completed","turn_id":"turn-2"}\n\n', { status: 200 }));
    const node = element();
    const token = vi.fn(() => "jwt");
    node.configure({ getAccessToken: token, bindings: { workspaceId: "one" } });
    const root = shadow(node);
    const form = query(root, "form") as HTMLFormElement;
    const input = query(root, "textarea") as HTMLTextAreaElement;
    input.value = "Hi";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(node.shadowRoot?.textContent).toContain("Hello"));
    input.value = "Again";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    const firstBody = requestBody(fetchMock, 0);
    const secondBody = requestBody(fetchMock, 2);
    expect(firstBody.bindings).toEqual({ workspaceId: "one" });
    expect(secondBody).toMatchObject({ thread_id: "thread-1", conversation_id: firstBody.conversation_id });
    expect(secondBody.bindings).toBeUndefined();
    expect(token).toHaveBeenCalledTimes(4);
  });

  it("uses token-url and displays safe errors", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("no", { status: 401 }));
    const node = element();
    node.setAttribute("token-url", "/token");
    const root = shadow(node);
    const form = query(root, "form") as HTMLFormElement;
    (query(root, "textarea") as HTMLTextAreaElement).value = "Hi";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(node.shadowRoot?.querySelector(".error")?.textContent).toBe("Unable to obtain a chat token."));
    expect(fetchMock).toHaveBeenCalledWith("/token", expect.objectContaining({ method: "POST", credentials: "same-origin" }));
  });
});
