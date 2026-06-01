---
description: Analyze Handy's source and regenerate the code documentation for the portal
argument-hint: "[area]  optional focus: frontend | backend | audio  (default all)"
allowed-tools: Bash(find:*), Bash(ls:*), Read, Glob, Grep, Write
---
Regenerate portal/public/data/docs/*.md and portal/public/data/docs-index.json from the
REAL code in Handy/. Ground every claim in actual files (inspect them, do not guess). Cite
source files with relative paths (e.g. Handy/src-tauri/src/transcription_coordinator.rs).

Map first:
- Frontend: Handy/src (React/TS): zustand stores in src/stores (settingsStore, modelStore),
  components (settings, onboarding, overlay, model-selector), hooks, i18n, src/overlay.
  Frontend talks to Rust via Tauri commands (src/bindings.ts).
- Backend: Handy/src-tauri/src (Rust): lib.rs (app setup, manager + plugin registration),
  managers/ (audio, model, transcription, history), commands/ (Tauri IPC),
  audio_toolkit/ (recorder, resampler, vad/silero.rs Silero VAD), transcription_coordinator.rs,
  actions.rs (record -> VAD -> transcribe -> paste pipeline), settings.rs, llm_client.rs,
  clipboard.rs, input.rs, overlay.rs, shortcut/, apple_intelligence.rs, portable.rs, cli.rs.
- Core libs (from Cargo + README Architecture): whisper-rs, transcribe-rs (Parakeet),
  cpal, vad-rs/Silero, rdev, rubato.
- Also read AGENTS.md, README.md (Architecture), BUILD.md, src-tauri/tauri.conf.json,
  and .github/workflows/ for CI.

Produce these markdown sections (skip none unless $ARGUMENTS narrows the area):
- overview.md: what Handy is + architecture (React frontend and Rust backend via Tauri),
  and the control flow shortcut -> record -> VAD -> transcribe -> post-process -> paste.
- frontend.md: structure, zustand state, settings UI, overlay, i18n, Tauri command bridge.
- backend.md: Rust module map, managers, Tauri commands, transcription coordinator, actions.
- audio-pipeline.md: recording (cpal), Silero VAD, Whisper/Parakeet engines, GPU accel, resampling.
- settings-and-storage.md: settings.rs AppSettings, tauri-plugin-store persistence, portable mode.
- shortcuts-and-input.md: global shortcut (shortcut/), push-to-talk vs toggle, clipboard + input paste.
- post-processing.md: llm_client.rs providers (OpenAI/Claude/custom/Apple Intelligence), prompts.
- build-and-release.md: bun/vite/tauri, CI workflows, nix.
- contributing.md: how to extend/fork (from CONTRIBUTING.md + AGENTS.md).

Then write docs-index.json with this shape and set meta.json -> lastUpdated.docs = now:
  {
    "generatedAt": ISO,
    "sections": [{ "id": "overview", "title": "Architecture Overview",
                   "file": "overview.md", "category": "Getting Started", "order": 1 }, ...]
  }
Group sections into sensible categories (Getting Started, Frontend, Backend, Operations).
Keep docs-index.json consistent with whatever files exist, even on a partial (area-scoped) run.
