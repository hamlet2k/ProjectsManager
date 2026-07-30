/**
 * Import / export serializers for project tasks.
 * Formats align with issue #49 + AI backlog use case.
 */
import type { Task, TaskGitHubConfig } from '@/lib/supabase/types'

export type TransferFormat = 'plain' | 'checklist' | 'ai_backlog' | 'json' | 'csv'

export type ExportTaskRow = {
  task: Task
  tagNames: string[]
  github?: Pick<
    TaskGitHubConfig,
    'github_issue_number' | 'github_issue_url' | 'github_repo_owner' | 'github_repo_name' | 'github_milestone_title'
  > | null
}

export type ExportOptions = {
  format: TransferFormat
  /** Include due dates, tags, description, GitHub links, timestamps, rank */
  fullMetadata: boolean
  includeCompleted: boolean
  /** Project / list title for headers */
  projectName: string
  /** Free-text instructions for AI backlog format */
  aiInstructions: string
}

export type ParsedImportTask = {
  name: string
  description?: string | null
  completed?: boolean
  endDate?: string | null
  tagNames?: string[]
}

export type ParseResult = {
  tasks: ParsedImportTask[]
  format: TransferFormat | 'unknown'
  warnings: string[]
}

const LS_FORMAT = 'pm-transfer-format'
const LS_META = 'pm-transfer-full-meta'
const LS_AI = 'pm-transfer-ai-instructions'
const LS_ADVANCED = 'pm-advanced-export'

export function loadTransferPrefs(): {
  format: TransferFormat
  fullMetadata: boolean
  aiInstructions: string
  advancedExport: boolean
} {
  const format = (localStorage.getItem(LS_FORMAT) as TransferFormat) || 'checklist'
  const valid: TransferFormat[] = ['plain', 'checklist', 'ai_backlog', 'json', 'csv']
  return {
    format: valid.includes(format) ? format : 'checklist',
    fullMetadata: localStorage.getItem(LS_META) !== 'false',
    aiInstructions:
      localStorage.getItem(LS_AI) ||
      'Treat this list as a product backlog. Prioritize by order. For each task, implement or plan work, keep status accurate, and ask if requirements are ambiguous.',
    advancedExport: localStorage.getItem(LS_ADVANCED) !== 'false',
  }
}

export function saveTransferPrefs(partial: {
  format?: TransferFormat
  fullMetadata?: boolean
  aiInstructions?: string
  advancedExport?: boolean
}) {
  if (partial.format != null) localStorage.setItem(LS_FORMAT, partial.format)
  if (partial.fullMetadata != null) localStorage.setItem(LS_META, String(partial.fullMetadata))
  if (partial.aiInstructions != null) localStorage.setItem(LS_AI, partial.aiInstructions)
  if (partial.advancedExport != null) localStorage.setItem(LS_ADVANCED, String(partial.advancedExport))
}

export function filterExportRows(rows: ExportTaskRow[], includeCompleted: boolean): ExportTaskRow[] {
  const list = includeCompleted ? rows : rows.filter((r) => !r.task.completed)
  return [...list].sort((a, b) => a.task.rank - b.task.rank || a.task.name.localeCompare(b.task.name))
}

export function exportFileExtension(format: TransferFormat): string {
  switch (format) {
    case 'json':
      return 'json'
    case 'csv':
      return 'csv'
    case 'ai_backlog':
      return 'md'
    default:
      return 'txt'
  }
}

export function exportMime(format: TransferFormat): string {
  switch (format) {
    case 'json':
      return 'application/json'
    case 'csv':
      return 'text/csv'
    case 'ai_backlog':
      return 'text/markdown'
    default:
      return 'text/plain'
  }
}

