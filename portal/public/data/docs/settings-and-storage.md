# Settings & Storage

Handy keeps all of its configuration in a single typed settings object on the Rust side, persists it to a JSON store on disk via `tauri-plugin-store`, and exposes it to the React frontend through Tauri commands. This section covers the settings model, how it is persisted, how portable mode relocates the data directory, the on-disk layout for models / history / logs, and how the frontend reads and writes settings.

All claims below are grounded in source. Key files:

- `Handy/src-tauri/src/settings.rs` — the `AppSettings` model, defaults, load/save helpers
- `Handy/src-tauri/src/portable.rs` — portable mode detection and data-dir relocation
- `Handy/src-tauri/src/lib.rs` — Tauri plugin wiring and the file-log target
- `Handy/src-tauri/src/commands/mod.rs` — path commands (`get_app_dir_path`, `get_log_dir_path`, etc.)
- `Handy/src-tauri/src/managers/model.rs` and `Handy/src-tauri/src/managers/history.rs` — where models / history live
- `Handy/src/stores/settingsStore.ts`, `Handy/src/hooks/useSettings.ts` — frontend state and update flow
- `Handy/src/components/settings/AppDataDirectory.tsx`, `Handy/src/components/settings/debug/DebugPaths.tsx`, `Handy/src/components/settings/debug/LogDirectory.tsx` — UI that surfaces paths

## The `AppSettings` model

The single source of truth is the `AppSettings` struct in `Handy/src-tauri/src/settings.rs`. It derives `Serialize, Deserialize, Debug, Clone, Type` (the `Type` derive comes from `specta`, which generates the matching TypeScript `AppSettings` type used by the frontend). Nearly every field carries a `#[serde(default = "...")]` attribute so that older, partially-populated stores still deserialize and gain new fields with sensible defaults.

The struct is large (roughly 50 fields). Rather than dump all of them, here is the overall shape with representative fields:

```rust
#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct AppSettings {
    pub bindings: HashMap<String, ShortcutBinding>,   // keyboard shortcuts by id
    pub push_to_talk: bool,
    pub audio_feedback: bool,
    #[serde(default = "default_audio_feedback_volume")]
    pub audio_feedback_volume: f32,
    #[serde(default = "default_sound_theme")]
    pub sound_theme: SoundTheme,                       // Marimba | Pop | Custom
    // ... start_hidden, autostart_enabled, update_checks_enabled ...
    #[serde(default = "default_model")]
    pub selected_model: String,
    #[serde(default)]
    pub selected_microphone: Option<String>,
    // ... language, overlay, debug, logging ...
    #[serde(default = "default_history_limit")]
    pub history_limit: usize,
    #[serde(default = "default_recording_retention_period")]
    pub recording_retention_period: RecordingRetentionPeriod,
    // ... paste / clipboard / auto-submit behavior ...
    #[serde(default = "default_post_process_api_keys")]
    pub post_process_api_keys: SecretMap,              // redacted in Debug output
    // ... accelerators, typing tool, etc.
}
```

(See `Handy/src-tauri/src/settings.rs` lines 337–433 for the full field list.)

Most enum-typed fields use `#[serde(rename_all = "snake_case")]` or `"lowercase"`, so they serialize as readable strings (e.g. `"ctrl_v"`, `"bottom"`, `"min_5"`). `LogLevel` has a hand-written `Deserialize` that accepts both the new string form (`"trace"`..`"error"`) and the legacy numeric form (`1`–`5`), a migration accommodation for old stores.

### Notable settings, grouped

