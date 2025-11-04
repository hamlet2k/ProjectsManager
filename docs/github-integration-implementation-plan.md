# GitHub Integration UI Enhancement Implementation Plan

## Overview

This document provides a detailed implementation plan to fix the GitHub integration UI visibility problem. The solution ensures that when GitHub integration is disabled, informational elements remain visible in read-only mode while actionable controls are properly disabled.

## Implementation Strategy

### Phase 1: Backend State Management

#### 1.1 Enhanced Scope State Calculation

**File**: `services/scope_service.py`
**Function**: `apply_scope_github_state()`

**Current Issue**: Line 281 uses OR logic that doesn't handle read-only state properly.

**Solution**: Replace with state-aware logic:

```python
def apply_scope_github_state(scope: Scope | None, current_user: User | None) -> ScopeGitHubState:
    """Attach derived GitHub attributes to the supplied scope for presentation."""
    
    state = compute_scope_github_state(scope, current_user)
    if scope is None:
        return state

    # DEBUG LOGGING: Add logging to track GitHub state decisions
    import logging
    logger = logging.getLogger(__name__)
    
    global_enabled = getattr(current_user, 'github_integration_enabled', False)
    scope_enabled = bool(state.effective_config and state.effective_config.github_integration_enabled)
    has_linked_tasks = any(getattr(task, "github_issue_number", None) for task in (getattr(scope, "tasks", None) or []))
    owner_repo_label = None
    if state.owner_config and state.owner_config.github_repo_owner and state.owner_config.github_repo_name:
        owner_repo_label = f"{state.owner_config.github_repo_owner}/{state.owner_config.github_repo_name}"
    
    logger.debug(f"GitHub state for scope {scope.id}, user {current_user.id}: global_enabled={global_enabled}, scope_enabled={scope_enabled}, has_linked_tasks={has_linked_tasks}, owner_repo_label={owner_repo_label}")

    effective = state.effective_config
    user_config = state.user_config or effective

    scope.github_state = state
    scope.github_config = user_config
    scope.github_owner_config = state.owner_config
    
    # NEW: Compute the effective UI state
    if not global_enabled:
        scope.github_integration_enabled = False
        scope.github_ui_state = "read-only"
        scope.github_ui_message = "GitHub integration disabled globally"
    elif not scope_enabled:
        scope.github_integration_enabled = False
        scope.github_ui_state = "read-only"
        scope.github_ui_message = "GitHub integration disabled for this scope"
    else:
        scope.github_integration_enabled = True
        scope.github_ui_state = "enabled"
        scope.github_ui_message = "GitHub integration enabled"

    # Repository and project information (always show if configured)
    if state.integration_enabled and effective:
        scope.github_repo_id = effective.github_repo_id
        scope.github_repo_name = effective.github_repo_name
        scope.github_repo_owner = effective.github_repo_owner
        scope.github_project_id = effective.github_project_id
        scope.github_project_name = effective.github_project_name
    else:
        scope.github_repo_id = None
        scope.github_repo_name = None
        scope.github_repo_owner = None
        scope.github_project_id = None
        scope.github_project_name = None

    # Milestone information
    milestone_source = state.user_config or effective
    if milestone_source and milestone_source.github_milestone_number and milestone_source.github_milestone_title:
        scope.github_milestone_number = milestone_source.github_milestone_number
        scope.github_milestone_title = milestone_source.github_milestone_title
    else:
        scope.github_milestone_number = None
        scope.github_milestone_title = None

    # UI visibility logic - show if there's any GitHub context
    scope.show_github_badge = bool(has_linked_tasks or owner_repo_label or scope.github_integration_enabled)
    
    # Set appropriate icon and tooltip based on state
    if scope.github_ui_state == "read-only":
        scope.github_badge_icon = "bi bi-eye-slash"
        scope.github_badge_tooltip = scope.github_ui_message
    elif scope.github_ui_state == "enabled":
        # Existing logic for repo differentiation
        is_owner = bool(current_user and scope.owner_id == current_user.id)
        repo_differs = False
        user_repo_label = None
        if state.user_config and state.user_config.github_repo_owner and state.user_config.github_repo_name:
            user_repo_label = f"{state.user_config.github_repo_owner}/{state.user_config.github_repo_name}"
        
        if not is_owner and user_repo_label and owner_repo_label:
            repo_differs = user_repo_label != owner_repo_label
        
        scope.github_badge_icon = "bi bi-pencil" if repo_differs else "bi bi-github"
        
        if user_repo_label:
            scope.github_badge_tooltip = f"Repository: {user_repo_label}"
        elif owner_repo_label:
            scope.github_badge_tooltip = f"Owner repository: {owner_repo_label}"
        else:
            scope.github_badge_tooltip = "GitHub integration enabled"
    else:
        scope.github_badge_icon = "bi bi-github"
        scope.github_badge_tooltip = "No GitHub integration"

    # Existing logic for other properties
    scope.github_repository_locked = False
    scope.github_project_locked = False
    scope.github_label_locked = False

    owner_display_name = _scope_owner_display_name(scope)
    if not owner_display_name:
        owner_display_name = getattr(scope, "owner_name", "") or (
            f"User {scope.owner_id}" if getattr(scope, "owner_id", None) else ""
        )
    scope.owner_display_name = owner_display_name
    scope.owner_name = owner_display_name

    is_owner = bool(current_user and scope.owner_id == current_user.id)
    scope.is_owner_current_user = is_owner
    scope.has_github_linked_tasks = has_linked_tasks

    # Repository labels
    scope.owner_repository_label = owner_repo_label or ""
    scope.user_repository_label = user_repo_label or ""

    if owner_repo_label:
        owner_repo_message = f"Owner repository: {owner_repo_label}"
    else:
        owner_repo_message = "Owner repository: Not configured."
    scope.owner_repository_message = owner_repo_message

    show_owner_repo_line = bool(
        not is_owner
        and (
            has_linked_tasks
            or owner_repo_label
            or scope_enabled
        )
    )
    scope.show_owner_repository_line = show_owner_repo_line

    scope.show_shared_badge = bool(not is_owner)
    shared_owner_label = owner_display_name or ""
    if scope.show_shared_badge and not shared_owner_label:
        shared_owner_label = "Unknown owner"
    scope.shared_badge_tooltip = (
        f"Owner: {shared_owner_label}" if scope.show_shared_badge else ""
    )

    logger.debug(f"Final GitHub UI state for scope {scope.id}: show_github_badge={scope.show_github_badge}, github_ui_state={scope.github_ui_state}, github_integration_enabled={scope.github_integration_enabled}")

    return state
```