function escapeCsv(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

function dueIso(t: Task): string {
  return t.end_date ? t.end_date.slice(0, 10) : ''
}

function githubRef(g: ExportTaskRow['github']): string {
  if (!g?.github_issue_number) return ''
  const repo =
    g.github_repo_owner && g.github_repo_name
      ? `${g.github_repo_owner}/${g.github_repo_name}`
      : ''
  return repo ? `${repo}#${g.github_issue_number}` : `#${g.github_issue_number}`
}

/** Serialize rows to the chosen format. */
export function serializeTasks(rows: ExportTaskRow[], options: ExportOptions): string {
  const list = filterExportRows(rows, options.includeCompleted)
  const { format, fullMetadata, projectName, aiInstructions } = options

  if (format === 'plain') {
    return list.map((r) => r.task.name).join('\n')
  }

  if (format === 'checklist') {
    const lines: string[] = []
    for (const r of list) {
      const mark = r.task.completed ? '[x]' : '[ ]'
      let line = `${mark} ${r.task.name}`
      if (fullMetadata) {
        const tags = r.tagNames.filter(Boolean).map((n) => `#${n}`).join(' ')
        if (tags) line += ` ${tags}`
        const due = dueIso(r.task)
        if (due) line += ` @${due}`
        const gh = githubRef(r.github)
        if (gh) line += ` (${gh})`
      }
      lines.push(line)
      if (fullMetadata && r.task.description?.trim()) {
        for (const d of r.task.description.trim().split('\n')) {
          lines.push(`    ${d}`)
        }
      }
    }
    return lines.join('\n')
  }

  if (format === 'ai_backlog') {
    const lines: string[] = [
      `# AI project backlog: ${projectName || 'Untitled project'}`,
      '',
      `Exported: ${new Date().toISOString()}`,
      `Tasks: ${list.length}`,
      '',
      '## Instructions for the AI',
      '',
      (aiInstructions || 'Work through these tasks in order.').trim(),
      '',
      '## Tasks',
      '',
    ]
    list.forEach((r, i) => {
      lines.push(`### ${i + 1}. ${r.task.name}`)
      lines.push('')
      lines.push(`- **Status:** ${r.task.completed ? 'done' : 'todo'}`)
      if (fullMetadata) {
        const due = dueIso(r.task)
        if (due) lines.push(`- **Due:** ${due}`)
        if (r.tagNames.length) lines.push(`- **Tags:** ${r.tagNames.map((n) => `#${n}`).join(', ')}`)
        const gh = githubRef(r.github)
        if (gh) {
          lines.push(
            `- **GitHub:** ${gh}${r.github?.github_issue_url ? ` (${r.github.github_issue_url})` : ''}`,
          )
        }
        if (r.github?.github_milestone_title) {
          lines.push(`- **Milestone:** ${r.github.github_milestone_title}`)
        }
        lines.push(`- **Rank:** ${r.task.rank}`)
      }
      if (r.task.description?.trim()) {
        lines.push('')
        lines.push(r.task.description.trim())
      }
      lines.push('')
    })
    lines.push('---')
    lines.push('_Generated by Projects Manager. Prefer updating status and notes as you work._')
    return lines.join('\n')
  }

  if (format === 'json') {
    const payload = {
      version: 1,
      app: 'projects-manager',
      project: projectName || null,
      exported_at: new Date().toISOString(),
      full_metadata: fullMetadata,
      tasks: list.map((r) => {
        const base: Record<string, unknown> = {
          name: r.task.name,
          completed: r.task.completed,
        }
        if (fullMetadata) {
          base.description = r.task.description
          base.end_date = r.task.end_date
          base.start_date = r.task.start_date
          base.rank = r.task.rank
          base.tags = r.tagNames
          base.completed_date = r.task.completed_date
          if (r.github?.github_issue_number) {
            base.github = {
              issue_number: r.github.github_issue_number,
              issue_url: r.github.github_issue_url,
              repo:
                r.github.github_repo_owner && r.github.github_repo_name
                  ? `${r.github.github_repo_owner}/${r.github.github_repo_name}`
                  : null,
              milestone: r.github.github_milestone_title,
            }
          }
        } else if (r.task.description?.trim()) {
          base.description = r.task.description
        }
        return base
      }),
    }
    return JSON.stringify(payload, null, 2)
  }

  // csv
  if (fullMetadata) {
    const header = [
      'name',
      'completed',
      'description',
      'end_date',
      'tags',
      'rank',
      'github_issue',
      'github_url',
    ]
    const rowsOut = list.map((r) =>
      [
        r.task.name,
        r.task.completed ? 'true' : 'false',
        r.task.description ?? '',
        dueIso(r.task),
        r.tagNames.join('|'),
        String(r.task.rank),
        githubRef(r.github),
        r.github?.github_issue_url ?? '',
      ]
        .map((c) => escapeCsv(String(c)))
        .join(','),
    )
    return [header.join(','), ...rowsOut].join('\n')
  }
  return ['name', ...list.map((r) => escapeCsv(r.task.name))].join('\n')
}

/** Heuristic + structured parsers for import. */
export function parseImportText(raw: string): ParseResult {
  const text = raw.replace(/^\uFEFF/, '').trim()
  const warnings: string[] = []
  if (!text) return { tasks: [], format: 'unknown', warnings: ['Empty input'] }

  // JSON package
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const data = JSON.parse(text) as unknown
      const tasks = parseJsonPackage(data)
      if (tasks.length) return { tasks, format: 'json', warnings }
    } catch {
      warnings.push('Looked like JSON but failed to parse; trying line formats.')
    }
  }

  // CSV with header
  if (looksLikeCsv(text)) {
    const tasks = parseCsv(text)
    if (tasks.length) return { tasks, format: 'csv', warnings }
  }

  // AI backlog markdown (### N. title)
  if (/^#{1,3}\s+\d+\.\s+/m.test(text) || /^#\s+AI project backlog/i.test(text)) {
    const tasks = parseAiBacklogMarkdown(text)
    if (tasks.length) return { tasks, format: 'ai_backlog', warnings }
  }

  // Checklist / plain lines
  const checklist = parseChecklistOrPlain(text)
  const hasMarks = /^(\s*[-*]\s*)?\[[ xX]\]/m.test(text)
  return {
    tasks: checklist,
    format: hasMarks ? 'checklist' : 'plain',
    warnings,
  }
}

