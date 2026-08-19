# CONTEXT

**Current Task**: Restore green Test-and-Release badge after Dependabot TypeScript 7 PR.

**Key Decisions**:
- Workflow badge is pinned to `branch=main` so failed PR runs do not turn it red.
- Dependabot ignores TypeScript major bumps; PR #3 (TS 7.0.2) was closed.

**Next Steps**:
- W4001 stays until ioBroker.repositories PR #6466 is merged.
