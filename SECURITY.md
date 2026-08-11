# Security Policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting for this repository. Include the affected SDK version, reproduction, expected impact, and any relevant OpsRabbit server version.

## Security boundary

`@opsrabbit/chat` is an untrusted browser client. It does not authenticate users, mint or verify JWTs, authorize agents or threads, or enforce tenant isolation. Those decisions belong to the customer backend and OpsRabbit host.

Applications must:

- authenticate their own user before issuing a chat token;
- mint short-lived RS256 tokens only on a trusted backend;
- keep the signing private key and OpsRabbit credentials out of browser bundles;
- use a stable, non-secret external user identifier;
- configure exact allowed browser origins in OpsRabbit;
- avoid logging tokens, prompts, messages, citations, or full provider responses unnecessarily; and
- treat browser storage, analytics, crash reporting, and exports as additional customer-controlled copies with their own retention obligations.

The SDK requests a token for each operation and does not persist it. It accepts only HTTPS OpsRabbit URLs, except for loopback development. It maps only the documented scrubbed event contract and bounds event-stream memory.

Origin validation is containment, not authentication. OpsRabbit also verifies signature, audience, timestamps, widget, tenant, agent, external identity, entitlement, service-principal state, resource grants, and retention.
