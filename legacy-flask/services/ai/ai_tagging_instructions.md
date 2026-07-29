# AI Tagging System — Global Instruction Set

## Purpose
This file defines the **permanent and abstract tagging logic** for the Projects Manager App’s AI system.

The purpose of this logic is to enable the AI to automatically **suggest meaningful tags** for any newly created or updated task — across any type of project (software, personal, farming, business, education, etc.).

The file should remain **hidden from users** and serve as the **core rulebook** for how the AI classifies and labels tasks consistently.

---

## General Principles

1. **Simplicity first:** Tags must be easy to understand and short (1–2 words).  
2. **Adaptability:** The AI must adapt tag suggestions to the project context (personal vs. professional).  
3. **Automatic context recognition:**  
   - Detect what kind of project the task belongs to using its project description and/or AI prompt.  
   - Suggest tags relevant to that domain.  
4. **Multi-level tagging:**  
   - Each task can have **up to 5 tags**.  
   - Tags should combine **intent**, **domain**, and **impact**.  
5. **GitHub-compatible:**  
   - All tags are lowercase, no special characters except `-`.  
   - Avoid spaces, slashes, or punctuation in tag names.

---

## Process Overview

When a task is created or updated:

1. **Analyze Context**
   - Use the project’s description and optional AI prompt to understand its domain and purpose.
   - Identify if the project is technical (e.g., app dev), operational (e.g., farm schedule), personal (e.g., groceries), or creative (e.g., writing plan).

2. **Analyze Task Text**
   - Parse the task title and description.
   - Detect verbs, entities, and patterns indicating intent (“add”, “fix”, “harvest”, “buy”, etc.).
   - Match key terms against the taxonomy below.

3. **Determine Tag Candidates**
   - Choose one **intent tag** (purpose of the task).
   - Choose one or more **domain tags** (topic or area of focus).
   - Optionally add **impact tags** (effect or behavior).

4. **Generate Output**
   - Suggest 2–5 tags.
   - Rank by confidence (0–1.0).
   - Return in machine-friendly format.

---

## Global Taxonomy

### A. Intent Tags
Describe what kind of work the task represents.

| Tag | Meaning | Example Keywords |
|------|----------|------------------|
| feature | Create or add something new | add, create, implement, build |
| bugfix | Correct an issue | fix, repair, error, not working |
| enhancement | Improve an existing item or process | improve, adjust, refine, polish |
| task | General to-do item | do, complete, check, perform |
| research | Investigate or learn something | explore, research, find, study |
| setup | Configuration or initialization | setup, install, prepare, configure |
| planning | Scheduling or preparing ahead | plan, roadmap, outline, arrange |
| maintenance | Keep things running smoothly | clean, update, verify, check |
| testing | Validate or test results | test, verify, confirm, measure |
| documentation | Write or explain something | document, describe, explain, write |

---

### B. Domain Tags
Define the area or subject matter the task applies to.

| Tag | Meaning | Example Domains |
|------|----------|----------------|
| ui | User interface or visual elements | app screens, layouts, themes |
| ux | User experience or interaction | navigation, shortcuts, usability |
| api | System or backend interface | endpoints, data handling |
| integration | Connections with other systems | GitHub, Google, calendar |
| operations | Process or workflow tasks | scheduling, setup, coordination |
| finance | Money, budgets, costs | expenses, payment, invoices |
| farming | Agricultural or crop-related | harvest, irrigation, seeding |
| grocery | Household or shopping lists | buy, stock, restock |
| study | Education, learning tasks | read, learn, practice, revise |
| writing | Creative or content generation | write, draft, edit |
| event | Meetings, appointments, deadlines | schedule, attend, invite |
| household | Personal chores or maintenance | clean, repair, organize |
| health | Wellness, exercise, medication | workout, rest, diet |
| development | Software or technical build | code, debug, commit |
| marketing | Promotion, outreach | advertise, publish, social |
| collaboration | Teamwork or shared efforts | share, review, invite |

---

### C. Impact Tags
Describe the nature, urgency, or focus of the task.

