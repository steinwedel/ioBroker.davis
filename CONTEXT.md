# CONTEXT

**Current Task**: Complete ioBroker "latest" repository submission requirements for davis.

**Key Decisions**:
- v0.0.15 published to npm via OIDC trusted publishing (validated end-to-end on tag push); `bluefox` added as npm co-owner.
- README.md translated to English (mandatory) with manufacturer link; changelog moved to its own CHANGELOG.md.
- GitHub topics set (`iobroker`, `davis`, `weather`, ...); PR opened: ioBroker/ioBroker.repositories#6466 (addToLatest).

**Next Steps**:
- Track/merge ioBroker.repositories PR #6466; then plan forum test thread for stable submission.
- Redeploy and verify clear-sky behavior around 07:00 and after 08:15.
