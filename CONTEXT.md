# CONTEXT

**Current Task**: Fix remaining adapter-checker items after v0.0.16.

**Key Decisions**:
- `common.nogit` (lowercase) is the schema-valid flag; `noGit` is rejected.
- Switched to `@tsconfig/node22` and added `"types": ["node", "mocha"]`.
- `manual-review` is back in `.releaseconfig.json`; Dependabot auto-merge workflow added.

**Next Steps**:
- W4001 stays until ioBroker.repositories PR #6466 is merged.
