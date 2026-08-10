# Voice assistant (Phase 1 MVP)

_Last updated 2026-08-10._

Natural language control for the **current project**: speak or type → plan → execute task actions.

## User flow

### Push-to-talk (primary)

1. Open a project (editors only) → **floating mic** (bottom center).  
2. **Hold** the mic → temporary panel + listening (browser Web Speech).  
3. **Release** → countdown (longer text = more time) → auto-send to the assistant.  
4. **Tap the transcript** during countdown → edit + manual **Do it**.  
5. **Slide right** while holding → lock for longer dictation; tap mic again when done.  
6. Empty speech → panel closes, nothing sent.  
7. Same plan/execute feedback (toast, ambiguity chips, flash).

### Full Voice modal

1. Header **Voice** → type or Listen + **Do it** (good for careful edits / no mic).

### Examples

- “Add buy milk and eggs”  
- “Mark fence repair done”  
- “Add call the plumber under home for tomorrow”  
- “Reopen the milk task”

## Architecture

```text
[Mic / text in SPA]
        ↓
  Browser Web Speech API (SpeechRecognition) → live transcript text
  (Chrome/Edge best; Android merge of progressive finals; free, no server STT)
        ↓
[Edge Function: assistant]  ← API keys stay server-side (mode: plan only)
        ↓ JSON actions
[SPA executePlan] → createTask / setCompleted / createTag / …
        ↓
[Supabase RLS + realtime as usual]
```

### STT notes

- Free **browser** Web Speech (same approach as the Sprites app). No Whisper, no second STT key.
- **Android:** `continuous=false` + restart while holding (progressive finals merge).
- **iOS / iPad / desktop:** `continuous=true` from the hold gesture (iPad was broken when we forced Android’s `continuous=false` + delayed restart).
- Do **not** call `getUserMedia` before `SpeechRecognition`.
- The **LLM** runs only after text exists (plan step).
- Requires **HTTPS**.

## Deploy

```bash
# From repo root, linked Supabase project

# --- OpenAI (default base URL + model if unset) ---
# supabase secrets set ASSISTANT_API_KEY="sk-..."
# supabase secrets set ASSISTANT_MODEL="gpt-4o-mini"

# --- xAI (must set base URL + a current chat model id) ---
# supabase secrets set ASSISTANT_API_KEY="xai-..." \
#   ASSISTANT_BASE_URL="https://api.x.ai/v1" \
#   ASSISTANT_MODEL="grok-4-1-fast-non-reasoning"

# --- OpenRouter (OpenAI-compatible; free / multi-model) ---
# supabase secrets set ASSISTANT_API_KEY="sk-or-v1-..." \
#   ASSISTANT_BASE_URL="https://openrouter.ai/api/v1" \
#   ASSISTANT_MODEL="openrouter/free"
# Or pin a free slug (IDs change — check openrouter.ai/models), e.g.:
#   ASSISTANT_MODEL="meta-llama/llama-3.3-70b-instruct:free"

supabase functions deploy assistant
```

Aliases accepted: `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL`, or `XAI_API_KEY` / `XAI_BASE_URL` / `XAI_MODEL`.

### What this function actually calls

Only **OpenAI-compatible Chat Completions** (`POST …/chat/completions`) with `response_format: json_object`.  
It does **not** use xAI Voice Agent, OpenAI Realtime, Assistants, images, TTS, or Whisper / audio transcriptions.

| Provider | Base URL | Model id examples (set as `ASSISTANT_MODEL`) |
|----------|----------|-----------------------------------------------|
| OpenAI | `https://api.openai.com/v1` (default) | `gpt-4o-mini` (cheap default), `gpt-4o` |
| xAI | `https://api.x.ai/v1` | **Recommended:** `grok-4.20-0309-non-reasoning` (or alias `grok-4.20` if offered). Alternatives: `grok-4.3`, `grok-build-0.1` (cheapest). **Avoid for this feature:** Voice / Imagine / multi-agent / pure reasoning unless matching quality needs. |
| **OpenRouter** | `https://openrouter.ai/api/v1` | `openrouter/free` (dynamic free router), any `*:free` model, or paid models via one key |

**OpenRouter / free models**

- Drop-in: same three secrets — **no code change**.
- Free routes have **low rate limits** and rotating catalog; OK for light personal use, not a hard SLA.
- Some free models are weaker at strict JSON; if plans fail, pin a stronger free model or keep a cheap paid one for reliability.
- Switch anytime with `supabase secrets set` (no function redeploy needed for secret values).

### Key creation tips

**xAI console**

- Create a normal **API key** with access to **text / chat** models (not “Voice only”).
- You usually do **not** pick the runtime model on the key itself — you pick it via `ASSISTANT_MODEL` on each request (our secret).
- If the UI lists models for the key, enable whatever current **Grok chat/text** models you plan to use; leave Voice / image / video off if you can.

**OpenAI platform**

- Prefer a **project** key with **Restricted** permissions.
- Allow **Model capabilities → Write** (or the permission that covers chat completions / model requests).
- Disable what we do **not** use: Assistants, Realtime, Images, Audio, Fine-tuning, etc., if the UI offers per-endpoint toggles.
- Optional: restrict the **project** allow-list to `gpt-4o-mini` (and maybe `gpt-4o`) so a leaked key cannot burn spend on o1 / video / etc.

### xAI Voice Agent — should we use it?

**No for Phase 1.** That product is real-time speech-to-speech (WebSocket `/v1/realtime`), different architecture and billing.  
Our flow is: **browser mic → text → plan JSON → app executes under RLS**. That keeps the key server-side, works when the user only types, and reuses the same tools later for MCP/chat. Voice Agent is a possible **later** experiment, not required for this MVP.

## Limits (MVP)

- Current project only  
- Actions: **create** (smart title/description/tags), **complete**, **uncomplete**, **add_tags**, **update_task**, **set_view** (search / sort / show completed / tag filter)  
- No delete, no cross-project, no GitHub from voice yet  
- STT quality depends on the browser (Chrome/Edge best; iOS Safari often weak — type instead)  
- Requires network + configured LLM secret for plan  

## Code

| Path | Role |
|------|------|
| `supabase/functions/assistant/` | Plan only (LLM) |
| `web/src/features/assistant/api.ts` | Invoke function |
| `web/src/features/assistant/executePlan.ts` | Run actions |
| `web/src/features/assistant/speech.ts` | Browser Web Speech helpers + countdown |
| `web/src/features/assistant/VoiceHoldFab.tsx` | Push-to-talk FAB |
| `web/src/features/assistant/VoiceAssistant.tsx` | Full modal UI + STT |
| `web/src/pages/ScopePage.tsx` | Button + FAB wiring |
