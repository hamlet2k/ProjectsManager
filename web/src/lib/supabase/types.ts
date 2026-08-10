export type ShareRole = 'viewer' | 'editor'
export type ShareStatus = 'pending' | 'accepted' | 'revoked' | 'rejected'
export type NotificationType =
  | 'scope_share_invite'
  | 'scope_share_response'
  | 'github_binding_changed'
export type NotificationStatus = 'pending' | 'accepted' | 'rejected' | 'read'
export type AppRole = 'user' | 'admin'
export type ThemePref = 'light' | 'dark' | 'system'

export type Profile = {
  id: string
  username: string
  name: string
  email: string
  role: AppRole
  theme: ThemePref
  github_integration_enabled: boolean
  legacy_id: number | null
  created_at: string
  updated_at: string
}

export type Scope = {
  id: string
  name: string
  description: string | null
  rank: number
  owner_id: string
  legacy_id: number | null
  /**
   * Project feature: show dependency pills / manage UI.
   * When false, app still stores edges but hides the chrome (simpler lists).
   */
  dependencies_enabled?: boolean
  /**
   * Project feature: full Import/Export formats from the copy control.
   * When false, copy actions paste plain checklist text immediately.
   */
  advanced_export_enabled?: boolean
  /**
   * Optional project-specific AI instructions (terminology, domain, how to tag).
   */
  assistant_prompt?: string | null
  created_at: string
  updated_at: string
}

export type ScopeShare = {
  id: string
  scope_id: string
  user_id: string
  inviter_id: string | null
  role: ShareRole
  status: ShareStatus
  legacy_id: number | null
  created_at: string
  updated_at: string
}

export type ScopeInvite = {
  id: string
  scope_id: string
  token: string
  role: ShareRole
  created_by: string
  expires_at: string | null
  max_uses: number | null
  use_count: number
  revoked_at: string | null
  created_at: string
}

export type Task = {
  id: string
  scope_id: string
  parent_task_id: string | null
  owner_id: string | null
  name: string
  description: string | null
  start_date: string | null
  end_date: string | null
  rank: number
  completed: boolean
  completed_date: string | null
  legacy_id: number | null
  created_at: string
  updated_at: string
}

export type Tag = {
  id: string
  scope_id: string
  name: string
  legacy_id: number | null
  created_at: string
}

export type TaskTag = {
  task_id: string
  tag_id: string
}

/**
 * App dependency: blocker_task_id blocks blocked_task_id
 * (same meaning as GitHub "blocked by").
 */
export type TaskDependency = {
  id: string
  scope_id: string
  blocked_task_id: string
  blocker_task_id: string
  created_by: string | null
  created_at: string
}

export type ScopeGitHubConfig = {
  id: string
  scope_id: string
  user_id: string
  github_integration_enabled: boolean
  github_repo_id: number | null
  github_repo_name: string | null
  github_repo_owner: string | null
  github_project_id: string | null
  github_project_name: string | null
  github_milestone_number: number | null
  github_milestone_title: string | null
  github_label_name: string | null
  is_shared_repo: boolean
  source_user_id: string | null
  is_detached: boolean
  /** When true, completing a linked task closes the GitHub issue (if user can mutate). */
  close_issue_on_complete?: boolean
  legacy_id: number | null
  created_at: string
  updated_at: string
}

/** Cached from GitHub issue dependencies (blocked_by). */
export type GitHubBlockedByRef = {
  number: number
  title: string
  html_url: string
  state: string
  repo?: string | null
}

export type TaskGitHubConfig = {
  id: string
  task_id: string
  user_id: string
  github_issue_id: number | null
  github_issue_node_id: string | null
  github_issue_number: number | null
  github_issue_url: string | null
  github_issue_state: string | null
  github_repo_id: number | null
  github_repo_name: string | null
  github_repo_owner: string | null
  github_project_id: string | null
  github_project_name: string | null
  github_milestone_number: number | null
  github_milestone_title: string | null
  github_milestone_due_on: string | null
  /** Issues that block this task's linked issue (from GitHub). */
  github_blocked_by?: GitHubBlockedByRef[] | null
  legacy_id: number | null
  created_at: string
  updated_at: string
}

export type Notification = {
  id: string
  user_id: string
  scope_id: string | null
  share_id: string | null
  notification_type: NotificationType
  title: string
  message: string
  status: NotificationStatus
  requires_action: boolean
  payload: Record<string, unknown>
  legacy_id: number | null
  created_at: string
  updated_at: string
  read_at: string | null
  resolved_at: string | null
}

