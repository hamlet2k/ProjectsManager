# AI Assistant & Prompt Rules

- Codex or Kilo Code prompts must always load:
  1. `/docs/project-context.md`
  2. `/docs/project-flows.md`
  3. `/docs/data-model.md` (if models or migrations change)
- Deliverables must include:
  - Complete file diffs or new full contents.
  - Migration notes (if applicable).
  - Documentation updates.
- When embedding code fences inside markdown, escape inner backticks or use indentation (see `docs/chat-bootstrap.md`).
- For large changes, prefer multi-file checklists with clear post-apply verification steps.
