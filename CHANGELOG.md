# Changelog

All notable changes to `@opsrabbit/chat` are documented here. The project follows Semantic Versioning after the `1.0.0` contract is declared stable.

## 0.2.0 - 2026-08-12

- Added caller-scoped conversation search across titles and persisted user/assistant messages through `conversations.list({ search })`.
- Added immutable `conversations.create({ bindings })` for deterministic, untrusted public plugin-tool context.

## 0.1.0 - 2026-08-11

- Initial headless client for effective configuration, caller-scoped conversation listing and hydration, turn creation, replayable event streaming, stop, steering, one-off approvals, and protected Knowledge citation reads.
- Short-lived token-provider authentication with no SDK token persistence.
- Typed safe HTTP/protocol errors, abort support, bounded SSE parsing, public API documentation, and secure integration examples.
