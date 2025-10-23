# Configurable GitHub Label per Scope

## Overview

This feature enhances the GitHub integration to make the **hidden synchronization label configurable per user per scope**, ensuring that label updates propagate to GitHub for each user's configured repository.

Previously, all GitHub issues created from ProjectsManager included a globally hardcoded hidden label `#ProjectsManager`. Now that GitHub configurations are stored in the `ScopeGitHubConfig` table (per user per scope), this feature updates the logic to make the label **editable and user-specific** while maintaining consistency for shared repositories.

## Architecture

### Database Changes

- Added `github_label_name` field to `ScopeGitHubConfig` model
- Migration backfills existing records with appropriate default values
- Label is stored per user per scope configuration

### Backend Changes

#### GitHub Service (`services/github_service.py`)
- Updated `create_issue()` and `update_issue()` to accept configurable app labels
- Added `update_issue_labels()` function for label migration
- Enhanced `ensure_app_label()` to handle custom labels

#### Scope Service (`services/scope_service.py`)
- Added `generate_default_label()` function for automatic label generation
- Added `get_effective_github_label()` for label resolution logic
- Enhanced `propagate_owner_github_configuration()` for label sharing
- Updated serialization to include label data

#### Forms (`forms.py`)
- Added `github_label` field to `ScopeForm` with validation
- Label validation ensures GitHub-compatible format

#### Routes (`routes/scopes.py`)
- Updated scope creation/editing to handle label configuration
- Enhanced form validation to include label processing
- Added label propagation logic for shared repositories

### Frontend Changes

#### Modal Template (`templates/modals/scope_modal.html`)
- Added GitHub label input field with proper validation display
- Conditional visibility based on GitHub integration state
- Read-only display for collaborators sharing repositories

#### JavaScript (`static/js/scope_form.js`)
- Added label field handling in form processing
- Enhanced form validation for label input
- Updated form state management to include label

## User Experience

### For Scope Owners
- Can configure a custom synchronization label per scope
- Label defaults to slugified scope name (e.g., "frontend-ui")
- Label is automatically created in GitHub repository when needed
- Label changes propagate to all existing issues

### For Collaborators
- If using the same repository as owner: sees owner's label as read-only
- If using different repository: can configure their own label independently
- Label management respects sharing permissions

### Label Validation
- Must contain only letters, numbers, hyphens, and underscores
- Maximum 50 characters
- Automatically created in GitHub if it doesn't exist

## API Changes

### Scope Serialization
Added `github_label` field to scope API responses:
```json
{
  "id": 1,
  "name": "Frontend",
  "github_label": "frontend-ui",
  "github_integration_enabled": true,
  ...
}
```

### Form Handling
Added `github_label` field to scope form submissions:
```json
{
  "name": "Frontend",
  "github_enabled": true,
  "github_repository": {"id": 123, "name": "repo", "owner": "user"},
  "github_label": "frontend-ui"
}
```

## Migration Strategy

### Existing Data
- Records with existing `github_hidden_label` values preserve those labels
- Records without labels get automatically generated from scope name
- Migration handles both PostgreSQL and SQLite backends

### Label Propagation
- When owner updates label, collaborators sharing the same repository see the change
- Collaborators using different repositories maintain independent label configurations
- Label changes trigger GitHub API calls to update existing issues

## Error Handling

### GitHub API Failures
- Label creation failures are logged but don't block scope creation
- Label update failures during sync are retried on subsequent operations
- Graceful fallback to default label if custom label creation fails

### Validation Errors
- Real-time validation in the UI for label format
- Clear error messages for invalid label formats
- Form submission blocked until label validation passes

## Testing Scenarios

### Basic Functionality
1. Create scope with custom label
2. Verify label appears in GitHub issues
3. Change label and verify issue updates
4. Create task and verify correct label application

### Sharing Scenarios
1. Owner and collaborator share same repository
2. Verify collaborator sees owner's label as read-only
3. Owner changes label, verify collaborator sees update
4. Collaborator uses different repository, verify independent label

### Edge Cases
1. Invalid label formats rejected
2. Very long labels rejected
3. Special characters in label handling
4. Empty label fallback to default

## Future Enhancements

### Potential Improvements
- Label color customization
- Multiple synchronization labels per scope
- Label analytics and usage tracking
- Bulk label migration tools

### Integration Opportunities
- Label-based task filtering
- Automated label suggestions
- Integration with GitHub label templates
- Label synchronization across multiple repositories

## Security Considerations

- Label names are validated to prevent injection attacks
- GitHub API calls use proper authentication
- Label changes respect user permissions
- No sensitive data stored in label names

## Performance Impact

- Minimal database overhead for additional field
- GitHub API calls only when label changes
- Efficient label caching in scope state
- Optimized label propagation for shared repositories