# GitHub Integration & Sync Rules

- GitHub configuration is stored per user per scope.
  - Use `ScopeGitHubConfig` for all user-specific configuration (token, repo, project, milestone, label).
  - The global user token must never be used when integration is disabled.
- If a user disables GitHub integration:
  - UI elements remain visible but read-only (issue ID, milestone pill).
  - No GitHub API calls may occur.
- When GitHub integration is re-enabled:
  - All configurations and links must persist.
  - Tasks should automatically regain sync capabilities.
- Hidden label synchronization:
  - Each scope’s hidden label is shared across users only when they use the same repository.
  - Otherwise, label configuration is independent.
