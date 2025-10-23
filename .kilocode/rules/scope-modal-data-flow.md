# scope-modal-data-flow.md

This document explains how the **Scope** create/edit modal is populated and saved, why it may confuse LLM code generators, and what to change to correctly include new fields like `github_hidden_label`.

---

## High-Level Flow

1. **Scope list page renders cards** with an **Edit** button.  
   The button embeds the scope’s current values as **`data-*` attributes** (strings or JSON) to hydrate the modal on click. :contentReference[oaicite:0]{index=0}

2. The **Scope modal** (`templates/modals/scope_modal.html`) is a single form used for both **Create** and **Edit**.  
   - It provides two URLs as data attributes on the `<form>` element:
     - `data-create-url` → `POST /scope/add`
     - `data-edit-url-template` → `POST /scope/edit/{id}`  
   - It also carries an initial state blob and a flag indicating if a GitHub token is present. :contentReference[oaicite:1]{index=1}

3. **Front-end JS (scope_form.js)** (referenced from the page) listens for:
   - **“Add scope”** button → open empty form (create mode)
   - **“Edit”** button → read card’s `data-*` → populate fields (edit mode)
   - It decides whether it’s **create** or **edit** based on presence of a scope id and sets the form action URL using `data-edit-url-template` + the id. :contentReference[oaicite:2]{index=2}

4. On submit, the form can be posted as:
   - **JSON (XHR)** → backend uses `_populate_form_from_payload` to normalize and `form.process(data=…)`.  
   - **Standard form POST** → backend relies on WTForms’ `validate_on_submit()`. :contentReference[oaicite:3]{index=3}

5. Backend merges/validates GitHub selections via `validate_github_settings()` and commits to `Scope`. :contentReference[oaicite:4]{index=4}

---

## Where Values Come From

### 1) Scope list → Edit button `data-*` payload
Each card’s **Edit** button includes the normalized data to prefill the modal. Key attributes:

- `data-scope-id`, `data-scope-name`, `data-scope-description`
- `data-scope-github_enabled` → `"true"` / `"false"`
- **JSON strings** for optional GitHub fields:
  - `data-scope-github_repository='{"id":…, "name":"…", "owner":"…"}'`
  - `data-scope-github_project='{"id":…, "name":"…"}'`
  - `data-scope-github_milestone='{"number":…, "title":"…"}'` :contentReference[oaicite:5]{index=5}

> **Important:** These are set server-side while rendering `templates/scope.html` inside the `{% for scope in scopes %}` loop.

### 2) Modal fields are tagged with `data-field`
The form inputs/selects in the modal are rendered with `data-field` keys:
- `"name"`, `"description"`
- `"github_enabled"`, `"github_repository"`, `"github_project"`, `"github_milestone"`  
This gives the client script a stable mapping between the button’s `data-*` and the form’s widgets. :contentReference[oaicite:6]{index=6}

### 3) Edit (GET) server-side prefill (non-XHR)
When you hit `/scope/edit/<id>` as a traditional GET (e.g., reload on validation error), the route **also** pre-populates the WTForm fields, notably serializing GitHub selections to JSON strings so the select widgets can restore selection:

- `form.github_enabled.data = scope.github_integration_enabled`
- `form.github_repository.data = json.dumps({...})` (when owner/name exist)
- `form.github_project.data = json.dumps({...})` (when id/name exist)
- `form.github_milestone.data = json.dumps({...})` (when number/title exist) :contentReference[oaicite:7]{index=7}

### 4) JSON submit path
When the modal submits **JSON**, the route calls:

- `_populate_form_from_payload(form, payload)` → **normalizes** booleans and empties and then `form.process(data=normalized)`  
  Normalized keys: `name`, `description`, `github_enabled`, `github_repository`, `github_project`, `github_milestone`. :contentReference[oaicite:8]{index=8}

---

## Add vs. Edit “Hack” (Mode Detection)

The modal and JS avoid separate templates by **deriving mode**:

- **Create mode**: Opened by the “Add scope” button; no scope id → use `data-create-url`.
- **Edit mode**: Opened by an Edit button with `data-scope-id` present; JS constructs the POST URL using `data-edit-url-template` + scope id and hydrates fields from that button’s `data-*` JSON.  
- Server routes mirror this: `/add` vs `/edit/<id>`, each understanding JSON or standard form submits and returning unified JSON “success/error” payloads. :contentReference[oaicite:9]{index=9} :contentReference[oaicite:10]{index=10} :contentReference[oaicite:11]{index=11}

---

## Why LLMs Struggle

