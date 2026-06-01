# Backend (Rust / Tauri)

Handy's backend is a single Rust crate (`handy`, library name `handy_app_lib`) built on Tauri v2. It owns all the heavy lifting: audio capture, model download/load, on-device transcription, history persistence, the system tray, the recording overlay, global shortcuts, and the command/IPC surface the React frontend talks to. Source lives under `Handy/src-tauri/src`.

This doc maps the modules, explains how the app boots in `lib.rs`, and details the managers and the Tauri command/IPC layer. The low-level audio internals, the LLM post-processing path, and settings persistence each have their own sections (see `audio-pipeline.md`, `post-processing.md`, and `settings-and-storage.md`); they are referenced here but not re-explained.

## Module map

| Path | Role |
| --- | --- |
| `Handy/src-tauri/src/main.rs` | Binary entry point. Parses CLI args with `clap`, sets a Linux WebKit workaround, then calls `handy_app_lib::run`. |
| `Handy/src-tauri/src/lib.rs` | The spine. Builds the Tauri app: registers commands/plugins, creates managers, sets up tray/overlay/shortcuts, exports TypeScript bindings. |
| `Handy/src-tauri/src/cli.rs` | `CliArgs` (clap derive): `--start-hidden`, `--no-tray`, `--toggle-transcription`, `--toggle-post-process`, `--cancel`, `--debug`. |
| `Handy/src-tauri/src/managers/` | Core business logic: audio recording, model management, transcription engine, history. |
| `Handy/src-tauri/src/commands/` | Tauri command handlers (the frontend IPC surface). |
| `Handy/src-tauri/src/transcription_coordinator.rs` | Single-threaded state machine that serializes record/transcribe lifecycle events. |
| `Handy/src-tauri/src/actions.rs` | The record -> transcribe -> post-process -> paste pipeline, plus the shortcut `ACTION_MAP`. |
| `Handy/src-tauri/src/shortcut/` | Global keyboard shortcut binding, handling, and `handy-keys` integration. |
| `Handy/src-tauri/src/audio_toolkit/` | Low-level audio: device enumeration, recording, resampling, VAD, WAV I/O, text filtering. Covered in `audio-pipeline.md`. |
| `Handy/src-tauri/src/settings.rs` | `AppSettings` plus `get_settings`/`write_settings` over `tauri-plugin-store`. Covered in `settings-and-storage.md`. |
| `Handy/src-tauri/src/tray.rs`, `tray_i18n.rs` | System tray icon/menu and its localized strings. |
| `Handy/src-tauri/src/overlay.rs` | Platform-specific recording overlay window. |
| `Handy/src-tauri/src/signal_handle.rs` | `send_transcription_input()` and Unix SIGUSR1/SIGUSR2 handlers. |
| `Handy/src-tauri/src/utils.rs` | Re-exports `clipboard`/`overlay`/`tray` and hosts `cancel_current_operation` plus Linux env helpers. |
| `Handy/src-tauri/src/helpers/` | `clamshell.rs` (laptop/lid detection, exposes the `is_laptop` command). |
| `Handy/src-tauri/src/llm_client.rs` | HTTP client for LLM post-processing. Covered in `post-processing.md`. |
| `Handy/src-tauri/src/apple_intelligence.rs` | macOS aarch64 native post-processing via Apple Intelligence. |
| `Handy/src-tauri/src/audio_feedback.rs`, `clipboard.rs`, `input.rs`, `portable.rs` | Feedback sounds, clipboard paste, Enigo keyboard simulation, portable-mode path resolution. |

## App setup in `lib.rs`

`run(cli_args)` (in `Handy/src-tauri/src/lib.rs`) is the real entry point invoked from `main.rs`. It executes roughly in this order:

