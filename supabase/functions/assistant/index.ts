/**
 * Voice / text assistant: natural language → structured task actions.
 * Client executes actions with the user session (RLS). This function only plans.
 *
 * Secrets (Supabase function secrets):
 *   ASSISTANT_API_KEY   — required (OpenAI or compatible)
 *   ASSISTANT_BASE_URL  — optional, default https://api.openai.com/v1
 *   ASSISTANT_MODEL     — optional, default gpt-4o-mini
 *   Also accepts OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL as fallbacks.
 *
 * iOS speech-to-text only (mode: transcribe → OpenAI Whisper /audio/transcriptions):
 *   ASSISTANT_STT_API_KEY   — OpenAI (or OpenRouter) key with audio; required if chat is xAI-only
 *   ASSISTANT_STT_BASE_URL  — default https://api.openai.com/v1
 *   ASSISTANT_STT_MODEL     — default whisper-1
 * Android/desktop use free browser STT and do not call this mode.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

type TaskBrief = { id: string; name: string; completed: boolean; tags?: string[] }

type PlannedAction =
  | {
      type: 'create_task'
      name: string
      description?: string | null
      tag_names?: string[]
      end_date?: string | null
    }
  | { type: 'complete_task'; task_id: string }
  | { type: 'complete_task'; match: string }
  | { type: 'uncomplete_task'; task_id: string }
  | { type: 'uncomplete_task'; match: string }
  | { type: 'add_tags'; task_id: string; tag_names: string[] }
  | { type: 'add_tags'; match: string; tag_names: string[] }
  | {
      type: 'update_task'
      task_id?: string
      match?: string
      name?: string
      description?: string | null
      end_date?: string | null
      tag_names?: string[]
    }
  | {
      type: 'set_view'
      search?: string | null
      sort_by?: 'rank' | 'name' | 'due' | 'created' | 'tags'
      show_completed?: boolean
      tag_names?: string[]
      clear_filters?: boolean
    }

type PlanResult = {
  summary: string
  actions: PlannedAction[]
  needs_clarification?: string | null
}

const SYSTEM = `You are a voice assistant for Projects Manager, a family task app.
The user is currently viewing ONE project. All actions apply to that project only.

Given the user's spoken/typed request and the current task list, output a JSON plan:

{
  "summary": "Short plain-language what you will do",
  "actions": [ ... ],
  "needs_clarification": null or "a question if truly ambiguous"
}

Allowed actions only:
1. create_task
   { "type": "create_task", "name": string, "description"?: string|null, "tag_names"?: string[], "end_date"?: "YYYY-MM-DD"|null }
2. complete_task — task_id OR match
3. uncomplete_task — task_id OR match
4. add_tags — task_id OR match + tag_names[] (existing tasks; merges tags)
5. update_task — task_id OR match + optional name, description, end_date, tag_names
6. set_view — board filters/sort only (no data change):
   {
     "type": "set_view",
     "search"?: string|null,          // quick find text; null or "" clears search
     "sort_by"?: "rank"|"name"|"due"|"created"|"tags",
     "show_completed"?: boolean,      // true=show done tasks, false=hide
     "tag_names"?: string[],          // filter list to these tags; [] clears tag filter
     "clear_filters"?: boolean        // reset search/tags/sort to defaults
   }

=== CREATE TASK (smart intake) — REQUIRED when type is create_task ===
- name: SHORT title, about 3–8 words, title case or sentence case. Capture the ACTION + OBJECT.
  Good: "Call plumber about kitchen leak"
  Bad: whole spoken paragraph as the name
- description: remaining detail, context, steps, quotes from the user. null if nothing useful beyond the title.
  If the user gives a long monologue, put the narrative in description and invent a tight name.
- Never put the full dump in both name and description. Prefer: short name + richer description.
- tag_names: prefer EXISTING project tags from existing_tags / task tags when the content clearly fits
  (e.g. home/kitchen → home, shopping/groceries → shopping, bug/fix → bug).
  Only invent a NEW short tag when the user explicitly names one ("under #vacation") or no existing tag fits at all.
  Do not invent many speculative tags. 0–3 tags is ideal. No # in tag strings.
- end_date: from relative phrases using the provided "today" date (ISO YYYY-MM-DD).

=== VIEW / FILTER (set_view) ===
Use set_view when the user wants to look at the list differently, not change tasks:
- "find milk" / "search fence" → search
- "sort by tags" / "group by tags" / "sort by due date" → sort_by
- "show completed" / "hide completed" / "show done tasks" → show_completed
- "only home tasks" / "filter by shopping" / "show #bug" → tag_names
- "clear filters" / "show everything" / "reset filters" → clear_filters true
- "clear search" → search: ""
You may combine fields in one set_view. You may emit set_view plus task actions when both are intended.

=== GENERAL RULES ===
- Prefer task_id when a single clear match exists in the list.
- Use match only for a unique or intended name fragment.
- If multiple tasks could match a mutate request, set needs_clarification (or use ambiguous match) and avoid guessing.
- Do not invent task ids. Do not delete tasks. Do not change projects.
- Tagging an existing task MUST use add_tags or update_task — never only complete_task.
- Completing AND tagging: complete_task AND add_tags (two actions).
- Empty/garbage speech → needs_clarification.
- Respond with JSON only, no markdown.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Not authenticated' }, 401)

    const body = (await req.json()) as {
      mode?: 'plan' | 'generate_project_prompt' | 'enhance_task' | 'transcribe'
      scope_id?: string
      project_name?: string
      project_prompt?: string | null
      transcript?: string
      tasks?: TaskBrief[]
      tags?: string[]
      today?: string
      user_brief?: string
      task_draft?: {
        name?: string
        description?: string | null
        tag_names?: string[]
      }
      audio_base64?: string
      mime_type?: string
      file_name?: string
      language?: string
    }

    const mode = body.mode || 'plan'
    const scopeId = body.scope_id
    if (!scopeId) return json({ error: 'Missing scope_id' }, 400)

    // Verify the user can at least read this project (RLS)
    const { data: scopeRow, error: scopeErr } = await userClient
      .from('scopes')
      .select('id, name, assistant_prompt')
      .eq('id', scopeId)
      .maybeSingle()
    if (scopeErr || !scopeRow) {
      return json({ error: 'Project not found or no access' }, 403)
    }

    // --- iOS only: audio → text (Whisper). Does not use the chat model. ---
    if (mode === 'transcribe') {
      const b64 = (body.audio_base64 ?? '').trim()
      if (!b64) return json({ error: 'Missing audio_base64' }, 400)
      if (b64.length > 11_000_000) {
        return json({ error: 'Recording too long. Hold a shorter phrase and try again.' }, 413)
      }

      const sttKey =
        Deno.env.get('ASSISTANT_STT_API_KEY') ||
        Deno.env.get('OPENAI_API_KEY') ||
        Deno.env.get('ASSISTANT_API_KEY')
      if (!sttKey) {
        return json(
          {
            error:
              'iOS speech-to-text needs ASSISTANT_STT_API_KEY (OpenAI Whisper key). Chat can stay on xAI.',
          },
          503,
        )
      }

      const chatBase = (
        Deno.env.get('ASSISTANT_BASE_URL') ||
        Deno.env.get('OPENAI_BASE_URL') ||
        Deno.env.get('XAI_BASE_URL') ||
        ''
      ).replace(/\/$/, '')
      const explicitSttBase = (
        Deno.env.get('ASSISTANT_STT_BASE_URL') ||
        Deno.env.get('OPENAI_BASE_URL') ||
        ''
      ).replace(/\/$/, '')
      let sttBase = explicitSttBase
      if (!sttBase) {
        sttBase = /openai\.com|openrouter\.ai/i.test(chatBase)
          ? chatBase
          : 'https://api.openai.com/v1'
      }

      const sttModel = Deno.env.get('ASSISTANT_STT_MODEL') || 'whisper-1'
      const mime = (body.mime_type || 'audio/webm').split(';')[0]!.trim() || 'audio/webm'
      const ext =
        mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')
          ? 'm4a'
          : mime.includes('ogg')
            ? 'ogg'
            : mime.includes('mpeg') || mime.includes('mp3')
              ? 'mp3'
              : mime.includes('wav')
                ? 'wav'
                : 'webm'
      const fileName = (body.file_name || `voice.${ext}`).replace(/[^\w.\-]+/g, '_')

      let bytes: Uint8Array
      try {
        const bin = atob(b64)
        bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      } catch {
        return json({ error: 'Invalid audio encoding' }, 400)
      }
      if (bytes.byteLength < 64) {
        return json({ error: 'Recording too short — hold the mic and speak a bit longer.' }, 400)
      }

      const form = new FormData()
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      form.append('file', new File([ab], fileName, { type: mime }))
      form.append('model', sttModel)
      const lang = (body.language || '').trim()
      if (lang && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(lang)) {
        form.append('language', lang.slice(0, 2))
      }

      try {
        const sttRes = await fetch(`${sttBase}/audio/transcriptions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sttKey}`,
            ...(Deno.env.get('ASSISTANT_HTTP_REFERER')
              ? { 'HTTP-Referer': Deno.env.get('ASSISTANT_HTTP_REFERER')! }
              : {}),
            ...(Deno.env.get('ASSISTANT_APP_TITLE')
              ? { 'X-Title': Deno.env.get('ASSISTANT_APP_TITLE')! }
              : {}),
          },
          body: form,
        })
        if (!sttRes.ok) {
          const errText = await sttRes.text()
          console.error('STT error', sttRes.status, errText.slice(0, 500))
          if (sttRes.status === 401 || sttRes.status === 403) {
            return json(
              {
                error:
                  'iOS speech auth failed. Set ASSISTANT_STT_API_KEY to an OpenAI key (Whisper). xAI chat keys cannot transcribe.',
              },
              502,
            )
          }
          throw new Error(`Speech-to-text error (${sttRes.status}). Check ASSISTANT_STT_* secrets.`)
        }
        const sttJson = (await sttRes.json()) as { text?: string }
        const text = String(sttJson.text ?? '')
          .replace(/\s+/g, ' ')
          .trim()
        return json({ text, model: sttModel })
      } catch (e) {
        return json(
          { error: e instanceof Error ? e.message : 'Transcription failed' },
          502,
        )
      }
    }

    const apiKey =
      Deno.env.get('ASSISTANT_API_KEY') ||
      Deno.env.get('OPENAI_API_KEY') ||
      Deno.env.get('XAI_API_KEY')
    if (!apiKey) {
      return json(
        {
          error:
            'Assistant is not configured. Set ASSISTANT_API_KEY (or OpenAI/xAI/OpenRouter) on the assistant Edge Function.',
        },
        503,
      )
    }

    const baseUrl = (
      Deno.env.get('ASSISTANT_BASE_URL') ||
      Deno.env.get('OPENAI_BASE_URL') ||
      Deno.env.get('XAI_BASE_URL') ||
      'https://api.openai.com/v1'
    ).replace(/\/$/, '')

    const model =
      Deno.env.get('ASSISTANT_MODEL') ||
      Deno.env.get('OPENAI_MODEL') ||
      Deno.env.get('XAI_MODEL') ||
      'gpt-4o-mini'

    const callLlm = async (
      system: string,
      userContent: string,
      temperature = 0.2,
    ): Promise<string> => {
      const llmRes = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(Deno.env.get('ASSISTANT_HTTP_REFERER')
            ? { 'HTTP-Referer': Deno.env.get('ASSISTANT_HTTP_REFERER')! }
            : {}),
          ...(Deno.env.get('ASSISTANT_APP_TITLE')
            ? { 'X-Title': Deno.env.get('ASSISTANT_APP_TITLE')! }
            : {}),
        },
        body: JSON.stringify({
          model,
          temperature,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userContent },
          ],
        }),
      })
      if (!llmRes.ok) {
        const errText = await llmRes.text()
        console.error('LLM error', llmRes.status, errText.slice(0, 500))
        throw new Error(
          `Assistant model error (${llmRes.status}). Check ASSISTANT_* secrets and model name.`,
        )
      }
      const llmJson = (await llmRes.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const content = llmJson.choices?.[0]?.message?.content
      if (!content) throw new Error('Empty model response')
      return content
    }

    const projectName = body.project_name || (scopeRow as { name: string }).name
    const storedPrompt =
      body.project_prompt ??
      (scopeRow as { assistant_prompt?: string | null }).assistant_prompt ??
      null

    // --- Mode: craft a saved project AI prompt from a user brief ---
    if (mode === 'generate_project_prompt') {
      const brief = (body.user_brief ?? '').trim()
      if (!brief) return json({ error: 'Empty user_brief' }, 400)
      const exportStyle = (body.export_style_brief ?? '').trim()
      const system = exportStyle
        ? `You write an export-only AI backlog preamble for a task list export (Markdown for coding agents).
Return JSON only: { "prompt": "..." }
Use the project context and the user's style request. The prompt is pasted at the top of an exported task list.
Keep it short (40–120 words), imperative, and specific to how an agent should work the backlog.
Do not include task data.`
        : `You write project-specific instructions for a task-management voice assistant.
Return JSON only:
{
  "prompt": "instructions for the voice assistant",
  "formatted_description": "optional cleaner project description for the UI, or null"
}
Rules:
- "prompt" is concise (about 80–250 words), second person to the assistant ("You help the user with…").
- Cover: what the project is about, terminology, how tags are used, title/description habits, due dates.
- "formatted_description" may lightly polish the user's project description for humans (1–3 short paragraphs) or null to leave it unchanged.
- Do not include JSON action schemas — only project context.`
      try {
        const content = await callLlm(
          system,
          JSON.stringify({
            project_name: projectName,
            project_description: brief,
            existing_tags: body.tags ?? [],
            existing_voice_prompt: storedPrompt,
            export_style_request: exportStyle || null,
          }),
          0.4,
        )
        const parsed = JSON.parse(content) as {
          prompt?: string
          formatted_description?: string | null
        }
        const prompt = String(parsed.prompt ?? '').trim()
        if (!prompt) return json({ error: 'Model returned empty prompt' }, 502)
        return json({
          prompt: prompt.slice(0, 8000),
          formatted_description:
            parsed.formatted_description != null
              ? String(parsed.formatted_description).slice(0, 4000)
              : null,
          model,
        })
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'Generate failed' }, 502)
      }
    }

    // --- Mode: polish a single task draft ---
    if (mode === 'enhance_task') {
      const draft = body.task_draft ?? {}
      const system = `You improve a task draft for a family/project task app.
Return JSON only:
{
  "name": "short title 3-8 words",
  "description": "optional markdown details or null",
  "tag_names": ["existing or short new tags without #"],
  "end_date": "YYYY-MM-DD or null"
}
Rules:
- Prefer existing_tags when they fit intent.
- Keep title short; put extra detail in description.
- Do not invent unrelated tags.
- Honor project_instructions if provided.`
      try {
        const content = await callLlm(
          system,
          JSON.stringify({
            project_name: projectName,
            project_instructions: storedPrompt,
            existing_tags: body.tags ?? [],
            draft: {
              name: draft.name ?? '',
              description: draft.description ?? null,
              tag_names: draft.tag_names ?? [],
            },
            today: body.today || new Date().toISOString().slice(0, 10),
          }),
          0.3,
        )
        const parsed = JSON.parse(content) as {
          name?: string
          description?: string | null
          tag_names?: string[]
          end_date?: string | null
        }
        const name = String(parsed.name ?? draft.name ?? '').trim().slice(0, 200)
        if (!name) return json({ error: 'Could not enhance: empty title' }, 502)
        return json({
          name,
          description:
            parsed.description != null ? String(parsed.description).slice(0, 4000) : null,
          tag_names: Array.isArray(parsed.tag_names)
            ? parsed.tag_names
                .map((t) => String(t).replace(/^#/, '').trim())
                .filter(Boolean)
                .slice(0, 10)
            : [],
          end_date:
            parsed.end_date && /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.end_date))
              ? String(parsed.end_date)
              : null,
          model,
        })
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'Enhance failed' }, 502)
      }
    }

    // --- Mode: plan (default voice/text commands) ---
    const transcript = (body.transcript ?? '').trim()
    if (!transcript) return json({ error: 'Empty transcript' }, 400)

    const today = body.today || new Date().toISOString().slice(0, 10)
    const taskCatalog = (body.tasks ?? []).slice(0, 200).map((t) => ({
      id: t.id,
      name: t.name,
      completed: Boolean(t.completed),
      tags: t.tags ?? [],
    }))
    const projectTags = body.tags ?? []

    const userPayload = {
      project_name: projectName,
      project_instructions: storedPrompt,
      today,
      existing_tags: projectTags,
      tasks: taskCatalog,
      user_said: transcript,
    }

    const systemWithProject = storedPrompt
      ? `${SYSTEM}\n\n=== PROJECT-SPECIFIC INSTRUCTIONS (highest priority for this project) ===\n${String(storedPrompt).slice(0, 6000)}`
      : SYSTEM

    let content: string
    try {
      content = await callLlm(systemWithProject, JSON.stringify(userPayload), 0.2)
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'LLM failed' }, 502)
    }

    let plan: PlanResult
    try {
      plan = JSON.parse(content) as PlanResult
    } catch {
      return json({ error: 'Model returned invalid JSON', raw: content.slice(0, 400) }, 502)
    }

    const cleanTagNames = (raw: unknown): string[] =>
      Array.isArray(raw)
        ? raw
            .map((t) => String(t).replace(/^#/, '').trim())
            .filter(Boolean)
            .slice(0, 10)
        : []

    const resolveTarget = (
      c: { task_id?: string; match?: string },
    ): { task_id: string } | { match: string } | null => {
      if (c.task_id && taskCatalog.some((t) => t.id === c.task_id)) {
        return { task_id: c.task_id }
      }
      if (c.match && String(c.match).trim()) {
        return { match: String(c.match).trim().slice(0, 120) }
      }
      return null
    }

    // Sanitize actions
    const allowed = new Set([
      'create_task',
      'complete_task',
      'uncomplete_task',
      'add_tags',
      'update_task',
      'set_view',
    ])
    const actions: PlannedAction[] = []
    for (const a of plan.actions ?? []) {
      if (!a || typeof a !== 'object' || !('type' in a)) continue
      const type = (a as { type: string }).type
      if (!allowed.has(type)) continue
      if (type === 'create_task') {
        const c = a as Extract<PlannedAction, { type: 'create_task' }>
        const name = String(c.name ?? '').trim()
        if (!name) continue
        actions.push({
          type: 'create_task',
          name: name.slice(0, 200),
          description: c.description != null ? String(c.description).slice(0, 4000) : null,
          tag_names: cleanTagNames(c.tag_names),
          end_date:
            c.end_date && /^\d{4}-\d{2}-\d{2}$/.test(String(c.end_date))
              ? String(c.end_date)
              : null,
        })
      } else if (type === 'complete_task' || type === 'uncomplete_task') {
        const c = a as { type: 'complete_task' | 'uncomplete_task'; task_id?: string; match?: string }
        const target = resolveTarget(c)
        if (!target) continue
        actions.push({ type: c.type, ...target })
      } else if (type === 'add_tags') {
        const c = a as { type: 'add_tags'; task_id?: string; match?: string; tag_names?: unknown }
        const target = resolveTarget(c)
        const tag_names = cleanTagNames(c.tag_names)
        if (!target || !tag_names.length) continue
        actions.push({ type: 'add_tags', ...target, tag_names })
      } else if (type === 'update_task') {
        const c = a as {
          type: 'update_task'
          task_id?: string
          match?: string
          name?: string
          description?: string | null
          end_date?: string | null
          tag_names?: unknown
        }
        const target = resolveTarget(c)
        if (!target) continue
        const name = c.name != null ? String(c.name).trim().slice(0, 200) : undefined
        const description =
          c.description !== undefined
            ? c.description == null
              ? null
              : String(c.description).slice(0, 4000)
            : undefined
        const end_date =
          c.end_date === null
            ? null
            : c.end_date && /^\d{4}-\d{2}-\d{2}$/.test(String(c.end_date))
              ? String(c.end_date)
              : undefined
        const tag_names = cleanTagNames(c.tag_names)
        if (!name && description === undefined && end_date === undefined && !tag_names.length) {
          continue
        }
        actions.push({
          type: 'update_task',
          ...target,
          ...(name ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(end_date !== undefined ? { end_date } : {}),
          ...(tag_names.length ? { tag_names } : {}),
        })
      } else if (type === 'set_view') {
        const c = a as {
          type: 'set_view'
          search?: string | null
          sort_by?: string
          show_completed?: boolean
          tag_names?: unknown
          clear_filters?: boolean
        }
        const sortOk = ['rank', 'name', 'due', 'created', 'tags'] as const
        const sort_by = sortOk.includes(c.sort_by as (typeof sortOk)[number])
          ? (c.sort_by as (typeof sortOk)[number])
          : undefined
        const tag_names = c.tag_names !== undefined ? cleanTagNames(c.tag_names) : undefined
        const clear_filters = Boolean(c.clear_filters)
        const hasSearch = c.search !== undefined
        const hasShow = typeof c.show_completed === 'boolean'
        if (!clear_filters && !hasSearch && !sort_by && !hasShow && tag_names === undefined) {
          continue
        }
        actions.push({
          type: 'set_view',
          ...(clear_filters ? { clear_filters: true } : {}),
          ...(hasSearch ? { search: c.search == null ? null : String(c.search).slice(0, 200) } : {}),
          ...(sort_by ? { sort_by } : {}),
          ...(hasShow ? { show_completed: Boolean(c.show_completed) } : {}),
          ...(tag_names !== undefined ? { tag_names } : {}),
        })
      }
    }

    return json({
      summary: String(plan.summary ?? '').slice(0, 500) || 'OK',
      actions,
      needs_clarification: plan.needs_clarification
        ? String(plan.needs_clarification).slice(0, 400)
        : null,
      model,
    })
  } catch (e) {
    console.error(e)
    return json({ error: e instanceof Error ? e.message : 'Assistant failed' }, 500)
  }
})
