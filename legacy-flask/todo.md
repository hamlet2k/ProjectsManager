# ProjectsManager — TODO
_Last updated: 2025-10-09 14:30:00_

The project backlog is tracked via issues in GitHub.
This file is a reference to where to find and how to manage tasks.

> Source of truth for project docs remains `/docs/` in the repo. 

---

## Tasks tracked in GitHub
- [List of enhancements](https://github.com/hamlet2k/ProjectsManager/issues?q=is%3Aissue%20state%3Aopen%20label%3Aenhancement)
- [List of bugs](https://github.com/hamlet2k/ProjectsManager/issues?q=is%3Aissue%20state%3Aopen%20label%3Abug)
- [Completed issues](https://github.com/hamlet2k/ProjectsManager/issues?q=is%3Aissue%20state%3Aclosed)

---

## Conventions
- Keep tasks **atomic**; aim for PRs that do one thing well.
- If a task changes models, include **migration** in the PR and update `/docs/data-model.md`.
- If routes/UX change, update `/docs/project-flows.md`.

---

## AI Assistant Usage
Whenever a task involves code changes, provide BOTH:
1) **Paste-ready prompt** for the chosen tool (Copilot / Kilo Code / Coding Agent).  
2) **Code/diff snippets** in chat.

### Task Prompt Template (drop into your tool)
```
Project: ProjectsManager (Flask)

Load first:
- docs/project-context.md
- docs/ai-output-history.md
- docs/project-flows.md (if routes/UX change)
- docs/data-model.md (if models/migrations change)

Task:
<describe the concrete change>

Constraints:
- Flask-Migrate compatibility for any model change.
- Provide complete code blocks/diffs (no placeholders).
- Minimal, focused changes; PEP 8.

Deliverables:
1) Exact file diffs or full contents.
2) Brief rationale.
3) Migration commands (if any).
```

---

## Quick Links
- Repo: https://github.com/hamlet2k/ProjectsManager
- Local: `F:\Projects\ProjectsManager\`
- Docs: `/docs/`