1. **Portable mode** is detected first via `portable::init()`, which decides whether app data lives next to the executable or in the OS app-data dir.
2. **Logging filters** are built. Console output respects `RUST_LOG` (`build_console_filter`); file logging level is held in the global `FILE_LOG_LEVEL: AtomicU8` and applied by the `tauri-plugin-log` target.
3. **The `tauri-specta` `Builder`** is constructed with `collect_commands![...]` (the full IPC surface, see below) and `collect_events![managers::history::HistoryUpdatePayload]`. In debug builds it exports TypeScript bindings to `../src/bindings.ts`.
4. **Plugins are registered** on the `tauri::Builder` (see Plugin registration below).
5. **`.setup(...)`** runs on app start: it mounts specta events, programmatically builds the `main` WebviewWindow (so portable mode can redirect the WebView2 cache via `data_directory`), reconciles `--debug` overrides, stores the file log level, creates the `TranscriptionCoordinator` into managed state, then calls `initialize_core_logic`, pre-warms GPU enumeration on a background thread, and decides whether to show the main window.

### Managers created and stored in Tauri state

`initialize_core_logic(app_handle)` in `Handy/src-tauri/src/lib.rs` is where the managers come to life. Each is wrapped in `Arc`, constructed with the `AppHandle`, and handed to Tauri's managed state via `app_handle.manage(...)`:

```
recording_manager   = Arc::new(AudioRecordingManager::new(app_handle)?)
model_manager       = Arc::new(ModelManager::new(app_handle)?)
transcription_manager = Arc::new(TranscriptionManager::new(app_handle, model_manager.clone())?)
history_manager     = Arc::new(HistoryManager::new(app_handle)?)
```

`TranscriptionManager` depends on `ModelManager` and receives a clone of it. Note that `TranscriptionCoordinator` is created and managed earlier, in the `.setup` closure, not in `initialize_core_logic`. Two managers are deliberately *not* eagerly initialized here:

- **Enigo** (keyboard/mouse simulation, `input.rs`) — the frontend calls the `initialize_enigo` command after onboarding so macOS doesn't prompt for accessibility permission prematurely.
- **Shortcuts** — the frontend calls `initialize_shortcuts` after permissions are confirmed.

After managing the state, `initialize_core_logic` also calls `managers::transcription::apply_accelerator_settings(app_handle)` to push the user's GPU/CPU accelerator preferences into `transcribe-rs` before any model loads.

### Plugin registration

`run()` registers the Tauri plugins that back the rest of the app, including: `tauri_plugin_dialog`, `tauri-plugin-log` (with stdout + rotating file targets), `tauri_plugin_single_instance`, `tauri_plugin_fs`, `tauri_plugin_process`, `tauri_plugin_updater`, `tauri_plugin_os`, `tauri_plugin_clipboard_manager`, `tauri_plugin_macos_permissions`, `tauri_plugin_opener`, `tauri_plugin_store`, `tauri_plugin_global_shortcut`, and `tauri_plugin_autostart` (`MacosLauncher::LaunchAgent`). On macOS it additionally registers `tauri_nspanel` for the floating overlay panel.

The **single-instance** handler is the backbone of CLI remote control: a second launch with `--toggle-transcription`, `--toggle-post-process`, or `--cancel` forwards the intent into the running instance (via `signal_handle::send_transcription_input` or `utils::cancel_current_operation`) instead of starting a new process; otherwise it just shows the main window.

### Tray, overlay, and shortcut setup

Still inside `initialize_core_logic` (`Handy/src-tauri/src/lib.rs`):

- **Tray.** A `TrayIconBuilder` builds the system tray with a theme-appropriate idle icon (`tray::get_current_theme` + `tray::get_icon_path`) and tooltip (`tray::tray_tooltip`). The `on_menu_event` handler wires menu IDs: `settings` (show window), `check_updates`, `copy_last_transcript` (`tray::copy_last_transcript`), `unload_model` (calls `TranscriptionManager::unload_model`), `cancel` (`utils::cancel_current_operation`), `quit`, and dynamic `model_select:<id>` items (call `commands::models::switch_active_model` on a worker thread). The built tray is managed into state, the menu is initialized via `utils::update_tray_menu`, visibility honors `show_tray_icon`, and a listener on the `model-state-changed` event refreshes the menu.
- **Overlay.** `utils::create_recording_overlay(app_handle)` creates the hidden recording overlay window (`overlay.rs`).
- **Signals.** On Unix, `signal_handle::setup_signal_handler` listens for SIGUSR1/SIGUSR2.
- **Autostart.** Enabled/disabled to match `settings.autostart_enabled`.
- **macOS activation policy.** If `start_hidden` and the tray is shown, the app switches to `ActivationPolicy::Accessory` so it lives in the tray rather than the dock.

