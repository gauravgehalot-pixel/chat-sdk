# Releasing

Releases use npm Trusted Publishing from `.github/workflows/publish.yml`; there is deliberately no repository npm token fallback.

Before the first release, configure the `@opsrabbit/chat` package on npm with `Ops-Rabbit/chat-sdk` and `publish.yml` as its trusted publisher. Protect the GitHub `npm` environment with required reviewers and restrict deployment to protected `v*` tags. Limit tag creation to release maintainers.

The workflow verifies that the tag exactly equals `v<package version>`, reruns the complete quality and packed-consumer gate, and publishes with provenance. Versions before 1.0 use the `beta` dist-tag so they do not replace npm's default `latest` release.
