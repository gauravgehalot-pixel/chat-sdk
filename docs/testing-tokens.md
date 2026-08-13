# Development token helpers

JWT signing belongs on a trusted backend. These examples are for local development, tests, and server prototypes. They must never run in a browser or ship a private key in frontend assets.

## Node.js helper

The Node-only entry point has no third-party runtime dependency:

```ts
import { createTestingToken } from "@opsrabbit/chat/testing";

const token = createTestingToken({
  privateKey: process.env.EXAMPLE_OPSRABBIT_CHAT_PRIVATE_KEY!,
  widgetId: "ecw_support",
  externalUserId: authenticatedUser.id,
  externalDisplayName: authenticatedUser.displayName,
  tenantId: "tenant-a",
  agentName: "support-agent",
  expiresInSeconds: 300,
});
```

Return `{ token }` from an authenticated `POST` endpoint with `Cache-Control: no-store, private`. The helper limits tokens to at most one hour; use a lifetime no longer than the OpsRabbit preset TTL.

## Python

```bash
python -m pip install "PyJWT[crypto]>=2.10,<3"
```

```py
import os
import time
import jwt

def create_opsrabbit_chat_token(user_id: str, display_name: str | None = None) -> str:
    now = int(time.time())
    claims = {
        "aud": "opsrabbit-embedded-chat", "iat": now, "exp": now + 300,
        "widget_client_id": "ecw_support", "external_user_id": user_id,
        "tenant_id": "tenant-a", "agent_name": "support-agent",
    }
    if display_name:
        claims["external_display_name"] = display_name
    return jwt.encode(claims, os.environ["EXAMPLE_OPSRABBIT_CHAT_PRIVATE_KEY"],
                      algorithm="RS256", headers={"typ": "JWT"})
```

Derive `user_id` from the authenticated server session—not a browser request field. Keep tenant, widget, and agent selection in server-owned configuration, authorize the integration, rate-limit issuance, and never log the token or private key.