`lib.rs` also defines two small inline commands — `trigger_update_check` and `show_main_window_command` — and the window event handler that intercepts close-requests (hide instead of quit, adjust the macOS dock icon).

## The managers layer (`managers/`)

`Handy/src-tauri/src/managers/mod.rs` declares four submodules: `audio`, `history`, `model`, `transcription`. Each manager is an `Arc`-shared struct held in Tauri state and accessed from commands and the action pipeline.

### `managers/audio.rs` — `AudioRecordingManager`

Owns the microphone lifecycle and the recording state machine. Key responsibilities:

- Holds an `AudioRecorder` (from `audio_toolkit`) configured with a `SmoothedVad` wrapping Silero VAD (`create_audio_recorder`) and a level callback that streams spectrum levels to the frontend via `utils::emit_levels`.
- Models a `MicrophoneMode` (`AlwaysOn` vs `OnDemand`) and a `RecordingState` (`Idle` / `Recording { binding_id }`). In always-on mode the stream opens at construction; in on-demand mode it opens on demand and can lazy-close after a 30s idle timeout (`STREAM_IDLE_TIMEOUT`, `schedule_lazy_close`).
- Resolves the effective input device, including clamshell-mode override (`get_effective_microphone_device`, using `helpers::clamshell`).
- Public surface used elsewhere: `try_start_recording`, `stop_recording` (returns the captured `Vec<f32>` samples, padding very short clips), `cancel_recording`, `is_recording`, `preload_vad`, `start_microphone_stream`/`stop_microphone_stream`, `update_mode`, `update_selected_device`, and `apply_mute`/`remove_mute` (optionally muting system output while recording via OS-specific `set_mute`).

### `managers/model.rs` — `ModelManager`

Owns the catalog of speech-to-text models and their files on disk.

- Builds an in-memory `HashMap<String, ModelInfo>` of all known models. `ModelInfo` carries id, filename, optional download URL + `sha256`, size, scores, supported languages, and an `EngineType` (`Whisper`, `Parakeet`, `Moonshine`, `MoonshineStreaming`, `SenseVoice`, `GigaAM`, `Canary`, `Cohere`). Predefined entries include Whisper Small/Medium/Turbo/Large, Breeze ASR, Parakeet V2/V3, Moonshine base + streaming tiny/small/medium, SenseVoice, GigaAM v3, Canary 180M Flash + 1B v2, and Cohere.
- Auto-discovers user-supplied custom `.bin` Whisper models in the models dir (`discover_custom_whisper_models`), and runs migrations (`migrate_bundled_models`, `migrate_gigaam_to_directory`).
- `download_model` streams downloads with resume support (HTTP Range), throttled progress events (`model-download-progress`), SHA256 verification on a blocking thread, and tar.gz extraction for directory-based models. A `DownloadCleanup` RAII guard resets the `is_downloading` flag on every error path. Companion methods: `cancel_download`, `delete_model`, `get_model_path`, `get_available_models`, `get_model_info`, `auto_select_model_if_needed`.
- Emits many lifecycle events: `model-download-progress`, `model-verification-started/completed`, `model-extraction-started/completed/failed`, `model-download-complete`, `model-download-cancelled`, `model-deleted`.

### `managers/transcription.rs` — `TranscriptionManager`

Owns the loaded inference engine and runs transcription.