1. **Dual population paths** (client-side via `data-*` JSON *and* server-side via `form.process`) require the model to keep both in sync.
2. **Embedded JSON in `data-*`** means generated code must correctly stringify/parse—easy to mismatch field names or forget to quote attributes.
3. **Boolean normalization**: `_is_truthy` accepts multiple truthy strings; models often forget this and break toggles for `"on"`, `"1"`, etc. :contentReference[oaicite:12]{index=12}
4. **Single modal for two modes**: Mode inference relies on presence of id and URL template—if not replicated, actions point to wrong endpoint.

---

## Adding a New Field (e.g., `github_hidden_label`) Correctly

To populate `github_hidden_label` in **Edit/Settings**:

1. **WTForm**  
   - Add a new `StringField` (or appropriate field) `github_hidden_label` to `ScopeForm`.
   - Ensure it has `data-field="github_hidden_label"` when rendered in the modal.

2. **Template: Card Edit Button** (`templates/scope.html`)  
   - Add `data-scope-github_hidden_label="{{ scope.github_hidden_label | default('') | e }}"` to the **Edit** button so client JS can hydrate on click. :contentReference[oaicite:13]{index=13}

3. **Template: Modal Form** (`templates/modals/scope_modal.html`)  
   - Render the input control, matching the patterns of the other fields (invalid feedback, label, etc.), and include `data-field="github_hidden_label"`. :contentReference[oaicite:14]{index=14}

4. **Edit (GET) Server Prefill** (`routes/scopes.py`)  
   - In the non-JSON path (when `ScopeForm(obj=scope)` is used), set:  
     `form.github_hidden_label.data = scope.github_hidden_label or ""`  
     alongside existing prefill for repo/project/milestone JSON. :contentReference[oaicite:15]{index=15}

5. **JSON Submit Normalization**  
   - Add `"github_hidden_label": payload.get("github_hidden_label") or ""` inside `_populate_form_from_payload()`, and include it in `_collect_form_values()` for error echo. :contentReference[oaicite:16]{index=16}

6. **Validation & Save**  
   - After `validate_github_settings()`, write `scope.github_hidden_label = form.github_hidden_label.data.strip() or None` when saving in **add** and **edit** routes. :contentReference[oaicite:17]{index=17} :contentReference[oaicite:18]{index=18}

> **Tip:** keep the `data-field` key, server field names, and button `data-scope-…` attribute naming in sync to avoid hydration surprises.

---

## Kilo Code — Custom Rule Suggestions (Scope Forms)

- **Single-Source of Truth for Keys**  
  - Treat these as canonical form keys:  
    `name`, `description`, `github_enabled`, `github_repository`, `github_project`, `github_milestone`, `github_hidden_label` (if present).

- **Always Support Both Paths**  
  - If you add a new field, **update both**:
    - Client hydration (card **Edit** button `data-*` → modal input via `data-field`)
    - Server prefill (non-JSON GET) + JSON normalization in `_populate_form_from_payload`.

- **JSON in Data Attributes**  
  - When embedding objects (repo/project/milestone) in `data-*`, **stringify** valid JSON at render time and **parse** it before assigning to selects.

- **Boolean Normalization**  
  - Use the existing `_is_truthy()` semantics for toggles (accept `"1","true","on","yes"` etc.) so client and server remain consistent. :contentReference[oaicite:19]{index=19}

- **Mode Detection**  
  - Use `data-create-url` vs `data-edit-url-template` and the presence of `data-scope-id` to decide POST target.

- **Error Bounce-Back**  
  - On validation error, use `_json_form_error()` to return `{"errors":…, "values":…, "csrf_token":…}` and **re-hydrate** fields from `values` so the modal stays consistent. :contentReference[oaicite:20]{index=20}

---

## Troubleshooting `github_hidden_label` Not Populating

- **Symptom:** Field empty in edit modal.
- **Likely Causes:**
  1. Missing `data-scope-github_hidden_label` on Edit button → client hydrate can’t set it.
  2. Modal control lacks `data-field="github_hidden_label"` → JS doesn’t bind it.
  3. Edit (GET) server prefill didn’t set `form.github_hidden_label.data`.
  4. JSON path missing normalization in `_populate_form_from_payload`.
- **Fix:** Apply the 6-step “Adding a New Field” checklist above.

---

## File Pointers

- `templates/scope.html` — scope cards + Edit button `data-*` hydration source. :contentReference[oaicite:21]{index=21}  
- `templates/modals/scope_modal.html` — single modal for add/edit; fields tagged with `data-field`; submit button; URLs on `<form>`. :contentReference[oaicite:22]{index=22}  
- `routes/scopes.py` — JSON normalization (`_populate_form_from_payload`), GET prefill for edit, save logic, error JSON contract. :contentReference[oaicite:23]{index=23} :contentReference[oaicite:24]{index=24} :contentReference[oaicite:25]{index=25}

---
