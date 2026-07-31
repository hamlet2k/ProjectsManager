# GitHub integration: user vs project (adapted from #35)

_Last updated 2026-07-31._

Adapted for the current contract: **one project → one default repository**, user opt-in, issue links project-global, read-only when preference is off but the project is still integrated.

Source of old requirements: [issue #35](https://github.com/hamlet2k/ProjectsManager/issues/35).

---

## Two layers

| Layer | Where | What it means |
|-------|--------|----------------|
| **User preference** | Settings → “Enable GitHub integration” | *I* want to use GitHub features (needs PAT) |
| **Project binding** | Project → GitHub → link repository | *This project* is linked to **one** repo |

Token is stored encrypted when you save a PAT. **Turning preference off does not delete the token.**

---

## Matrix

### A. User preference **ON** + project **linked**

| Action | Result |
|--------|--------|
| See repo / issue # / milestones / blocked-by | Yes |
| Create / sync / close issues | Yes (if editor/owner + valid PAT) |
| Create issue when adding a task | Optional checkbox (remembered; default off) |
| Link / import existing issue | Yes |
| App task dependencies + GH blocked-by sync | Yes when both ends linked (and project deps enabled) |
| Delete task | Unlink only, or close open issue then delete (**never** delete issue on GitHub) |
| Complete task | Optional close issue if `close_issue_on_complete` |
| Change linked repo | Yes (editor/owner). Existing link change = **override** → confirm + **notify** |

### B. User preference **OFF** + project **still linked** (by anyone)

| Action | Result |
|--------|--------|
| See project GitHub button / issue badges / open issue URLs | Yes (**read-only**) |
| Create / sync / close / change repo | No |
| Token / saved configs | **Kept** |

Matches #35 “informational still visible, actions off.”

### C. User preference **OFF** + project **not linked**

| Action | Result |
|--------|--------|
| GitHub UI on that project | Hidden |
| Settings toggle / token fields | Still available to re-enable later |

### D. User turns preference **OFF** (global)

1. Confirmation dialog (see copy below).
2. Profile `github_integration_enabled = false`.
3. **All of this user’s** project binding rows set `github_integration_enabled = false` (repo fields **kept** for easy re-link).
4. Other members’ bindings are **not** deleted.
5. If this user was the only active binder, the project becomes **unlinked** for everyone until someone re-enables and selects the repo again.
6. No GitHub API calls from that user while off.

**Re-enable preference:** token still there; **projects stay off** until linked again on each project (adapted from #35 “scopes remain inactive until toggled back”).

### E. Project-level **disable** (uncheck “Link this project”)

1. Confirmation dialog.
2. Soft-disable: all binding rows for that project get `github_integration_enabled = false` (repo fields kept).
3. Issue links on tasks **remain** in DB; UI is read-only for issue # / URL if user can still see chrome; create/sync hidden.
4. Notify other members that GitHub was disabled for the project (I4).

### F. Project-level **change repository** (override)

1. If a different repo was already linked → confirm impact.
2. Save new binding on current user (enabled + repo). Prefer owner row as canonical when present.
3. Soft-disable other members’ competing “enabled” rows if needed so one active repo remains.
4. **Notify** other members (owner + accepted shares) with old → new repo.

### G. Reactivation

| Action | Result |
|--------|--------|
| Preference ON again | Mutations allowed again; project still needs an active binding |
| Re-check link + same repo | Instant restore without re-entering PAT |
| Token missing | Prompt Settings |

---

## Confirmation copy

**Disable user preference**

> Disabling your GitHub integration turns off GitHub **actions** for you on all projects.  
> Linked issue numbers and repos stay visible as **read-only** where the project is still integrated.  
> Your token and project settings are **kept**. You can re-enable later; each project may need to be linked again.

**Disable project link**

> Disabling GitHub for this project makes GitHub data **read-only**.  
> Existing issue links stay in the app, but create/sync/close stop until you link a repository again.

**Change repository**

> This project is already linked to **{old}**.  
> Changing it to **{new}** affects all members. Existing task↔issue links still point at the old repo until recreated.  
> Other members will be notified.

---

## Visual states

| Element | Preference OFF or no mutate | Project not linked |
|---------|----------------------------|--------------------|
| Issue # pill | Visible, opens GitHub | Hidden if never linked |
| Sync / create | Hidden | Hidden |
| Project GitHub button | Shown if integrated (read-only modal) | Hidden if preference off and not integrated |
| Settings enable | Available | Available |

---

## What we intentionally dropped from #35

| Old #35 idea | New behavior |
|--------------|--------------|
| Multi-scope per-user repo “detach” | **One repo per project**; no multi-repo detach |
| Disable global sync navbar button | No global sync navbar; per-task sync only |
| Auto-disable *other users’* scope toggles when I turn preference off | Only **my** binding rows; project stays integrated if someone else holds the active binding |

---

## Multi-repo reality (current product)

Even with **one active default repo** for *new* create/link:

- Each **task↔issue** row stores its own `github_repo_owner` / `github_repo_name`.
- Complete→close / sync / open-URL use that **stored** repo (so issues keep working after a project repo swap).
- After a repo change, the project can therefore show issues from **several** repos until old links are cleaned up.

**UI:** issue pills use a stable color accent per `owner/repo` and show the short repo name.

**Actions when project binding is soft-disabled:** create / sync / complete→close **must not** call GitHub (issue #s stay visible/read-only).

### If redesigning from scratch (recommendation)

| Option | Idea | Pros | Cons |
|--------|------|------|------|
| **A. Strict single-repo** | Project has exactly one repo forever; changing repo requires migrate or detach all links | Simple mental model | Painful when org moves code |
| **B. Active default + legacy links** *(today)* | One “default for new work”; historical links stay on old repos, color-coded | Flexible, no data loss | Can feel messy without UI cues |
| **C. Explicit multi-repo** | Project allows N repos; pick default; filter by repo | Honest about reality | More UI / policy |

**Preferred product shape:** keep **B** with clearer UX (accent colors, tooltips, optional filter “by repo”), and later optional **“archive links from old repo”** when swapping. Avoid silent multi-default write targets.

---

## Related code

- Capabilities: `web/src/features/github/visibility.ts`
- Settings toggle + confirm: `web/src/pages/SettingsPage.tsx`
- Project GitHub + tasks: `web/src/pages/ScopePage.tsx`
- Edge API: `supabase/functions/github-proxy/`, `github-credentials/`
- Notify RPC: `supabase/migrations/20260730000000_github_binding_notifications.sql`
- Repo accents / filters: `web/src/features/github/repoAccent.ts`
- Delete confirm (option C): `web/src/features/tasks/components/TaskDeleteConfirm.tsx`