- Wraps an `Option<LoadedEngine>` behind a `Mutex`, where `LoadedEngine` is one variant per `EngineType`, each backed by a `transcribe-rs` engine (`WhisperEngine`, `ParakeetModel`, `MoonshineModel`, `StreamingModel`, `SenseVoiceModel`, `GigaAMModel`, `CanaryModel`, `CohereModel`).
- `load_model`/`unload_model`/`initiate_model_load` (background load) manage the engine, emitting `model-state-changed` events (`loading_started`, `loading_completed`, `loading_failed`, `unloaded`). A `LoadingGuard` + condvar serializes concurrent loads (`try_start_loading`).
- `transcribe(Vec<f32>) -> Result<String>` is the core call: it waits for any in-flight load, validates the selected language against the model's supported set (falling back to `auto`), dispatches to the right engine with engine-specific params, and wraps the engine call in `catch_unwind` so an engine panic unloads the model instead of poisoning the mutex. Afterwards it applies custom-word correction (`apply_custom_words`, skipped for Whisper which uses an initial prompt) and filler/hallucination filtering (`filter_transcription_output`).
- A background **idle watcher** thread unloads the model after the configured `model_unload_timeout`; `maybe_unload_immediately` handles the `Immediately` setting after each transcription/cancel.
- Free functions in this module: `apply_accelerator_settings` (pushes whisper/ORT accelerator + GPU device prefs into `transcribe_rs::accel`) and `get_available_accelerators` (cached via `OnceLock`, pre-warmed on startup in `lib.rs`).

### `managers/history.rs` — `HistoryManager`

Owns transcription history persistence and recordings.

- Opens a SQLite DB (`history.db`) via `rusqlite`, runs schema migrations with `rusqlite_migration` (including a one-time conversion from the old `tauri-plugin-sql` `_sqlx_migrations` tracking to the `user_version` pragma).
- `HistoryEntry` rows store the WAV `file_name`, timestamp, `saved` flag, title, `transcription_text`, and post-processing fields (`post_processed_text`, `post_process_prompt`, `post_process_requested`).
- Public methods: `save_entry`, `update_transcription` (used by retry), `get_history_entries` (cursor-paginated), `toggle_saved_status`, `get_entry_by_id`, `delete_entry`, `get_audio_file_path`, `get_latest_completed_entry`, `recordings_dir`, and retention cleanup (`cleanup_old_entries` -> by count or by time depending on `RecordingRetentionPeriod`).
- Emits the typed `HistoryUpdatePayload` event (`Added`/`Updated`/`Deleted`/`Toggled`) — the one event registered in `collect_events!` in `lib.rs`.

## The Tauri command / IPC layer (`commands/`)