| Group | Representative fields | Notes |
| --- | --- | --- |
| Shortcuts | `bindings` (`HashMap<String, ShortcutBinding>`) | Default keys: `transcribe`, `transcribe_with_post_process`, `cancel`. Platform-specific defaults (e.g. `option+space` on macOS, `ctrl+space` on Windows/Linux). |
| Recording trigger | `push_to_talk`, `keyboard_implementation` | `keyboard_implementation` defaults to `Tauri` on Linux, `HandyKeys` elsewhere. |
| Audio feedback | `audio_feedback`, `audio_feedback_volume` (default `1.0`), `sound_theme` (default `Marimba`) | `Custom` theme reads `custom_start.wav` / `custom_stop.wav` from the data dir. |
| Devices | `selected_microphone`, `clamshell_microphone`, `selected_output_device`, `always_on_microphone`, `mute_while_recording` | All `Option<String>`; `None`/`"Default"` means the system default. |
| Model / transcription | `selected_model` (default `""`), `selected_language` (default `"auto"`), `translate_to_english`, `model_unload_timeout` (default `Min5`), `word_correction_threshold` (default `0.18`), `custom_words`, `custom_filler_words` | |
| Acceleration | `whisper_accelerator` (`Auto`/`Cpu`/`Gpu`), `ort_accelerator` (`Auto`/`Cpu`/`Cuda`/`DirectMl`/`Rocm`), `whisper_gpu_device` (default `-1` = auto) | All default to `Auto`. |
| Output / paste | `paste_method`, `paste_delay_ms` (default `60`), `clipboard_handling`, `auto_submit`, `auto_submit_key`, `append_trailing_space`, `typing_tool`, `external_script_path` | `paste_method` defaults to `Direct` on Linux, `CtrlV` elsewhere. `typing_tool` (Linux) defaults to `Auto`. |
| History | `history_limit` (default `5`), `recording_retention_period` (default `PreserveLimit`) | Controls how many transcriptions / recordings are kept. |
| Post-processing (LLM) | `post_process_enabled`, `post_process_provider_id` (default `"openai"`), `post_process_providers`, `post_process_api_keys`, `post_process_models`, `post_process_prompts`, `post_process_selected_prompt_id` | Ships with built-in providers (OpenAI, Z.AI, OpenRouter, Anthropic, Groq, Cerebras, AWS Bedrock via Mantle, a `Custom` provider, plus Apple Intelligence on macOS ARM64) and one default prompt, "Improve Transcriptions". |
| UI / window | `start_hidden`, `autostart_enabled`, `show_tray_icon` (default `true`), `overlay_position` (default `None` on Linux, `Bottom` elsewhere), `app_language` (default from OS locale) | |
| Diagnostics | `debug_mode`, `log_level` (default `Debug`), `experimental_enabled`, `lazy_stream_close`, `extra_recording_buffer_ms` | |
| Updates | `update_checks_enabled` (default `true`) | |

`get_default_settings()` in `Handy/src-tauri/src/settings.rs` builds a fully-populated `AppSettings` with these platform-aware defaults and is also exposed to the frontend (so "Reset to default" uses the same logic the backend uses).

### Secret handling

API keys are stored in a `SecretMap` newtype wrapping `HashMap<String, String>` (`Handy/src-tauri/src/settings.rs`). It serializes transparently (the JSON is a plain map), but its `Debug` impl replaces every non-empty value with `[REDACTED]`, so keys never leak into log output. Unit tests in the same file assert this redaction.

### Default post-process providers and self-healing

`default_post_process_providers()` returns the built-in provider list, and `ensure_post_process_defaults()` runs on every load/get. It migrates older stores by adding any missing providers, backfilling empty API-key entries, syncing the `supports_structured_output` flag, and seeding default models. If it changes anything, it writes the updated settings back to the store. This is why opening Handy after an update can silently add new providers.

## Persistence: `tauri-plugin-store`

Handy persists settings with `tauri-plugin-store` (`tauri-plugin-store = "2.4.1"` in `Handy/src-tauri/Cargo.toml`). The plugin is registered in `Handy/src-tauri/src/lib.rs` with:

```rust
.plugin(tauri_plugin_store::Builder::default().build())
```

The store file name is a constant in `Handy/src-tauri/src/settings.rs`:

```rust
pub const SETTINGS_STORE_PATH: &str = "settings_store.json";
```

Settings live under the JSON key `"settings"` inside that store file (the whole `AppSettings` object is serialized as one value, not field-by-field keys).

### Load / save flow

`Handy/src-tauri/src/settings.rs` defines the core helpers:

- `load_or_create_app_settings(app)` — opens the store, reads `"settings"`. If present, it deserializes into `AppSettings`, merges in any missing default bindings, and writes back if it added bindings. If parsing fails, it falls back to defaults and overwrites the store. If absent, it writes defaults. Then runs `ensure_post_process_defaults`.
- `get_settings(app)` — the read path used by every command. Same shape: read `"settings"`, deserialize (falling back to defaults on error), run `ensure_post_process_defaults`, return the struct.
- `write_settings(app, settings)` — the write path: opens the store and calls `store.set("settings", ...)`.

