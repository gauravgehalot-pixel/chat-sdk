# Set up OpsRabbit for `@opsrabbit/chat`

This integration uses an **Embedded Chat preset** and an RSA key pair. OpsRabbit stores the **public key** and verifies tokens. Your application backend stores the **private key** and signs short-lived tokens. The private key must never be sent to OpsRabbit or browser code.

## What you need

- An OpsRabbit tenant-admin or deployment-admin account.
- A user-defined OpsRabbit agent that the frontend should invoke.
- The exact production frontend origins, such as `https://app.example.com`.
- A customer backend that can authenticate the frontend's users and keep secrets.
- The OpsRabbit base URL reachable by the browser.

## 1. Create the Embedded Chat preset in OpsRabbit

1. Open **Configuration → Embedded Chat** in OpsRabbit.
2. Select **New widget**.
3. Choose the tenant and the user-defined agent.
4. Add every allowed frontend origin using the full origin only—scheme, hostname, and port when non-default. Do not add URL paths and do not use a production wildcard.
5. Choose a short token TTL. Five minutes is a practical starting value; tokens cannot exceed the saved preset TTL.
6. Configure the retained-thread timeout, rate limit, and activity/citation settings.

An application that lets users choose among multiple agents needs one saved preset and one SDK client per agent. A browser request or JWT cannot override the agent saved on a preset.

## 2. Generate and place the RSA keys

The Embedded Chat editor can generate an RSA key pair in the browser:

1. Select **Generate key pair**.
2. Copy the generated private key immediately into the customer backend's secret manager.
3. Keep only the generated public key in the OpsRabbit preset.
4. Save the preset.

The keys have different destinations:

| Value | Store it in | May reach browser? | Purpose |
| --- | --- | --- | --- |
| RSA private key | Customer backend secret manager | No | Signs short-lived RS256 JWTs |
| RSA public key | OpsRabbit Embedded Chat preset | It is not a secret, but the SDK does not need it | Verifies JWT signatures |
| Short-lived JWT | Browser memory | Yes | Authenticates one external user to the preset |
| OpsRabbit admin/API credentials | OpsRabbit or trusted administrative systems | No | Never used by this SDK |

If keys are generated outside OpsRabbit, use an RSA key of at least 2048 bits, provide the public key as PEM/SPKI to OpsRabbit, and keep the matching private key as PEM/PKCS#8 in the customer backend. For example:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out opsrabbit-chat-private.pem
openssl pkey -in opsrabbit-chat-private.pem -pubout -out opsrabbit-chat-public.pem
```

Never commit either generated key. Do not paste the private key into the OpsRabbit public-key field; OpsRabbit rejects private-key PEM material there.

## 3. Record the public preset values

After saving, record these non-secret values for the customer application configuration:

- OpsRabbit `baseUrl`;
- preset/widget id (`widgetId`);
- tenant id (`tenantId`);
- configured agent name (`agentName`); and
- token TTL.

The same widget, tenant, and agent tuple must appear in the SDK configuration and every token. OpsRabbit additionally checks that the preset is enabled, the tenant is active, the request origin is allowed, and the preset's service principal still has `use` access to the agent.

## 4. Add a token endpoint to the customer backend

Create a same-origin `POST` endpoint such as `/api/opsrabbit/chat-token`. It must:

1. Authenticate the application's normal user session.
2. Authorize that user for a server-owned OpsRabbit preset mapping.
3. Derive `external_user_id` from the authenticated session—not request JSON.
4. Sign an RS256 JWT with the preset's private key.
5. Return the token with `Cache-Control: no-store, private`.

Required token claims:

```json
{
  "aud": "opsrabbit-embedded-chat",
  "iat": 1786464000,
  "exp": 1786464300,
  "widget_client_id": "ecw_support",
  "external_user_id": "usr_01K...",
  "external_display_name": "Asha Singh",
  "tenant_id": "tenant-a",
  "agent_name": "support-agent"
}
```

`external_user_id` must be stable and unique in the customer's identity system. Email addresses and display names are usually mutable and should not be used as authority identifiers. See the complete [authentication rules](authentication.md) and [Node token endpoint example](../examples/token-server/README.md).

For multiple presets, prefer a separate fixed endpoint per preset or map a non-authoritative preset alias through a backend allowlist. Never let browser-provided `widgetId`, `tenantId`, or `agentName` grant access by themselves.

## 5. Create the frontend client

```ts
import { OpsRabbitChat } from "@opsrabbit/chat";

const chat = new OpsRabbitChat({
  baseUrl: "https://opsrabbit.example.com/api",
  widgetId: "ecw_support",
  tenantId: "tenant-a",
  agentName: "support-agent",
  getAccessToken: async ({ signal }) => {
    const response = await fetch("/api/opsrabbit/chat-token", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      signal,
    });
    if (!response.ok) throw new Error("Unable to obtain chat access");
    return (await response.json()).token;
  },
});
```

The frontend receives only short-lived JWTs. It never receives the private key, an OpsRabbit service-principal credential, or an administrator credential.

## 6. Verify the integration

1. Use **Open preview** in OpsRabbit to verify that the saved preset and selected agent work with the preset's separate test principal.
2. Load the real customer frontend from an allowed origin.
3. Confirm `chat.getConfiguration()` returns the expected widget, tenant, agent, and external user.
4. Start a conversation and stream its events.
5. Confirm a different signed-in application user cannot list or hydrate the first user's conversations.
6. Confirm disabling the preset or revoking its agent access blocks the next operation.

Common failures:

| Status | Typical cause |
| --- | --- |
| `401` | Missing/expired token, invalid signature or audience, or missing signed identity claims |
| `403` | Origin, tenant, preset-agent, entitlement, or current agent-use authorization mismatch |
| `404` | Conversation is not visible to the signed external user or current grants |
| `409` | Immutable conversation context changed or another conversation invariant conflicted |
| `410` | Retained conversation expired |
| `429` | Preset rate limit exceeded |

## Key rotation

Updating a preset's public key invalidates tokens signed by the old private key. For rotation without an abrupt cutover, create a replacement preset/key pair, deploy its private key and public SDK tuple, move traffic to it, then disable and remove the old preset after its short-lived tokens have expired. Never reuse a private key across unrelated customers or trust boundaries.
