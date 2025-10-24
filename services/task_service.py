"""Helpers for working with task-specific GitHub configuration."""

from __future__ import annotations

from typing import Iterable

from database import db
from models.task import Task
from models.task_github_config import TaskGitHubConfig
from models.user import User


def _iter_task_configs(task: Task | None) -> Iterable[TaskGitHubConfig]:
    if task is None:
        return ()
    configs = getattr(task, "github_configs", None)
    if configs is None:
        return ()
    return tuple(configs)


def _lookup_config(task: Task | None, user_id: int | None) -> TaskGitHubConfig | None:
    if task is None or user_id is None:
        return None
    for config in _iter_task_configs(task):
        if config.user_id == user_id:
            return config
    return TaskGitHubConfig.query.filter_by(task_id=task.id, user_id=user_id).one_or_none()


def get_task_owner_github_config(task: Task | None) -> TaskGitHubConfig | None:
    if task is None:
        return None
    return _lookup_config(task, task.owner_id)


def get_task_github_config(task: Task | None, user: User | None) -> TaskGitHubConfig | None:
    if task is None:
        return None
    if user is not None:
        config = _lookup_config(task, user.id)
        if config is not None:
            return config
    return get_task_owner_github_config(task)


def get_task_github_config_for_user(task: Task | None, user: User | None) -> TaskGitHubConfig | None:
    if task is None or user is None:
        return None
    return _lookup_config(task, user.id)


def ensure_task_github_config(task: Task, user: User) -> TaskGitHubConfig:
    config = _lookup_config(task, user.id)
    if config is not None:
        return config
    config = TaskGitHubConfig(task=task, user_id=user.id)
    db.session.add(config)
    if hasattr(task, "github_configs") and task.github_configs is not None:
        task.github_configs.append(config)
    if hasattr(user, "task_github_configs") and user.task_github_configs is not None:
        user.task_github_configs.append(config)
    return config


def clear_task_github_issue(config: TaskGitHubConfig | None) -> None:
    if config is None:
        return
    config.github_issue_id = None
    config.github_issue_node_id = None
    config.github_issue_number = None
    config.github_issue_url = None
    config.github_issue_state = None
    config.github_repo_id = None
    config.github_repo_name = None
    config.github_repo_owner = None
    config.github_project_id = None
    config.github_project_name = None
    config.github_milestone_number = None
    config.github_milestone_title = None
    config.github_milestone_due_on = None


def task_has_github_issue(task: Task, user: User | None) -> bool:
    config = get_task_github_config(task, user)
    return bool(config and config.has_issue_link())


def task_github_issue_is_open(task: Task, user: User | None) -> bool:
    config = get_task_github_config(task, user)
    return bool(config and config.issue_is_open())