All three obtain the store via `app.store(crate::portable::store_path(SETTINGS_STORE_PATH))` — note the `portable::store_path` wrapper, which is how portable mode redirects the file (see below). There are no explicit `store.save()` calls in the Rust code; `tauri-plugin-store` auto-persists `set` mutations to disk, so each `write_settings` reaches the JSON file without a manual flush.

### Where the store file lives on disk

- **Standard install:** the store is opened with the relative path `settings_store.json`, which `tauri-plugin-store` resolves under the app's data directory. The debug UI (`Handy/src/components/settings/debug/DebugPaths.tsx`) documents this as `%APPDATA%/handy/settings_store.json`. The `app_data_dir` is whatever Tauri resolves from the app identifier `com.pais.handy` (`Handy/src-tauri/tauri.conf.json`); on macOS that is `~/Library/Application Support/com.pais.handy/`, and on Linux `~/.local/share/com.pais.handy/` (inferred from Tauri's standard path resolution, not hardcoded in Handy). The Windows `%APPDATA%/handy` form shown in `DebugPaths.tsx` is the on-disk label the app presents to users.
- **Portable install:** the file is written to `<exe_dir>/Data/settings_store.json` (see Portable Mode).

## Portable mode

Portable mode is implemented entirely in `Handy/src-tauri/src/portable.rs` and initialized first thing in `run()` (`Handy/src-tauri/src/lib.rs` calls `portable::init();` before any other setup).

### Detection

`init()` runs once and caches its result in a `OnceLock<Option<PathBuf>>`. It:

1. Finds the executable directory via `std::env::current_exe()`.
2. Looks for a marker file named `portable` next to the exe.
3. Treats the install as portable if the marker contains the magic string `"Handy Portable Mode"` (whitespace-trimmed, prefix match), via `is_valid_portable_marker`.
4. Migration case: if the marker exists but is empty/invalid **and** a `Data/` dir already exists next to the exe (the situation left by v0.8.0, which created an empty marker), it rewrites the marker with the magic string and treats the install as portable.
5. When portable, it ensures `<exe_dir>/Data/` exists (creating it if needed) and caches that path; otherwise it caches `None`.

`is_portable()` returns whether portable mode is active, and is also exposed to the frontend as the `is_portable` command (`Handy/src-tauri/src/commands/mod.rs`).

### How the data directory is relocated

The rest of the module provides portable-aware replacements for Tauri's path APIs, all of which return the portable `Data/` dir when active and fall back to the normal Tauri paths otherwise:

- `app_data_dir(app)` — replaces `app.path().app_data_dir()`.
- `app_log_dir(app)` — returns `Data/logs` when portable, else `app.path().app_log_dir()`.
- `resolve_app_data(app, relative)` — joins a relative path against the data dir.
- `store_path(relative)` — returns an absolute path inside `Data/` when portable (so `tauri-plugin-store` writes there), else the bare relative path. This is exactly what `settings.rs` passes to `app.store(...)`.

In `Handy/src-tauri/src/lib.rs`, portable mode also redirects the WebView2 cache: the main window is built with `.data_directory(data_dir.join("webview"))` when `portable::data_dir()` is `Some`. So a portable install keeps settings, models, recordings, the history DB, logs, and even the webview cache entirely inside the `Data/` folder beside the executable, leaving `%APPDATA%` untouched.

## On-disk layout: models, history, logs

Everything is resolved relative to the app data directory (portable-aware via `crate::portable::app_data_dir`). Confirmed locations:

| Data | Path (relative to app data dir) | Source |
| --- | --- | --- |
| Settings store | `settings_store.json` | `Handy/src-tauri/src/settings.rs` (`SETTINGS_STORE_PATH`) |
| Models | `models/` | `Handy/src-tauri/src/managers/model.rs` — `app_data_dir(app).join("models")`, created if absent |
| Transcription history DB | `history.db` (SQLite) | `Handy/src-tauri/src/managers/history.rs` — `app_data_dir.join("history.db")` |
| Audio recordings | `recordings/` | `Handy/src-tauri/src/managers/history.rs` (`recordings_dir`), also `open_recordings_folder` in `commands/mod.rs` |
| Custom feedback sounds | `custom_start.wav`, `custom_stop.wav` | `Handy/src-tauri/src/commands/audio.rs` via `resolve_app_data` |
| Webview cache (portable only) | `webview/` | `Handy/src-tauri/src/lib.rs` |
| Logs | log dir (`Data/logs` portable, else Tauri log dir) | see below |

