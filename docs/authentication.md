# Authentication

## Overview

There are three parties:

1. The browser application using `@opsrabbit/chat`.
2. The customer's trusted backend, which already knows the signed-in application user.
3. OpsRabbit, which verifies the Embedded Chat token and applies runtime authorization.

The browser asks the customer backend for a short-lived JWT. The customer backend signs it with the private key corresponding to the public key saved in the OpsRabbit Embedded Chat preset. The browser passes the token to OpsRabbit through the SDK.

```text
Browser -> customer backend: authenticated request for a chat token
Customer backend -> browser: short-lived RS256 JWT
Browser -> OpsRabbit: Bearer JWT through @opsrabbit/chat
OpsRabbit: verifies token, origin, preset, tenant, agent, identity and grants
```

## Required claims

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

- `aud` must be the OpsRabbit Embedded Chat audience string or an audience array containing that value. Prefer the single string unless the customer identity design requires multiple audiences.
- `exp - iat` must not exceed the preset's configured token TTL.
- `widget_client_id`, `tenant_id`, and `agent_name` must exactly match the enabled preset and SDK client configuration, and the widget service principal must independently retain `use` access to that agent.
- `external_user_id` must be a stable identifier from the customer identity system. Do not use a mutable display name or email address as the identifier.
- `external_display_name` is optional attribution, not authority.

The server may reject tokens whose issue time is in the future, whose lifetime exceeds policy, or whose external id uses a reserved preview namespace.

## Token endpoint requirements

The endpoint that supplies tokens to `getAccessToken` must:

- require the application's normal authenticated session;
- authorize use of the intended OpsRabbit tenant/agent integration;
- derive `external_user_id` from the session, never an untrusted browser body;
- sign only on the backend;
- return `Cache-Control: no-store`;
- avoid including the token in URLs, redirects, logs, analytics, or error messages; and
- rate-limit issuance appropriately.

See the [token server example](../examples/token-server/README.md). Its environment variable names are example-application configuration, not new OpsRabbit product configuration.

## Revocation and expiry

The SDK gets a token for each call, allowing the customer backend to stop issuance immediately. OpsRabbit independently revalidates the enabled widget, tenant, entitlement, service principal, agent use permission, exact conversation binding, and thread grant. Existing streams retain only the authority represented by their authenticated connection and host runtime checks; applications should reconnect with a new token when resuming.

## CORS and origins

Configure every production frontend origin in the Embedded Chat preset. Do not use wildcard production origins. CORS and origin checks reduce misuse from other browser origins, but they do not replace JWT verification or resource authorization.