export type SyncLog = {
  id: string
  task_id: string
  user_id: string | null
  action: string
  status: string
  message: string | null
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Partial<Profile> & Pick<Profile, 'id' | 'username' | 'name' | 'email'>
        Update: Partial<Profile>
        Relationships: []
      }
      scopes: {
        Row: Scope
        Insert: Partial<Scope> & Pick<Scope, 'name' | 'owner_id'>
        Update: Partial<Scope>
        Relationships: []
      }
      scope_shares: {
        Row: ScopeShare
        Insert: Partial<ScopeShare> & Pick<ScopeShare, 'scope_id' | 'user_id'>
        Update: Partial<ScopeShare>
        Relationships: []
      }
      scope_invites: {
        Row: ScopeInvite
        Insert: Partial<ScopeInvite> & Pick<ScopeInvite, 'scope_id' | 'created_by'>
        Update: Partial<ScopeInvite>
        Relationships: []
      }
      tasks: {
        Row: Task
        Insert: Partial<Task> & Pick<Task, 'scope_id' | 'name'>
        Update: Partial<Task>
        Relationships: []
      }
      tags: {
        Row: Tag
        Insert: Partial<Tag> & Pick<Tag, 'scope_id' | 'name'>
        Update: Partial<Tag>
        Relationships: []
      }
      task_tags: {
        Row: TaskTag
        Insert: TaskTag
        Update: Partial<TaskTag>
        Relationships: []
      }
      scope_github_configs: {
        Row: ScopeGitHubConfig
        Insert: Partial<ScopeGitHubConfig> & Pick<ScopeGitHubConfig, 'scope_id' | 'user_id'>
        Update: Partial<ScopeGitHubConfig>
        Relationships: []
      }
      task_github_configs: {
        Row: TaskGitHubConfig
        Insert: Partial<TaskGitHubConfig> & Pick<TaskGitHubConfig, 'task_id' | 'user_id'>
        Update: Partial<TaskGitHubConfig>
        Relationships: []
      }
      notifications: {
        Row: Notification
        Insert: Partial<Notification> &
          Pick<Notification, 'user_id' | 'notification_type' | 'title' | 'message'>
        Update: Partial<Notification>
        Relationships: []
      }
      sync_logs: {
        Row: SyncLog
        Insert: Partial<SyncLog> & Pick<SyncLog, 'task_id' | 'action' | 'status'>
        Update: Partial<SyncLog>
        Relationships: []
      }
      github_credentials: {
        Row: {
          user_id: string
          token_encrypted: string
          token_hint: string | null
          scopes: string[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          token_encrypted: string
          token_hint?: string | null
          scopes?: string[] | null
        }
        Update: Partial<{
          token_encrypted: string
          token_hint: string | null
          scopes: string[] | null
        }>
        Relationships: []
      }
      cli_access_tokens: {
        Row: {
          id: string
          user_id: string
          name: string
          token_prefix: string
          token_hash: string
          scope_ids: string[] | null
          can_write: boolean
          last_used_at: string | null
          revoked_at: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          name: string
          token_prefix: string
          token_hash: string
          scope_ids?: string[] | null
          can_write?: boolean
        }
        Update: Partial<{
          name: string
          last_used_at: string | null
          revoked_at: string | null
        }>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      accept_scope_invite: {
        Args: { p_token: string }
        Returns: ScopeShare
      }
      create_scope: {
        Args: { p_name: string; p_description?: string | null }
        Returns: Scope
      }
      create_cli_access_token: {
        Args: {
          p_name: string
          p_scope_ids?: string[] | null
          p_can_write?: boolean
        }
        Returns: {
          id: string
          token: string
          token_prefix: string
          name: string
          scope_ids: string[] | null
          can_write: boolean
          created_at: string
        }[]
      }
      revoke_cli_access_token: {
        Args: { p_id: string }
        Returns: boolean
      }
      search_profiles: {
        Args: { p_query: string }
        Returns: Pick<Profile, 'id' | 'username' | 'name' | 'email'>[]
      }
      has_scope_access: {
        Args: { p_scope_id: string; p_min_role?: ShareRole }
        Returns: boolean
      }
      is_scope_owner: {
        Args: { p_scope_id: string }
        Returns: boolean
      }
      notify_github_binding_change: {
        Args: {
          p_scope_id: string
          p_title: string
          p_message: string
          p_payload?: Record<string, unknown>
        }
        Returns: undefined
      }
      disable_my_github_scope_configs: {
        Args: Record<string, never>
        Returns: number
      }
      disable_scope_github_binding: {
        Args: { p_scope_id: string }
        Returns: undefined
      }
    }
    Enums: {
      share_role: ShareRole
      share_status: ShareStatus
      notification_type: NotificationType
      notification_status: NotificationStatus
      app_role: AppRole
      theme_pref: ThemePref
    }
    CompositeTypes: Record<string, never>
  }
}

export type ScopeWithMeta = Scope & {
  is_owner: boolean
  role: ShareRole | 'owner'
  share_status?: ShareStatus
}
