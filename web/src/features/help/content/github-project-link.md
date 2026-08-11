---
title: Link a project to GitHub
description: Bind a repo, labels, and sync issues from the board
order: 40
---

# Link a project to GitHub

Once your [GitHub token](?help=github-token) is saved and integration is enabled, bind **one default repository** per project.

## Open project GitHub settings

1. Open the project board.
2. Click **GitHub** in the project header.
3. Choose:
   - Default **repository**
   - Optional **GitHub Project** board
   - Optional **milestone**
   - Optional **label** applied to issues
   - Whether completing a task should **close** the linked issue
4. Save.

## Task actions

On each task (when you can mutate):

| Action | Meaning |
|--------|---------|
| **Create / link** | Create a new issue or link an existing one |
| **Open issue** | Open the issue on GitHub |
| **Sync** | Pull or push title/body/state (as implemented) |

Issue numbers are shared for the project so everyone sees the same link; **mutations** use **your** token and require your integration preference to be on.

## Refresh

The header **refresh** control reloads project data and can soft-pull linked issues (capped) when your integration is enabled.

## Troubleshooting

- **No GitHub button / cannot configure:** enable integration + PAT in Settings; you need edit rights on the project.
- **Create/sync fails:** token scopes, repo access, or soft-disabled binding — re-enable and re-link if needed.
- **Login GitHub vs integration:** account OAuth does **not** replace a PAT for issue APIs in this app.