#### 1.2 Global Integration State Propagation

**File**: `app.py`
**Function**: `settings()` route (lines 410-467)

**Add new function**:

```python
def propagate_global_github_state(user: User, enabled: bool) -> None:
    """Propagate global GitHub integration state to all user's scope configurations."""
    from services.scope_service import get_scope_github_config
    
    updated_count = 0
    for scope in user.owned_scopes:
        config = get_scope_github_config(scope, user)
        if config and config.github_integration_enabled != enabled:
            config.github_integration_enabled = enabled
            updated_count += 1
    
    if updated_count > 0:
        try:
            db.session.commit()
            app.logger.info(f"Propagated global GitHub state to {updated_count} scopes for user {user.id}")
        except SQLAlchemyError as e:
            db.session.rollback()
            app.logger.error(f"Failed to propagate GitHub state: {e}")
            raise
```

**Update settings route**:

```python
@app.route("/settings", methods=["GET", "POST"])
def settings():
    """Application settings page for integrations"""
    github_form = GitHubSettingsForm()

    if github_form.remove_token.data and github_form.validate_on_submit():
        if g.user.github_token_encrypted:
            g.user.set_github_token(None)
            g.user.github_integration_enabled = False
            # NEW: Propagate to all scopes
            propagate_global_github_state(g.user, False)
            try:
                db.session.commit()
                flash("GitHub token removed. Integration is disabled until a new token is added.", "info")
            except SQLAlchemyError as e:
                db.session.rollback()
                flash(f"Unable to remove GitHub token: {str(e)}", "error")
        else:
            flash("No GitHub token to remove.", "warning")
        return redirect(url_for("settings"))

    if not github_form.is_submitted():
        github_form.enabled.data = g.user.github_integration_enabled

    if github_form.submit.data and github_form.validate_on_submit():
        token_input = (github_form.token.data or "").strip()
        if github_form.enabled.data:
            token_to_use = token_input or g.user.get_github_token()
            if not token_to_use:
                github_form.token.errors.append("Token is required when enabling integration.")
            if not github_form.errors:
                if token_input:
                    g.user.set_github_token(token_input)
                g.user.github_integration_enabled = True
                # NEW: Propagate to all scopes
                propagate_global_github_state(g.user, True)
                try:
                    db.session.commit()
                    flash("GitHub settings saved.", "success")
                    return redirect(url_for("settings"))
                except SQLAlchemyError as e:
                    db.session.rollback()
                    flash(f"An error occurred: {str(e)}", "error")
        else:
            # NEW: Add confirmation check for disabling
            disable_confirmed = request.form.get('confirm_disable') == 'true'
            if not disable_confirmed:
                # Show confirmation modal instead of disabling
                return render_template(
                    "settings.html",
                    github_form=github_form,
                    github_token_present=bool(g.user.github_token_encrypted),
                    show_disable_confirmation=True
                )
            
            g.user.github_integration_enabled = False
            # NEW: Propagate to all scopes
            propagate_global_github_state(g.user, False)
            try:
                db.session.commit()
                flash("GitHub integration disabled. All connected scopes are now read-only.", "info")
                return redirect(url_for("settings"))
            except SQLAlchemyError as e:
                db.session.rollback()
                flash(f"An error occurred: {str(e)}", "error")

    token_present = bool(g.user.github_token_encrypted)

    return render_template(
        "settings.html",
        github_form=github_form,
        github_token_present=token_present,
    )
```

