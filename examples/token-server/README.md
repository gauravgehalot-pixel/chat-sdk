# Token endpoint example

This illustrative Node handler assumes the application has already authenticated `request.user`. Use your framework's real session and authorization middleware.

```ts
import { SignJWT, importPKCS8 } from "jose";

export async function issueOpsRabbitChatToken(request, response) {
  if (request.method !== "POST") return response.status(405).end();
  if (!request.user) return response.status(401).end();
  // Resolve this route to a server-owned preset. Never let request JSON choose
  // tenant/widget/agent authority. Apply your application's integration ACL here.
  const preset = await authorizeServerOwnedChatPreset(request.user, "customer-support");
  if (!preset) return response.status(403).end();

  const now = Math.floor(Date.now() / 1000);
  const privateKey = await importPKCS8(
    process.env.EXAMPLE_OPSRABBIT_CHAT_PRIVATE_KEY,
    "RS256",
  );

  const token = await new SignJWT({
    widget_client_id: preset.widgetId,
    external_user_id: request.user.id,
    external_display_name: request.user.displayName,
    tenant_id: preset.tenantId,
    agent_name: preset.agentName,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setAudience("opsrabbit-embedded-chat")
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);

  response.setHeader("Cache-Control", "no-store, private");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.json({ token });
}
```

The example environment variable belongs to the integrating customer application. OpsRabbit product configuration remains managed through its Embedded Chat configuration UI and APIs.

Important controls:

- Derive `external_user_id` from the authenticated session, never a request body.
- Authorize which users may use this integration.
- Keep the private key in a backend secret manager.
- Avoid token logging and URL query parameters.
- Keep token lifetime at or below the preset TTL.
- Rate-limit token issuance.
- Keep token delivery same-origin with restrictive CORS. If cookie sessions can receive cross-site requests, enforce your framework's CSRF protection.