`Handy/src-tauri/src/commands/mod.rs` declares four submodules (`audio`, `history`, `models`, `transcription`) and also defines a set of top-level app commands directly. Every command is `#[tauri::command] #[specta::specta]`, and all of them are enumerated in the `collect_commands![...]` macro in `lib.rs` (that macro is the authoritative IPC surface). Commands receive managers through Tauri's `State<'_, Arc<...>>` injection or via `AppHandle`.

> Many setting-mutation commands (e.g. `change_binding`, `change_ptt_setting`, the `change_*_setting` family, `add_post_process_prompt`, `update_custom_words`) live in `shortcut` and are not detailed here — they belong to the settings/post-processing docs.

### Top-level commands (`commands/mod.rs` and `lib.rs`)

- `cancel_operation` — calls `utils::cancel_current_operation`.
- `is_portable`, `get_app_dir_path`, `get_log_dir_path`, `open_recordings_folder`, `open_log_dir`, `open_app_data_dir` — path/portable-mode helpers (open via `tauri_plugin_opener`).
- `get_app_settings`, `get_default_settings`, `set_log_level` — settings access (full settings surface is in `settings-and-storage.md`).
- `check_apple_intelligence_available` — macOS aarch64 feature probe.
- `initialize_enigo`, `initialize_shortcuts` — deferred-init commands the frontend calls post-onboarding; both idempotent via marker state in Tauri state.
- `trigger_update_check`, `show_main_window_command` — defined inline in `lib.rs`.
- `helpers::clamshell::is_laptop` — laptop/lid detection.

### `commands/audio.rs`

Microphone, output device, permissions, and feedback:

`check_custom_sounds`, `get_windows_microphone_permission_status`, `open_microphone_privacy_settings`, `update_microphone_mode`, `get_microphone_mode`, `get_available_microphones`, `set_selected_microphone`, `get_selected_microphone`, `get_available_output_devices`, `set_selected_output_device`, `get_selected_output_device`, `play_test_sound`, `set_clamshell_microphone`, `get_clamshell_microphone`, `is_recording`. Device mutations call back into `AudioRecordingManager` (e.g. `update_mode`, `update_selected_device`). Windows permission status is read from the registry; `get_windows_microphone_permission_status` is also used in `lib.rs` to decide whether to force-show the onboarding window.

### `commands/models.rs`

Model catalog and selection:

`get_available_models`, `get_model_info`, `download_model`, `delete_model`, `cancel_download`, `set_active_model`, `get_current_model`, `get_transcription_model_status`, `is_model_loading`, `has_any_models_available`, `has_any_models_or_downloads`. Most delegate to `ModelManager`; `download_model` emits `model-download-failed` on error. The shared helper `switch_active_model(app, model_id)` (also called from the tray) claims the loading slot via `try_start_loading`, persists the selection, resets the language to `auto` if unsupported, and eagerly loads the model unless the unload timeout is `Immediately`.

### `commands/transcription.rs`

Model load lifecycle for the UI: `set_model_unload_timeout`, `get_model_load_status` (returns `ModelLoadStatus { is_loaded, current_model }`), `unload_model_manually`.

### `commands/history.rs`

History CRUD and retry: `get_history_entries`, `toggle_history_entry_saved`, `get_audio_file_path`, `delete_history_entry`, `retry_history_entry_transcription`, `update_history_limit`, `update_recording_retention_period`. `retry_history_entry_transcription` re-reads the stored WAV (`audio_toolkit::read_wav_samples`), re-runs `TranscriptionManager::transcribe` on a blocking task, re-runs `actions::process_transcription_output`, and writes the result back via `HistoryManager::update_transcription`.

## The transcription coordinator (`transcription_coordinator.rs`)

`TranscriptionCoordinator` (in `Handy/src-tauri/src/transcription_coordinator.rs`) is a single owned worker thread fed by an `mpsc` channel. It exists to **serialize every transcription lifecycle event** — keyboard shortcuts, Unix signals, CLI toggles, and the async transcribe/paste pipeline — through one thread, eliminating races.

It maintains a private `Stage` enum (`Idle`, `Recording(binding_id)`, `Processing`) and processes three command types:

- `Command::Input { binding_id, hotkey_string, is_pressed, push_to_talk }` — debounces rapid presses (30ms), and depending on push-to-talk vs toggle semantics, calls the module-private `start`/`stop` helpers. Those look up the binding in `actions::ACTION_MAP` and invoke `ShortcutAction::start`/`stop`. `start` only advances to `Recording` if the audio manager actually began recording; `stop` advances to `Processing`.
- `Command::Cancel { recording_was_active }` — resets to `Idle` unless mid-`Processing`.
- `Command::ProcessingFinished` — resets to `Idle`.

Public API: `send_input`, `notify_cancel`, `notify_processing_finished`. The coordinator is stored in Tauri state; `signal_handle::send_transcription_input` is the common entry point used by signals and CLI. It does **not** itself load models or transcribe; it delegates to the action pipeline and is told when processing finishes via the `FinishGuard` in `actions.rs`.

## The actions pipeline (`actions.rs`)

`Handy/src-tauri/src/actions.rs` defines the `ShortcutAction` trait and the `ACTION_MAP` (a `Lazy<HashMap>`) binding string IDs to behaviors: `transcribe`, `transcribe_with_post_process` (both `TranscribeAction`, differing only in the `post_process` flag), `cancel` (`CancelAction`), and `test` (`TestAction`). `is_transcribe_binding` (in the coordinator) recognizes the two transcribe IDs.

`TranscribeAction` implements the full record -> VAD -> transcribe -> paste flow:

1. **`start`** — kicks off background model load (`TranscriptionManager::initiate_model_load`) and VAD preload in parallel, switches the tray icon to Recording, shows the recording overlay, then starts recording via `AudioRecordingManager::try_start_recording`. Audio-feedback timing differs between always-on and on-demand mic modes; mute is applied after the start sound. On success it registers the cancel shortcut; on failure (e.g. denied mic permission, no input device) it reverts the UI and emits a `recording-error` event with a classified `error_type`.
2. **`stop`** — unregisters the cancel shortcut, switches the tray to Transcribing, shows the transcribing overlay, unmutes, plays the stop sound, then spawns an async task (guarded by `FinishGuard`, which notifies the coordinator on completion or panic). In that task it: calls `stop_recording` to get the samples, saves the WAV concurrently (`audio_toolkit::save_wav_file` + `verify_wav_file`) while running `TranscriptionManager::transcribe`, then runs `process_transcription_output` (Chinese variant conversion + optional LLM post-processing, see `post-processing.md`), persists a `HistoryManager::save_entry`, and finally pastes the text on the main thread via `utils::paste`. Failures still save an empty-text history entry so the user can retry, and emit `paste-error` if pasting fails.

`process_transcription_output` (and the helpers `post_process_transcription` and `maybe_convert_chinese_variant`) also live in this file but are the subject of `post-processing.md`; the structured-output/LLM logic is not detailed here.

## Supporting modules

- **`tray.rs` / `tray_i18n.rs`** — `tray.rs` defines `TrayIconState` (`Idle`/`Recording`/`Transcribing`) and `AppTheme`, and the helpers used during setup and at runtime: `get_current_theme`, `get_icon_path`, `change_tray_icon`, `tray_tooltip`, `update_tray_menu`, `set_tray_visibility`, and `copy_last_transcript`. `tray_i18n.rs` exposes `get_tray_translations(locale)` returning localized menu strings so the tray menu respects the app language.
- **`overlay.rs`** — creates and drives the small recording overlay window. It has platform-specific implementations (macOS uses an `NSPanel` via `tauri_nspanel`; Linux uses `gtk-layer-shell`; Windows/Linux use a plain `WebviewWindow`). Public functions: `create_recording_overlay`, `show_recording_overlay`, `show_transcribing_overlay`, `show_processing_overlay`, `update_overlay_position`, `hide_recording_overlay`, and `emit_levels` (forwards audio levels to the overlay UI).
- **`signal_handle.rs`** — `send_transcription_input(app, binding_id, source)` is the shared entry used by both Unix signal handlers and the CLI single-instance handler; it forwards into the coordinator's `send_input`. `setup_signal_handler` (Unix only) maps SIGUSR1 -> `transcribe_with_post_process` and SIGUSR2 -> `transcribe`.
- **`utils.rs`** — re-exports `clipboard`, `overlay`, and `tray` for ergonomic access, and hosts `cancel_current_operation(app)` (the centralized cancel path used by the tray, the cancel action, the CLI `--cancel`, and the `cancel_operation` command). It also has Linux environment helpers (`is_wayland`, `is_kde_plasma`, `is_kde_wayland`).
- **`helpers/mod.rs`** — declares the `clamshell` submodule. `helpers/clamshell.rs` provides `is_clamshell()` (lid-closed detection used to pick the clamshell microphone) and the `is_laptop` Tauri command.

## How a dictation request flows end to end

1. A global shortcut press (or signal / CLI flag) reaches `TranscriptionCoordinator::send_input` (via `signal_handle::send_transcription_input` for non-keyboard sources).
2. The coordinator debounces, advances its `Stage`, and calls `ShortcutAction::start`/`stop` from `ACTION_MAP`.
3. `TranscribeAction` drives `AudioRecordingManager` (record + VAD), then `TranscriptionManager` (load + transcribe), then post-processing and `HistoryManager::save_entry`, then `utils::paste`.
4. Throughout, the backend emits events (`model-state-changed`, `model-download-progress`, `HistoryUpdatePayload`, `recording-error`, audio levels) that the React frontend listens to, and the frontend issues commands back through the `commands/` layer.
