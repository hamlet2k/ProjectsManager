import { getSupabase } from '@/lib/supabase/client'

export type AssistantTaskBrief = {
  id: string
  name: string
  completed: boolean
  tags?: string[]
}

export type AssistantAction =
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

export type AssistantPlan = {
  summary: string
  actions: AssistantAction[]
  needs_clarification?: string | null
  model?: string
  error?: string
}

async function invokeAssistant<T>(body: Record<string, unknown>): Promise<T> {
  const supabase = getSupabase()
  const { data, error } = await supabase.functions.invoke('assistant', { body })

  if (error) {
    const ctx = error as { context?: Response; message?: string }
    if (ctx.context && typeof ctx.context.json === 'function') {
      try {
        const errBody = (await ctx.context.json()) as { error?: string }
        if (errBody?.error) throw new Error(errBody.error)
      } catch (e) {
        if (e instanceof Error && e.message !== error.message) throw e
      }
    }
    throw new Error(error.message || 'Assistant request failed')
  }

  const payload = data as T & { error?: string }
  if (payload && typeof payload === 'object' && 'error' in payload && payload.error) {
    throw new Error(String(payload.error))
  }
  return payload as T
}

export async function planAssistantActions(input: {
  scopeId: string
  projectName: string
  transcript: string
  tasks: AssistantTaskBrief[]
  tags: string[]
  projectPrompt?: string | null
}): Promise<AssistantPlan> {
  return invokeAssistant<AssistantPlan>({
    mode: 'plan',
    scope_id: input.scopeId,
    project_name: input.projectName,
    project_prompt: input.projectPrompt ?? null,
    transcript: input.transcript,
    tasks: input.tasks,
    tags: input.tags,
    today: new Date().toISOString().slice(0, 10),
  })
}

export async function generateProjectPrompt(input: {
  scopeId: string
  projectName: string
  userBrief: string
  tags: string[]
  /** When set, generate an export-style AI backlog preamble instead of the voice prompt */
  exportStyleBrief?: string
}): Promise<{ prompt: string; formatted_description?: string | null }> {
  return invokeAssistant<{ prompt: string; formatted_description?: string | null }>({
    mode: 'generate_project_prompt',
    scope_id: input.scopeId,
    project_name: input.projectName,
    user_brief: input.userBrief,
    tags: input.tags,
    export_style_brief: input.exportStyleBrief ?? '',
  })
}

export async function enhanceTaskDraft(input: {
  scopeId: string
  projectName: string
  projectPrompt?: string | null
  tags: string[]
  name: string
  description?: string | null
  tagNames?: string[]
}): Promise<{
  name: string
  description: string | null
  tag_names: string[]
  end_date: string | null
}> {
  return invokeAssistant({
    mode: 'enhance_task',
    scope_id: input.scopeId,
    project_name: input.projectName,
    project_prompt: input.projectPrompt ?? null,
    tags: input.tags,
    task_draft: {
      name: input.name,
      description: input.description ?? null,
      tag_names: input.tagNames ?? [],
    },
    today: new Date().toISOString().slice(0, 10),
  })
}

/** iOS only: server Whisper-compatible transcription. */
export async function transcribeAudio(input: {
  scopeId: string
  audioBase64: string
  mimeType: string
  fileName?: string
  language?: string
}): Promise<{ text: string; model?: string }> {
  return invokeAssistant<{ text: string; model?: string }>({
    mode: 'transcribe',
    scope_id: input.scopeId,
    audio_base64: input.audioBase64,
    mime_type: input.mimeType,
    file_name: input.fileName,
    language: input.language,
  })
}

