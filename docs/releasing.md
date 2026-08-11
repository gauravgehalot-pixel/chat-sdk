# Releasing

Releases use npm Trusted Publishing from `.github/workflows/publish.yml`; there is deliberately no repository npm token fallback.

If npm has not yet reserved `@opsrabbit/chat` for the organization, an OpsRabbit npm owner must perform the one-time `0.1.0` bootstrap publication interactively with required 2FA, public access, the `beta` tag, and provenance where npm supports it. Do not add an npm token to GitHub. After the package exists, configure `Ops-Rabbit/chat-sdk` and `publish.yml` as its exact trusted publisher and disable traditional-token publishing for the package.

Protect the GitHub `npm` environment with required reviewers and restrict deployment to protected `v*` tags. Limit tag creation to release maintainers. If the package was reserved through an npm organization-side flow instead, verify that it exists and that the exact trusted publisher is active before tagging.

The workflow verifies that the tag exactly equals `v<package version>`, reruns the complete quality and packed-consumer gate, and publishes with provenance. Versions before 1.0 use the `beta` dist-tag so they do not replace npm's default `latest` release.
