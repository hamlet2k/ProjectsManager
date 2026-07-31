"""Unit tests for shared repository GitHub configuration logic."""

from models.scope_github_config import ScopeGitHubConfig
from services.scope_service import (
    detach_shared_repository_configs,
    propagate_owner_github_configuration,
)


class DummyScope:
    """Minimal scope-like object for service helpers."""

    def __init__(self, configs):
        self.github_configs = list(configs)


class ConfigStub:
    """Lightweight clone of ScopeGitHubConfig behaviour for unit tests."""

    shares_repository_with = ScopeGitHubConfig.shares_repository_with
    clone_repository_metadata_from = ScopeGitHubConfig.clone_repository_metadata_from
    clone_project_and_label_from = ScopeGitHubConfig.clone_project_and_label_from
    clone_milestone_from = ScopeGitHubConfig.clone_milestone_from
    mark_as_shared_with = ScopeGitHubConfig.mark_as_shared_with
    mark_as_detached_from = ScopeGitHubConfig.mark_as_detached_from
    clear_shared_flags = ScopeGitHubConfig.clear_shared_flags
    is_linked_to = ScopeGitHubConfig.is_linked_to

    def __init__(self, **attrs):
        defaults = {
            "scope_id": None,
            "user_id": None,
            "github_repo_id": None,
            "github_repo_owner": None,
            "github_repo_name": None,
            "github_integration_enabled": False,
            "github_project_id": None,
            "github_project_name": None,
            "github_milestone_number": None,
            "github_milestone_title": None,
            "github_label_name": None,
            "is_shared_repo": False,
            "source_user_id": None,
            "is_detached": False,
        }
        defaults.update(attrs)
        for key, value in defaults.items():
            setattr(self, key, value)


def _config_instance(**attrs) -> ConfigStub:
    return ConfigStub(**attrs)


def _owner_config() -> ScopeGitHubConfig:
    return _config_instance(
        scope_id=1,
        user_id=1,
        github_repo_id=123,
        github_repo_owner="octocat",
        github_repo_name="project",
        github_integration_enabled=True,
        github_project_id="proj",
        github_project_name="Main",
        github_milestone_number=7,
        github_milestone_title="Release",
        github_label_name="team",
    )


def test_is_linked_to_owner_requires_shared_flags():
    """Configs only report linked when shared flags and repository match."""

    owner = _owner_config()
    collaborator = _config_instance(
        scope_id=1,
        user_id=2,
        github_repo_id=123,
        github_repo_owner="OctoCat",
        github_repo_name="Project",
    )
    collaborator.mark_as_shared_with(owner)
    assert collaborator.is_linked_to(owner)

    collaborator.is_detached = True
    assert not collaborator.is_linked_to(owner)

    collaborator.is_detached = False
    collaborator.github_repo_name = "other"
    collaborator.github_repo_id = 999
    assert not collaborator.is_linked_to(owner)


def test_propagate_owner_configuration_links_collaborators():
    """Owner updates propagate repository metadata to collaborators."""

    owner = _owner_config()
    collaborator = _config_instance(
        scope_id=1,
        user_id=2,
        github_repo_owner="octocat",
        github_repo_name="project",
    )
    collaborator.github_integration_enabled = False
    scope = DummyScope([owner, collaborator])

    propagate_owner_github_configuration(scope, owner)

    assert collaborator.is_shared_repo is True
    assert collaborator.is_detached is False
    assert collaborator.source_user_id == owner.user_id
    assert collaborator.github_integration_enabled is True
    assert collaborator.github_project_id == owner.github_project_id
    assert collaborator.github_project_name == owner.github_project_name
    assert collaborator.github_milestone_number == owner.github_milestone_number
    assert collaborator.github_milestone_title == owner.github_milestone_title
    assert collaborator.github_label_name == owner.github_label_name


def test_propagate_owner_configuration_clears_old_shares():
    """Shared flags are cleared when collaborator switches repositories."""

    owner = _owner_config()
    collaborator = _config_instance(
        scope_id=1,
        user_id=2,
        github_repo_owner="someone",
        github_repo_name="else",
        is_shared_repo=True,
        source_user_id=owner.user_id,
    )
    scope = DummyScope([owner, collaborator])

    propagate_owner_github_configuration(scope, owner)

    assert collaborator.is_shared_repo is False
    assert collaborator.is_detached is False
    assert collaborator.source_user_id is None


def test_detach_shared_repository_configs_preserves_snapshot():
    """Collaborators keep the owner's state when integration is disabled."""

    owner = _owner_config()
    collaborator = _config_instance(
        scope_id=1,
        user_id=2,
        github_repo_owner="octocat",
        github_repo_name="project",
        github_project_id="old",
        github_project_name="Legacy",
        github_milestone_number=1,
        github_milestone_title="Legacy",
        github_label_name="legacy",
        is_shared_repo=True,
        source_user_id=owner.user_id,
    )
    scope = DummyScope([owner, collaborator])

    detach_shared_repository_configs(scope, owner)

    assert collaborator.is_shared_repo is False
    assert collaborator.is_detached is True
    assert collaborator.source_user_id == owner.user_id
    assert collaborator.github_repo_name == owner.github_repo_name
    assert collaborator.github_repo_owner == owner.github_repo_owner
    assert collaborator.github_project_id == owner.github_project_id
    assert collaborator.github_label_name == owner.github_label_name
    assert collaborator.github_integration_enabled == owner.github_integration_enabled
