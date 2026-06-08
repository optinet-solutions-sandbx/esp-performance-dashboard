# Voice Message — Design Spec
**Date:** 2026-06-08
**Status:** Approved

---

## Overview

Add a voice recording button to the Ask AI chat input. When the user stops recording, the audio is transcribed via OpenAI Whisper and auto-sent as a chat message. Applies to both the full Ask AI tab and the floating bubble, since both share `ChatPanel`.

---

## Architecture

### Files changed
| File | Change |
|------|--------|
| `src/components/ui/ChatPanel.tsx` | Add mic button + recording state machine |
| `src/app/api/transcribe/route.ts` | New route — receives audio blob, returns Whisper transcript |

No changes to `AskAIView.tsx`, `AskAIBubble.tsx`, `useAskAI.ts`, or any types.

### Data flow
1. User clicks mic → `MediaRecorder` starts on `audio/webm` stream from `getUserMedia`
2. User clicks stop → recorder stops, collected chunks merged into a `Blob`
3. Blob `POST`ed as `multipart/form-data` (field name `audio`) to `/api/transcribe`
4. Server calls `openai.audio.transcriptions.create({ model: 'whisper-1', file })` using the existing `OPENAI_API_KEY`
5. Returns `{ text: string }` → client calls `onSend(text)` automatically

---

## API Route — `/api/transcribe`

- Method: `POST`, `multipart/form-data`
- Input field: `audio` (Blob, any format Whisper accepts: webm, mp4, wav, etc.)
- Response: `{ text: string }` on success, `{ error: string }` on failure
- Uses existing `openai` npm package and `OPENAI_API_KEY` env var
- No new dependencies

---

## ChatPanel UI

### Mic button placement
Sits to the left of the existing Send button in the input row.

### States
| State | Button appearance | Textarea |
|-------|-------------------|----------|
| `idle` | Mic icon, muted color | Normal, editable |
| `recording` | Red pulsing stop icon | Disabled, placeholder: `"Recording…"` |
| `transcribing` | Spinner | Disabled, placeholder: `"Transcribing…"` |
| `error` | Mic icon (reset) | Shows `"Could not transcribe, try again"` briefly then resets |

### Behavior
- Recording state is local to `ChatPanel` (`useState`) — no store changes
- `MediaRecorder` uses `audio/webm` (universally supported in Chrome/Edge/Firefox)
- On stop: chunks → `Blob` → FormData → fetch `/api/transcribe` → `onSend(transcript)`
- Send button and textarea are disabled during `recording` and `transcribing` states
- If `getUserMedia` is denied, show a brief error and return to idle

---

## Error Handling
- Microphone permission denied → error message in textarea placeholder, reset to idle
- Network/API failure → error message in textarea placeholder, reset to idle
- Empty transcript returned → do nothing, reset to idle silently

---

## Scope / Out of Scope
- **In scope**: record → transcribe → auto-send in ChatPanel (bubble + tab)
- **Out of scope**: live/streaming transcription, playback of recorded audio, storing voice messages, language selection
