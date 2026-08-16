# CONTEXT

**Current Task**: Configure CI-based npm trusted publishing.

**Key Decisions**:
- The deploy workflow uses GitHub OIDC (`id-token: write`) and the `npm-publish` environment.
- Integration tests must pass before tagged releases deploy.
- Windows runs npm through the command shell; all CI matrix jobs pass.

**Next Steps**:
- Configure npm Trusted Publisher for `iobroker.davis` after its initial npm publication.
- Create and push the next release tag to trigger CI deployment.
- Redeploy and verify clear-sky behavior around 07:00 and after 08:15.