### Phase 2: Frontend UI Updates

#### 2.1 Settings Page Confirmation Modal

**File**: `templates/settings.html`

**Add confirmation modal**:

```html
<!-- Add after existing GitHub settings form -->
<div class="modal fade" id="githubDisableConfirmModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Disable GitHub Integration?</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <div class="alert alert-warning">
                    <i class="bi bi-exclamation-triangle-fill me-2"></i>
                    <strong>Warning:</strong> Disabling your GitHub integration will also disable all GitHub-connected scopes.
                </div>
                <p>Your tasks and configuration data will remain visible but read-only. You will still see existing issue numbers, milestones, and repository information, but you won't be able to perform GitHub actions until re-enabled.</p>
                <ul class="mb-0">
                    <li>All scope-level GitHub integrations will be disabled</li>
                    <li>GitHub sync buttons will be hidden</li>
                    <li>Existing links and information will remain visible</li>
                    <li>You can re-enable integration later to restore full functionality</li>
                </ul>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-warning" id="confirmDisableGithub">Disable Integration</button>
            </div>
        </div>
    </div>
</div>

<!-- Add JavaScript for confirmation handling -->
<script>
document.addEventListener('DOMContentLoaded', function() {
    const githubForm = document.getElementById('github-settings-form');
    const disableModal = new bootstrap.Modal(document.getElementById('githubDisableConfirmModal'));
    const confirmButton = document.getElementById('confirmDisableGithub');
    
    // Intercept form submission when disabling
    if (githubForm) {
        githubForm.addEventListener('submit', function(e) {
            const enabledField = githubForm.querySelector('input[name="enabled"]');
            const submitButton = githubForm.querySelector('button[type="submit"]');
            
            // Check if this is a disable action
            if (enabledField && !enabledField.checked && submitButton && submitButton.name === 'submit') {
                e.preventDefault();
                
                // Show confirmation modal
                disableModal.show();
                
                // Handle confirmation
                confirmButton.onclick = function() {
                    // Add hidden field to confirm disable
                    const confirmField = document.createElement('input');
                    confirmField.type = 'hidden';
                    confirmField.name = 'confirm_disable';
                    confirmField.value = 'true';
                    githubForm.appendChild(confirmField);
                    
                    // Submit the form
                    githubForm.submit();
                };
            }
        });
    }
});
</script>
```

#### 2.2 Scope Template Updates

**File**: `templates/scope.html`

**Update GitHub badge display (around lines 44-56)**:

```html
<!-- Replace existing GitHub badge section -->
{% if scope.show_github_badge %}
<div class="github-badge-container" data-github-state="{{ scope.github_ui_state or 'unknown' }}">
    <span class="badge bg-light text-dark github-badge {% if scope.github_ui_state == 'read-only' %}github-badge-read-only{% endif %}"
          {% if scope.github_badge_tooltip %}title="{{ scope.github_badge_tooltip }}" data-bs-toggle="tooltip"{% endif %}>
        <i class="{{ scope.github_badge_icon }}"></i>
        {% if scope.github_ui_state == 'read-only' %}
            <i class="bi bi-lock-fill ms-1"></i>
        {% endif %}
        GitHub
    </span>
    
    {% if scope.owner_repository_label %}
    <small class="text-muted ms-2">
        {{ scope.owner_repository_label }}
        {% if scope.github_ui_state == 'read-only' %}
        <i class="bi bi-eye-slash ms-1" title="Read-only - integration disabled"></i>
        {% endif %}
    </small>
    {% endif %}
</div>
{% endif %}
```

**Add CSS for read-only state**:

```html
<style>
.github-badge-read-only {
    opacity: 0.6;
    border-style: dashed !important;
}

.github-badge-read-only:hover {
    opacity: 0.7 !important;
    cursor: not-allowed !important;
}

[data-github-state="read-only"] .github-action-btn {
    display: none;
}

[data-github-state="read-only"] .github-interactive-element {
    pointer-events: none;
    opacity: 0.6;
}
</style>
```

#### 2.3 Task Template Updates

**File**: `templates/task.html`

**Update GitHub issue badge display (around lines 154-196)**:

