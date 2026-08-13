import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTestingToken } from "../src/testing.js";

describe("createTestingToken", () => {
  it("creates a verifiable RS256 token with the embedded chat claims", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const token = createTestingToken({
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      widgetId: " widget ", externalUserId: " user-1 ", externalDisplayName: " Ada ",
      tenantId: " tenant ", agentName: " agent ", expiresInSeconds: 120,
      now: new Date("2026-08-13T00:00:00Z"),
    });
    const [header, payload, signature] = token.split(".") as [string, string, string];
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toMatchObject({
      aud: "opsrabbit-embedded-chat", iat: 1786579200, exp: 1786579320,
      widget_client_id: "widget", external_user_id: "user-1", external_display_name: "Ada",
      tenant_id: "tenant", agent_name: "agent",
    });
    expect(verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  });

  it("rejects unsafe lifetimes and missing identifiers", () => {
    expect(() => createTestingToken({ privateKey: "x", widgetId: "w", externalUserId: "u", tenantId: "t", agentName: "a", expiresInSeconds: 3601 })).toThrow(RangeError);
    expect(() => createTestingToken({ privateKey: "x", widgetId: " ", externalUserId: "u", tenantId: "t", agentName: "a" })).toThrow(TypeError);
  });
});
