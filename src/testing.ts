import { createPrivateKey, sign } from "node:crypto";

export interface TestingTokenOptions {
  privateKey: string;
  widgetId: string;
  externalUserId: string;
  tenantId: string;
  agentName: string;
  externalDisplayName?: string;
  expiresInSeconds?: number;
  now?: Date;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** Creates a short-lived RS256 token for server-side development and tests only. */
export function createTestingToken(options: TestingTokenOptions): string {
  const expiresInSeconds = options.expiresInSeconds ?? 300;
  if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 3600) {
    throw new RangeError("expiresInSeconds must be an integer between 1 and 3600.");
  }
  const required = [options.widgetId, options.externalUserId, options.tenantId, options.agentName];
  if (required.some((value) => !value.trim())) throw new TypeError("Widget, user, tenant, and agent identifiers are required.");
  const issuedAt = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const header = encode({ alg: "RS256", typ: "JWT" });
  const payload = encode({
    aud: "opsrabbit-embedded-chat",
    iat: issuedAt,
    exp: issuedAt + expiresInSeconds,
    widget_client_id: options.widgetId.trim(),
    external_user_id: options.externalUserId.trim(),
    ...(options.externalDisplayName?.trim() ? { external_display_name: options.externalDisplayName.trim() } : {}),
    tenant_id: options.tenantId.trim(),
    agent_name: options.agentName.trim(),
  });
  const input = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(input), createPrivateKey(options.privateKey)).toString("base64url");
  return `${input}.${signature}`;
}