| Tag | Meaning | Example Keywords |
|------|----------|------------------|
| performance | Related to speed or efficiency | optimize, reduce, improve |
| design | Aesthetic or creative improvement | redesign, color, layout |
| priority | Time-sensitive or critical | urgent, high, asap |
| cleanup | Organization or tidying | remove, delete, clear |
| review | Requires validation or approval | review, approve, confirm |
| automation | Automatic or AI-driven | automate, sync, trigger |
| communication | Involves messaging or sharing | email, notify, post |
| feedback | User or peer feedback collection | comment, rate, evaluate |
| logistics | Resource or supply handling | order, deliver, allocate |
| tracking | Monitoring progress or results | record, log, measure |

---

## Domain-Specific Adaptation Rules

1. **Software / Development Projects**
   - Common tags: `feature`, `bugfix`, `enhancement`, `ui`, `api`, `backend`, `testing`, `integration`
   - Additional AI context: detect references to code, commit, PRs, API endpoints.

2. **Personal / Productivity Projects (e.g., to-do lists, home chores)**
   - Common tags: `task`, `priority`, `household`, `grocery`, `maintenance`
   - AI should infer from verbs like “buy”, “clean”, “call”, “organize”.

3. **Farming / Agriculture**
   - Common tags: `farming`, `schedule`, `maintenance`, `weather`, `harvest`, `irrigation`
   - Detect words like “plant”, “seed”, “harvest”, “soil”, “water”.

4. **Education / Study**
   - Common tags: `study`, `reading`, `assignment`, `review`, `planning`
   - Detect words like “learn”, “read”, “practice”, “course”, “exam”.

5. **Creative / Writing / Marketing**
   - Common tags: `writing`, `editing`, `design`, `content`, `review`, `marketing`
   - Detect words like “draft”, “publish”, “design”, “post”.

6. **Business / Operations**
   - Common tags: `operations`, `finance`, `collaboration`, `logistics`, `planning`
   - Detect terms like “invoice”, “budget”, “team”, “meeting”, “report”.

---

## AI Decision Rules

### Rule 1 — Tag Type Balance
- Always include one **intent** tag.
- Add one or two **domain** tags.
- Add optional **impact** tags.
- Max tags: 5.

### Rule 2 — Language Understanding
- Use NLP to extract nouns (subjects) and verbs (actions).
- Map action verbs → intent tags.
- Map subjects → domain tags.

### Rule 3 — Project Context Awareness
- Each project includes metadata:  
  - `description` — defines purpose  
  - `ai_prompt` — optional override prompt  
- AI should prioritize domain tags that align with project purpose.
  - Example: “Farm Project” → prefer `farming`, `schedule`, `maintenance`
  - Example: “Personal To-do” → prefer `task`, `household`, `priority`

### Rule 4 — Continuous Learning
- If users adjust tags after AI suggestions, the system should record corrections.
- Over time, adjust tag confidence per project type.

### Rule 5 — Output Format
When generating tag suggestions, output must be structured:

\```
suggested_tags:
  - tag: enhancement
    confidence: 0.93
  - tag: ui
    confidence: 0.87
  - tag: performance
    confidence: 0.70
\```

---

## Summary of Tagging Flow

1. Identify **project type** from metadata.  
2. Parse **task title and description**.  
3. Extract **intent**, **domain**, and **impact**.  
4. Apply **taxonomy matching**.  
5. Output ranked **tag suggestions**.  
6. Learn from user corrections over time.

---

## Example Outputs

### Example 1 — Software Project
\```
Task: Fix dark mode button alignment  
→ suggested_tags: [bugfix, ui, theme]
\```

### Example 2 — Grocery List
\```
Task: Buy milk and eggs for the week  
→ suggested_tags: [grocery, task, priority]
\```

### Example 3 — Farming Schedule
\```
Task: Water the tomato field every morning  
→ suggested_tags: [farming, maintenance, schedule]
\```

### Example 4 — Study Project
\```
Task: Review chapters 3 and 4 for exam  
→ suggested_tags: [study, review, planning]
\```

### Example 5 — Writing Project
\```
Task: Draft the introduction of the blog post  
→ suggested_tags: [writing, feature, content]
\```

---

## Maintenance
This file serves as the **universal tagging intelligence base**.
- Should remain **human-readable** and **AI-parsable**.
- Updates to the taxonomy or logic should be version-controlled.
- It should be **automatically loaded** by the AI whenever tag generation or refinement is requested.
