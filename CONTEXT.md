# CONTEXT

**Current Task**: Repair the Windows integration-test bootstrap after releasing 0.0.14.

**Key Decisions**:
- Use `npm.cmd` on Windows; `spawnSync` cannot execute its `.cmd` wrapper as `npm`.
- The integration test bootstraps JS-Controller 7.2.2 because npm blocks its install script in a clean test directory.
- Version 0.0.14 is committed, tagged, and published.

**Next Steps**:
- Watch the GitHub Actions matrix for the Windows CI fix.
- Redeploy and verify clear-sky behavior around 07:00 and after 08:15.