```html
<!-- Update existing GitHub issue badge -->
<a href="{{ task.github_issue_url }}" 
   class="github-issue-badge {% if not github_enabled %}github-issue-read-only{% endif %}"
   target="_blank" 
   rel="noopener"
   {% if not github_enabled %}style="pointer-events: none; opacity: 0.6;"{% endif %}>
    <i class="bi bi-github"></i>
    #{{ task.github_issue_number }}
    {% if not github_enabled %}
    <i class="bi bi-lock-fill ms-1" title="GitHub integration disabled"></i>
    {% endif %}
</a>
```

**Update milestone pill display (around lines 206-254)**:

```html
<!-- Update existing milestone pill -->
{% if task.github_milestone_number %}
<span class="github-milestone-pill {% if not github_enabled %}github-milestone-read-only{% endif %}"
      {% if not github_enabled %}style="pointer-events: none; opacity: 0.6;"{% endif %}>
    <i class="bi bi-flag"></i>
    {{ task.github_milestone_title }}
    {% if not github_enabled %}
    <i class="bi bi-lock-fill ms-1" title="GitHub integration disabled"></i>
    {% endif %}
</span>
{% endif %}
```

**Add CSS for task-level read-only elements**:

```html
<style>
.github-issue-read-only,
.github-milestone-read-only {
    opacity: 0.6;
    cursor: not-allowed;
    text-decoration: none !important;
}

.github-issue-read-only:hover,
.github-milestone-read-only:hover {
    opacity: 0.7 !important;
    background-color: var(--bs-light) !important;
    color: var(--bs-secondary) !important;
}
</style>
```

#### 2.4 JavaScript Updates

**File**: `static/js/scope_form.js`

**Update GitHub section visibility logic (around line 395)**:

```javascript
function updateGithubSectionVisibility() {
    const githubEnabled = $('#github_enabled').prop('checked');
    const hasToken = {{ github_token_present|tojson }};
    
    // Get current UI state from server if available
    const githubState = $('#github-ui-state').val() || 'unknown';
    
    $('.github-section').toggleClass('d-none', !githubEnabled && !hasToken);
    $('.github-required').toggleClass('d-none', githubEnabled);
    
    // Add read-only state handling
    if (githubState === 'read-only') {
        $('.github-action-btn').addClass('disabled').prop('disabled', true);
        $('.github-interactive').addClass('github-readonly');
        $('.github-readonly-message').removeClass('d-none');
    } else {
        $('.github-action-btn').removeClass('disabled').prop('disabled', false);
        $('.github-interactive').removeClass('github-readonly');
        $('.github-readonly-message').addClass('d-none');
    }
    
    updateGithubBadgeTooltips();
}
```

### Phase 3: Database Migration (if needed)

**File**: `migrations/versions/`

**Create new migration** to add any missing indexes or constraints:

```python
"""Add GitHub UI state tracking

Revision ID: github_ui_state_tracking
Revises: 202510200001_postgres_alignment
Create Date: 2025-10-23 07:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = 'github_ui_state_tracking'
down_revision = '202510200001_postgres_alignment'
branch_labels = None
depends_on = None

def upgrade():
    # Add indexes for performance if not already present
    op.create_index('ix_scope_github_config_user_scope', 'scope_github_config', ['user_id', 'scope_id'], unique=False)
    op.create_index('ix_scope_github_config_enabled', 'scope_github_config', ['github_integration_enabled'], unique=False)

def downgrade():
    op.drop_index('ix_scope_github_config_enabled', table_name='scope_github_config')
    op.drop_index('ix_scope_github_config_user_scope', table_name='scope_github_config')
```

## Testing Strategy

### 1. Unit Tests
- Test `apply_scope_github_state()` with various combinations
- Test `propagate_global_github_state()` functionality
- Test UI state calculations

### 2. Integration Tests
- Test global disable/enable with existing scopes
- Test scope-level disable/enable
- Verify read-only behavior for linked tasks

### 3. Manual Testing Scenarios
1. **Global Disable Test**:
   - Create scopes with GitHub integration
   - Disable global integration
   - Verify all scopes show read-only state
   - Verify confirmation modal appears

2. **Scope Disable Test**:
   - Disable integration for a single scope
   - Verify only that scope is read-only
   - Verify other scopes remain functional

3. **Task Display Test**:
   - Create tasks with GitHub links
   - Disable integration
   - Verify issue numbers and milestones remain visible
   - Verify they're non-interactive

## Rollback Plan

If issues arise:
1. Revert `apply_scope_github_state()` changes
2. Remove confirmation modal
3. Restore original visibility logic
4. Keep database changes (they're additive)

## Success Metrics

1. ✅ Global integration disable affects all scopes
2. ✅ GitHub information remains visible when disabled
3. ✅ Interactive elements are properly disabled
4. ✅ Confirmation dialogs prevent accidental changes
5. ✅ Visual differentiation between states
6. ✅ No GitHub API calls when integration is disabled