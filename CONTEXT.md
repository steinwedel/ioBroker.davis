# CONTEXT

**Current Task**: Clear remaining ioBroker adapter-checker warnings and suggestions.

**Key Decisions**:
- Changelog lives in README.md; older entries are in CHANGELOG_OLD.md (no CHANGELOG.md).
- Admin i18n converted to short format (`admin/i18n/{lang}.json`).
- Added Dependabot plus release-script plugins `license@5.2.2` and `manual-review`.

**Next Steps**:
- Push so checker re-runs against the new CI (W3052 is stale run #9).
- W4001 stays until ioBroker.repositories PR #6466 is merged.
