# Scope Sharing & Collaboration Rules

- `ScopeShare` defines user permissions (viewer/editor) per scope.
- Task CRUD, completion, and delete actions are governed by these roles:
  - `editor` and `owner` can edit tasks.
  - Only `owner` can delete tasks or manage integrations.
- Shared users may configure their own GitHub integration, independent of the owner.
- If they select the same repository, their GitHub label and project settings follow the owner’s configuration.
- UI must display collaborator states (pending, accepted, revoked) consistently via the share modal.
