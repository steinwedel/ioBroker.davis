# CONTEXT

**Current Task**: Publish version 0.0.14 and enable CI-based npm trusted publishing.

**Key Decisions**:
- Version 0.0.14 is published as npm `latest`.
- npm Trusted Publisher authorizes `steinwedel/ioBroker.davis` via `test-and-release.yml` and the `npm-publish` environment.
- Integration tests must pass before tagged releases deploy.

**Next Steps**:
- Create and push the next release tag to validate OIDC publishing.
- Redeploy and verify clear-sky behavior around 07:00 and after 08:15.
