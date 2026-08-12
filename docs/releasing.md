# Releasing

Every merge to `main` runs `.github/workflows/publish.yml`. The workflow publishes only when the version in `package.json` is not already present on npm, so release PRs must include the intended SemVer change. Versions before 1.0 use the `beta` dist-tag.

`@opsrabbit/chat` now exists on npm. Configure `Ops-Rabbit/chat-sdk` and `publish.yml` as its exact npm Trusted Publisher, keep the `npm` GitHub environment protected, and disable traditional-token publishing for the package. Releases authenticate through GitHub OIDC and publish with provenance; the workflow must not contain an npm token.

Protect the GitHub `npm` environment with required reviewers. Verify that the exact trusted publisher remains active before merging a release version.

The workflow reruns the complete quality and packed-consumer gate before publication. Protect the `npm` environment with required reviewers so a merge cannot publish until a release owner approves the deployment.