function parseJsonPackage(data: unknown): ParsedImportTask[] {
  if (Array.isArray(data)) {
    const out: ParsedImportTask[] = []
    for (const item of data) {
      if (typeof item === 'string') {
        const name = item.trim()
        if (name) out.push({ name })
        continue
      }
      if (item && typeof item === 'object' && 'name' in item) {
        const o = item as Record<string, unknown>
        const name = String(o.name ?? '').trim()
        if (!name) continue
        out.push({
          name,
          description: o.description != null ? String(o.description) : null,
          completed: Boolean(o.completed),
          endDate: o.end_date != null ? String(o.end_date) : null,
          tagNames: Array.isArray(o.tags)
            ? o.tags.map((t) => String(t).replace(/^#/, ''))
            : undefined,
        })
      }
    }
    return out
  }
  if (data && typeof data === 'object' && 'tasks' in data && Array.isArray((data as { tasks: unknown }).tasks)) {
    return parseJsonPackage((data as { tasks: unknown }).tasks)
  }
  return []
}

function looksLikeCsv(text: string): boolean {
  const first = text.split(/\r?\n/).find((l) => l.trim())
  if (!first) return false
  return (
    /^name\s*,/i.test(first) ||
    (first.includes(',') && !first.includes('[ ]') && text.split(/\r?\n/).length > 1)
  )
}

function parseCsv(text: string): ParsedImportTask[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return []
  const header = splitCsvLine(lines[0]!)
  const lower = header.map((h) => h.trim().toLowerCase())
  const hasHeader = lower.includes('name')
  const start = hasHeader ? 1 : 0
  const idx = (key: string) => lower.indexOf(key)

  const tasks: ParsedImportTask[] = []
  for (let i = start; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!)
    if (hasHeader) {
      const name = (cols[idx('name')] ?? '').trim()
      if (!name) continue
      const tagsRaw = cols[idx('tags')] ?? ''
      tasks.push({
        name,
        completed: /^(1|true|yes|x)$/i.test((cols[idx('completed')] ?? '').trim()),
        description: cols[idx('description')] || null,
        endDate: cols[idx('end_date')] || null,
        tagNames: tagsRaw
          ? tagsRaw.split(/[|;]/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean)
          : undefined,
      })
    } else {
      const name = (cols[0] ?? '').trim()
      if (name && name.toLowerCase() !== 'name') tasks.push({ name })
    }
  }
  return tasks
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') {
        inQ = false
      } else {
        cur += c
      }
    } else if (c === '"') {
      inQ = true
    } else if (c === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out
}

