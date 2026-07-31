# 📝 Task Description Formatting Guide (Markdown)

This document explains how to format task descriptions in **ProjectsManager** using the Markdown language.

Markdown allows you to easily style your task descriptions with **headings**, **lists**, **links**, **code blocks**, and more — making your notes readable and organized.

---

## 1️⃣ Basic Text Formatting

| Style | Syntax | Example | Output |
|--------|---------|---------|--------|
| **Bold** | `**text**` | `**important**` | **important** |
| *Italic* | `*text*` | `*highlighted*` | *highlighted* |
| ~~Strikethrough~~ | `~~text~~` | `~~done~~` | ~~done~~ |
| Inline `code` | `` `text` `` | `` `code sample` `` | `code sample` |
| Line break | End line with 2 spaces | `First line  ` <br> `Second line` | First line <br> Second line |

---

## 2️⃣ Headings

Use `#` to create headings (up to 6 levels).

```
# H1 Title
## H2 Section
### H3 Subsection
```

**Output:**

# H1 Title
## H2 Section
### H3 Subsection

---

## 3️⃣ Lists

### Unordered List
```
- Item 1
- Item 2
  - Nested Item
```

**Output:**
- Item 1
- Item 2
  - Nested Item

### Ordered List
```
1. First
2. Second
   1. Subitem
```

**Output:**
1. First
2. Second
   1. Subitem

---

## 4️⃣ Links and Images

```
[Open GitHub](https://github.com)
![Logo](https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png)
```

**Output:**  
[Open GitHub](https://github.com)  
![Logo](https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png)

---

## 5️⃣ Blockquotes

```
> This is a quote or note.
```

**Output:**  
> This is a quote or note.

---

## 6️⃣ Code Blocks

For multiple lines of code, use triple backticks:

```
```python
def hello():
    print("Hello Markdown!")
```
```

**Output:**

```python
def hello():
    print("Hello Markdown!")
```

---

## 7️⃣ Tables

Tables can be used to display structured information:

```
| Name | Status | Priority |
|------|---------|-----------|
| Task A | Done | High |
| Task B | In progress | Medium |
```

**Output:**

| Name | Status | Priority |
|------|---------|-----------|
| Task A | Done | High |
| Task B | In progress | Medium |

---

## 8️⃣ Horizontal Rules

Use three or more dashes (`---`) to create a separator line.

```
---
```

---

## 9️⃣ Combining Markdown Elements

You can combine multiple Markdown features for richer formatting.

```
### Task Summary

**Goal:** Improve Markdown rendering

**Steps:**
1. Create description
2. Apply *styling*
3. Test rendering

> Tip: Use Markdown to keep your notes organized!
```

**Output:**

### Task Summary

**Goal:** Improve Markdown rendering

**Steps:**
1. Create description
2. Apply *styling*
3. Test rendering

> Tip: Use Markdown to keep your notes organized!

---

## 🔒 Safe HTML Support

ProjectsManager allows limited HTML tags for additional formatting (e.g. `<br>`, `<p>`, `<strong>`, `<em>`).  
However, scripts or unsafe elements are automatically sanitized for security.

---

## ✅ Best Practices

- Use headings (`##`) to structure long descriptions.
- Keep lines short for better readability.
- Use code blocks for snippets or logs.
- Avoid excessive nested lists — they reduce clarity.
- Preview before saving to ensure correct rendering.

---

**Enjoy writing cleaner, clearer task descriptions with Markdown!**
