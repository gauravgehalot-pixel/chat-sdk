# Releasing

Every merge to `main` runs `.github/workflows/publish.yml`. The workflow publishes only when the version in `package.json` is not already present on npm, so release PRs must include the intended SemVer change. Versions before 1.0 use the `beta` dist-tag.

If npm has not yet reserved `@opsrabbit/chat`, an OpsRabbit npm owner must add a narrowly scoped, short-lived npm automation token as the `NPM_TOKEN` secret in the protected GitHub `npm` environment for the first merge. The token must be limited to creating/publishing this public package and removed immediately after `0.1.0` is published. Do not store it as a repository-wide secret.

After the package exists, configure `Ops-Rabbit/chat-sdk` and `publish.yml` as its exact npm Trusted Publisher, remove `NPM_TOKEN`, and disable traditional-token publishing for the package. Subsequent releases authenticate through GitHub OIDC and publish with provenance.

Protect the GitHub `npm` environment with required reviewers and restrict deployment to protected `v*` tags. Limit tag creation to release maintainers. If the package was reserved through an npm organization-side flow instead, verify that it exists and that the exact trusted publisher is active before tagging.

The workflow reruns the complete quality and packed-consumer gate before publication. Protect the `npm` environment with required reviewers so a merge cannot publish until a release owner approves the deployment.
