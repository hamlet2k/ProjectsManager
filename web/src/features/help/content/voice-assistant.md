---
title: Voice assistant and troubleshooting
description: Hold-to-talk, browser speech, and common mic issues
order: 50
---

# Voice assistant and troubleshooting

Editors can control the **current project** with natural language: speak or type → plan → actions run under your account (RLS).

## Hold-to-talk (main control)

1. Open a project where you can edit.
2. Use the **floating mic** at the bottom center.
3. **Hold** to listen (browser speech recognition).
4. **Release** → short countdown → the plan is sent.
5. Tap the transcript during countdown to edit, then confirm.
6. Slide / lock (as shown on the control) for longer dictation if available.

Examples:

- “Add buy milk and eggs”
- “Mark fence repair done”
- “Add call the plumber under home for tomorrow”

## How it works

1. **Speech → text** in the browser (Web Speech API) — free, no Whisper.
2. **Plan** via the server assistant (API keys stay on the server).
3. The app **executes** create/complete/tag/etc. with your normal permissions.

## Project AI prompt

In project settings, **AI / voice prompt** steers how the assistant drafts titles, descriptions, and tags for this project. Generate from the project description or write your own.

## Browser support

| Platform | Notes |
|----------|--------|
| **Chrome / Edge (Windows, Android)** | Best Web Speech support |
| **Safari (iOS / iPad)** | Works with hold-to-talk; needs a clean page load — see below |
| **HTTPS** | Required for microphone / speech |

## Troubleshooting

### Mic does nothing / “no speech heard”

- Allow microphone permission for the site.
- Hold longer and speak clearly; release after you finish.
- Prefer Chrome/Edge when possible.

### Worked after “clear site data” only

An old **service worker** or cache can break speech on iPad/Safari. Hard refresh or clear site data for this origin once. The app unregisters stale workers on load; keep the tab on the latest deploy.

### Wrong or incomplete commands

- Edit the transcript before send.
- Improve the project **AI prompt** for domain language (names, tags).
- Ambiguous matches may show choices — pick the right task.

### Only planning fails

Speech may work but the assistant is misconfigured on the server (operator: Edge Function secrets). Users will see a planning error toast.

## Privacy

Audio is processed by the **browser** speech engine for STT. Only the resulting **text** is sent to the assistant for planning.
