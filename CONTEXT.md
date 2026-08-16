# CONTEXT

**Current Task**: Prepare version 0.0.14 for release.

**Key Decisions**:
- The integration test bootstraps JS-Controller 7.2.2 because npm blocks its install script in a clean test directory.
- ESLint ignores Agent Manager worktrees and does not require JSDoc parameter descriptions.
- Release news covers the HTML widget, cloud-cover fix, and wind-direction range changes.

**Next Steps**:
- Redeploy and check `weatherState` at ~07:00 (should be clear / last afternoon value).
- After ~08:15 confirm that the live solar model takes over.
- Commit, tag, and publish 0.0.14 after successful hardware verification.