### Logs

Logging is configured in `Handy/src-tauri/src/lib.rs` with `tauri-plugin-log`. The plugin runs at `Trace` globally, then two targets:

- **Stdout**, filtered by the console filter (driven by `RUST_LOG`).
- **A rotating file target**, written to `data_dir.join("logs")` (file name `handy`) when portable, otherwise `TargetKind::LogDir` (Tauri's standard log directory). The file target is filtered by a `FILE_LOG_LEVEL` atomic that mirrors the user's `log_level` setting, with rotation `KeepOne` and a 500 KB max file size.

The frontend surfaces the resolved log directory through `Handy/src/components/settings/debug/LogDirectory.tsx`, which calls `commands.getLogDirPath()` (backed by `get_log_dir_path` → `portable::app_log_dir`) and `commands.openLogDir()`. Similarly, `Handy/src/components/settings/AppDataDirectory.tsx` calls `commands.getAppDirPath()` (backed by `get_app_dir_path` → `portable::app_data_dir`) and `commands.openAppDataDir()` to show and open the app data folder. The static `DebugPaths.tsx` component additionally shows the human-readable `%APPDATA%/handy` form for app data, models, and the settings file.

## Frontend: reading and writing settings

State lives in a Zustand store, `Handy/src/stores/settingsStore.ts` (`useSettingsStore`), wrapped for components by `Handy/src/hooks/useSettings.ts` (`useSettings`).

### Loading

On first mount, `useSettings` calls `store.initialize()` if still loading. `initialize()` runs in parallel:

- `loadDefaultSettings()` → `commands.getDefaultSettings()` (the Rust default object, for "reset to default" behavior).
- `refreshSettings()` → `commands.getAppSettings()` (the live persisted settings). The result is normalized so null device fields surface as `"Default"`.
- `checkCustomSounds()`.

It also subscribes to the backend `model-state-changed` event and re-runs `refreshSettings()` when it fires, because the backend can change settings on its own (e.g. resetting language during a model switch). The store comments treat the backend as the source of truth.

### Writing

`updateSetting(key, value)` is the generic write path:

1. It optimistically updates the in-memory Zustand state immediately (so the UI is responsive) and marks the key as updating.
2. It looks up a per-field updater in the `settingUpdaters` map. Each entry maps a settings key to a specific Tauri command, e.g. `push_to_talk → commands.changePttSetting`, `history_limit → commands.updateHistoryLimit`, `log_level → commands.setLogLevel`, `whisper_accelerator → commands.changeWhisperAcceleratorSetting`. These commands are the auto-generated `tauri-specta` bindings in `Handy/src/bindings.ts`.
3. If the command throws, it rolls back the optimistic update to the original value.

So the frontend never writes the store file directly. It calls a typed Tauri command per setting; the corresponding Rust handler mutates and persists. For example `change_ptt_setting` in `Handy/src-tauri/src/shortcut/mod.rs` does:

```rust
pub fn change_ptt_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    let mut settings = settings::get_settings(&app);
    settings.push_to_talk = enabled;
    settings::write_settings(&app, settings);
    Ok(())
}
```

That `get_settings` / mutate / `write_settings` pattern is the standard handler shape, and `write_settings` is what flushes the change into `settings_store.json`.

Bindings and post-processing have dedicated flows in the store: `updateBinding` / `resetBinding` call `commands.changeBinding` / `commands.resetBinding`; post-process helpers (`setPostProcessProvider`, `updatePostProcessApiKey`, `updatePostProcessModel`, `updatePostProcessBaseUrl`, `fetchPostProcessModels`) call their respective commands and then `refreshSettings()` to re-sync from the backend after the write.

### Propagation summary

```
Component → useSettings → useSettingsStore.updateSetting
          → commands.<changeXSetting>  (Tauri command, typed via bindings.ts)
          → Rust handler: get_settings → mutate → write_settings
          → tauri-plugin-store auto-persists "settings" to settings_store.json
```

The backend is authoritative: the frontend re-reads via `getAppSettings()` on init and whenever `model-state-changed` fires, so any settings the backend mutates on its own propagate back into the UI.