function parseAiBacklogMarkdown(text: string): ParsedImportTask[] {
  const tasks: ParsedImportTask[] = []
  // Split on ### N. title or ## N. title
  const parts = text.split(/^#{2,3}\s+\d+\.\s+/m).slice(1)
  // Also need titles - re-scan with matchAll
  const re = /^#{2,3}\s+\d+\.\s+(.+)$/gm
  const titles: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) titles.push(m[1]!.trim())

  titles.forEach((title, i) => {
    const body = parts[i] ?? ''
    const statusDone = /\*\*Status:\*\*\s*done/i.test(body) || /-\s*Status:\s*done/i.test(body)
    const dueMatch = body.match(/\*\*Due:\*\*\s*(\S+)/i) || body.match(/-\s*Due:\s*(\S+)/i)
    const tagsMatch = body.match(/\*\*Tags:\*\*\s*(.+)/i) || body.match(/-\s*Tags:\s*(.+)/i)
    // Description: after metadata bullets, remaining non-empty lines that aren't bullets starting with **
    const descLines: string[] = []
    let pastMeta = false
    for (const line of body.split(/\r?\n/)) {
      if (/^\s*-\s+\*\*/.test(line) || /^\s*-\s+\*\*Status/i.test(line)) {
        pastMeta = true
        continue
      }
      if (pastMeta || (!line.trim().startsWith('- **') && line.trim())) {
        if (/^---/.test(line) || /^_Generated by/.test(line)) break
        if (/^\s*-\s+\*\*/.test(line)) continue
        if (line.trim() === title) continue
        descLines.push(line)
      }
    }
    const description = descLines.join('\n').trim() || null
    const tagNames = tagsMatch
      ? tagsMatch[1]!
          .split(/[,]/)
          .map((t) => t.replace(/^#/, '').trim())
          .filter(Boolean)
      : undefined
    tasks.push({
      name: title,
      completed: statusDone,
      endDate: dueMatch?.[1] ?? null,
      description,
      tagNames,
    })
  })
  return tasks
}

function parseChecklistOrPlain(text: string): ParsedImportTask[] {
  const lines = text.split(/\r?\n/)
  const tasks: ParsedImportTask[] = []
  let current: ParsedImportTask | null = null

  const flush = () => {
    if (current?.name) tasks.push(current)
    current = null
  }

  for (const rawLine of lines) {
    // Continuation (indented description under a task)
    if (/^\s{2,}\S/.test(rawLine) && current) {
      const cont = rawLine.trim()
      current.description = current.description ? `${current.description}\n${cont}` : cont
      continue
    }

    const line = rawLine.trim()
    if (!line) continue
    // Skip markdown headers / AI sections
    if (/^#{1,6}\s/.test(line)) continue
    if (/^instructions for the ai/i.test(line)) continue
    if (/^---+$/.test(line)) continue

    // Checkbox line: [ ] name #tag @2026-01-01
    const check = line.match(/^[-*]?\s*\[([ xX])\]\s*(.+)$/)
    if (check) {
      flush()
      const completed = check[1]!.toLowerCase() === 'x'
      let rest = check[2]!.trim()
      const tagNames: string[] = []
      rest = rest.replace(/#([\w-]+)/g, (_, t: string) => {
        tagNames.push(t)
        return ''
      })
      let endDate: string | null = null
      rest = rest.replace(/@(\d{4}-\d{2}-\d{2})/g, (_, d: string) => {
        endDate = d
        return ''
      })
      // strip trailing (repo#n)
      rest = rest.replace(/\s*\([^)]*#\d+\)\s*$/, '').trim()
      current = {
        name: rest.replace(/\s+/g, ' ').trim(),
        completed,
        tagNames: tagNames.length ? tagNames : undefined,
        endDate,
      }
      continue
    }

    // Bullet without checkbox
    const bullet = line.match(/^[-*•]\s+(.+)$/)
    if (bullet) {
      flush()
      current = { name: bullet[1]!.trim() }
      continue
    }

    // Numbered
    const num = line.match(/^\d+[.)]\s+(.+)$/)
    if (num) {
      flush()
      current = { name: num[1]!.trim() }
      continue
    }

    // Plain line
    flush()
    current = { name: line }
  }
  flush()
  return tasks.filter((t) => t.name)
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function slugifyFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'tasks'
  )
}
