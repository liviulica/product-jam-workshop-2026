# Shortcuts & Input

Handy's core UX is a global keyboard shortcut that records speech and then types or pastes the transcription into whatever app currently has focus. This section explains how shortcuts are registered (with two interchangeable backends), how holding versus tapping the key maps to recording, and how the resulting text is delivered through simulated input or the clipboard.

All claims below are grounded in the Handy source. File paths are given relative to the repository root.

## Global Shortcut System

The shortcut subsystem lives in `Handy/src-tauri/src/shortcut/` and is split into four files:

- `Handy/src-tauri/src/shortcut/mod.rs` — the public, backend-agnostic API plus all the Tauri settings commands.
- `Handy/src-tauri/src/shortcut/handler.rs` — the shared event-handling logic both backends call into.
- `Handy/src-tauri/src/shortcut/tauri_impl.rs` — the Tauri global-shortcut backend.
- `Handy/src-tauri/src/shortcut/handy_keys.rs` — the alternative `handy-keys` backend.

### Bindings

A shortcut is modeled as a `ShortcutBinding` (defined in `Handy/src-tauri/src/settings.rs`) with an `id`, a `name`, a `description`, a `default_binding`, and a `current_binding`. Bindings are stored in a `HashMap<String, ShortcutBinding>` under `settings.bindings`.

The default bindings are created in `get_default_settings()` in `Handy/src-tauri/src/settings.rs`:

- `transcribe` — `option+space` on macOS, `ctrl+space` on Windows/Linux.
- `transcribe_with_post_process` — `option+shift+space` on macOS, `ctrl+shift+space` on Windows/Linux. Only registered when post-processing is enabled.
- `cancel` — `escape`. This binding is special: it is registered dynamically only while recording is active, not at startup.

Each binding `id` maps to an action via the `ACTION_MAP` in `Handy/src-tauri/src/actions.rs` (`transcribe`, `transcribe_with_post_process`, `cancel`, and a `test` action).

### Two backends (keyboard implementations)

`mod.rs` exposes a single facade (`init_shortcuts`, `register_shortcut`, `unregister_shortcut`, `register_cancel_shortcut`, `unregister_cancel_shortcut`) that dispatches on the `KeyboardImplementation` enum from settings (`Handy/src-tauri/src/settings.rs`):

```rust
match user_settings.keyboard_implementation {
    KeyboardImplementation::Tauri => tauri_impl::init_shortcuts(app),
    KeyboardImplementation::HandyKeys => handy_keys::init_shortcuts(app), // with fallback
}
```

The default backend is platform-specific (`KeyboardImplementation::default()` in `Handy/src-tauri/src/settings.rs`): **HandyKeys** on macOS and Windows, **Tauri** on Linux.

If HandyKeys initialization fails, `init_shortcuts` in `Handy/src-tauri/src/shortcut/mod.rs` logs the error, **persists a fallback** to the Tauri backend in settings (so it won't retry HandyKeys on next launch), and initializes the Tauri backend instead.

#### Tauri backend (`tauri_impl.rs`)

Uses the `tauri-plugin-global-shortcut` plugin (declared in `Handy/src-tauri/Cargo.toml` as `tauri-plugin-global-shortcut = "2.3.1"`). `register_shortcut` parses the binding string into a `Shortcut`, refuses duplicate registrations (`app.global_shortcut().is_registered(...)`), and installs a callback via `on_shortcut(...)`. The callback computes `is_pressed = event.state == ShortcutState::Pressed` and forwards to the shared `handle_shortcut_event`.

Validation (`validate_shortcut`) is stricter here: the shortcut must contain at least one non-modifier key, and the `fn`/`function` key is rejected because Tauri does not support it.

#### HandyKeys backend (`handy_keys.rs`)

Uses the `handy-keys` crate (`handy-keys = "0.2.4"` in `Handy/src-tauri/Cargo.toml`) for finer control over keyboard events. Its architecture (documented in the module header):

- A dedicated **manager thread** owns the `HotkeyManager` (created with `HotkeyManager::new_with_blocking()`), ensuring thread-safety since the manager is only touched from one thread.
- `register`/`unregister` calls from the main thread are sent as `ManagerCommand`s over an mpsc channel; responses are awaited synchronously.
- The manager thread polls `manager.try_recv()` for hotkey events, maps the `HotkeyId` back to a binding, computes `is_pressed = event.state == HotkeyState::Pressed`, and calls the same shared `handle_shortcut_event`.

Validation (`validate_shortcut`) is more permissive than Tauri: it accepts modifier-only combos and the `fn` key, only requiring that the string parses as a `Hotkey`.

HandyKeys also supports a separate **recording mode** for UI key capture: `start_handy_keys_recording` / `stop_handy_keys_recording` spin up a `KeyboardListener` on a dedicated thread that emits `handy-keys-event` events (a `FrontendKeyEvent` with modifiers, key, key-down flag, and the full hotkey string) to the frontend.

### Shared event handling (`handler.rs`)

Both backends converge on `handle_shortcut_event(app, binding_id, hotkey_string, is_pressed)` in `Handy/src-tauri/src/shortcut/handler.rs`. Its logic:

1. **Transcribe bindings** (`transcribe`, `transcribe_with_post_process`, matched by `is_transcribe_binding` in `Handy/src-tauri/src/transcription_coordinator.rs`) are not handled inline. They are forwarded to the `TranscriptionCoordinator` via `coordinator.send_input(binding_id, hotkey_string, is_pressed, settings.push_to_talk)`. This is where push-to-talk vs toggle is resolved (see below).
2. **Cancel binding** fires `action.start(...)` only when audio is currently recording and the key is pressed.
3. **Other bindings** (e.g. `test`) use a plain `start` on press / `stop` on release.

### Configuring shortcuts (frontend)

The settings UI picks an input component based on the active backend. `Handy/src/components/settings/ShortcutInput.tsx` is the thin wrapper:

```tsx
if (keyboardImplementation === "handy_keys") return <HandyKeysShortcutInput {...props} />;
return <GlobalShortcutInput {...props} />;
```

- `Handy/src/components/settings/GlobalShortcutInput.tsx` (Tauri backend) captures keys with **JS DOM keyboard events** (`keydown`/`keyup`). It collects pressed keys, sorts modifiers first, and commits the combination (joined with `+`) once all keys are released. Before recording it calls `commands.suspendBinding(id)` so the live shortcut doesn't fire mid-capture, and restores the original on cancel/click-outside.
- `Handy/src/components/settings/HandyKeysShortcutInput.tsx` (HandyKeys backend) does not read DOM events. It calls `commands.startHandyKeysRecording(shortcutId)` and listens for `handy-keys-event` Tauri events emitted by the backend, committing `hotkey_string` when the key is released, then calls `commands.stopHandyKeysRecording()`.

Both call `updateBinding(...)`, which routes to the `change_binding` command in `Handy/src-tauri/src/shortcut/mod.rs`. That command validates the new string for the active implementation (`validate_shortcut_for_implementation`), unregisters the old binding, registers the new one, and persists settings. The `cancel` binding is updated in settings only (it's registered dynamically, not statically).

Switching the backend is a debug-only setting: `Handy/src/components/settings/debug/KeyboardImplementationSelector.tsx` offers "Tauri Global Shortcut" and "Handy Keys" and calls `commands.changeKeyboardImplementationSetting(value)`. The backing command `change_keyboard_implementation_setting` in `mod.rs` unregisters all shortcuts from the old backend, validates each binding against the new backend (**resetting incompatible ones to defaults** and reporting them in `reset_bindings`), and re-registers everything. If a binding was reset, the UI shows a warning toast.

## Push-to-Talk vs Toggle Mode

Whether holding or tapping the shortcut controls recording is decided entirely by the `push_to_talk` boolean (default `true`, per `get_default_settings()` in `Handy/src-tauri/src/settings.rs`). The toggle lives in `Handy/src/components/settings/PushToTalk.tsx`, which simply flips the `push_to_talk` setting (backed by the `change_ptt_setting` command in `mod.rs`).

The actual press/release semantics are implemented in the coordinator thread in `Handy/src-tauri/src/transcription_coordinator.rs`. `handle_shortcut_event` passes `settings.push_to_talk` into `send_input`, and the coordinator processes it against a `Stage` state machine (`Idle`, `Recording(binding_id)`, `Processing`):

- **Push-to-talk (`push_to_talk == true`)** — hold to talk:
  - On **press** while `Idle`, it calls `start(...)` and transitions to `Recording`.
  - On **release** while `Recording` (same binding), it calls `stop(...)` and transitions to `Processing`.
- **Toggle (`push_to_talk == false`)** — tap to start, tap to stop:
  - Only **press** events matter. A press while `Idle` starts recording; a press while already `Recording` the same binding stops it. Releases are ignored.

Rapid presses (key auto-repeat or accidental double-taps) are debounced with a 30 ms window (`const DEBOUNCE`); releases always pass through so push-to-talk can't get stuck. The coordinator serializes all transcription lifecycle events through a single thread to avoid races between shortcuts, CLI signals, and the async transcribe/paste pipeline.

`start`/`stop` in the coordinator delegate to the `TranscribeAction` in `Handy/src-tauri/src/actions.rs`, which starts/stops the `AudioRecordingManager`, dynamically registers/unregisters the `cancel` shortcut, and ultimately drives transcription and paste.

## Input Simulation & Paste

Once transcription (and optional post-processing) finishes, `TranscribeAction::stop` in `Handy/src-tauri/src/actions.rs` calls `utils::paste(final_text, app_handle)` **on the main thread** (`ah.run_on_main_thread(...)`). `utils::paste` is a re-export (`pub use crate::clipboard::*;` in `Handy/src-tauri/src/utils.rs`) of the `paste` function in `Handy/src-tauri/src/clipboard.rs`. On failure it emits a `paste-error` event to the frontend.

Low-level keystroke synthesis lives in `Handy/src-tauri/src/input.rs`, which uses the **enigo** crate (`enigo = "0.6.1"` in `Handy/src-tauri/Cargo.toml`). A single `Enigo` instance is held in Tauri managed state as `EnigoState(Mutex<Enigo>)`. (Note: although `Handy/src-tauri/Cargo.toml` also depends on `rdev`, the paste path in `input.rs` is built on `enigo`; `rdev` is used elsewhere.)

The choice between simulated typing and clipboard paste is the `PasteMethod` enum, decided in `clipboard::paste` from `settings.paste_method`.

### Clipboard-paste vs simulated typing

These are the two fundamentally different delivery strategies:

- **Clipboard paste** (`PasteMethod::CtrlV`, `CtrlShiftV`, `ShiftInsert`) — implemented by `paste_via_clipboard` in `Handy/src-tauri/src/clipboard.rs`. It:
  1. Reads and saves the current clipboard contents (via `tauri-plugin-clipboard-manager`).
  2. Writes the transcription to the clipboard.
  3. Sleeps for `paste_delay_ms` (see Paste Delay).
  4. Sends the paste keystroke. The keystrokes themselves come from `Handy/src-tauri/src/input.rs`: `send_paste_ctrl_v`, `send_paste_ctrl_shift_v`, and `send_paste_shift_insert`. These use **platform-specific virtual key codes** so paste works regardless of keyboard layout (e.g. Cmd+V uses `Key::Meta` + `Key::Other(9)` on macOS; Ctrl+V uses `Key::Control` + VK_V `Key::Other(0x56)` on Windows).
  5. Restores the original clipboard contents.
- **Simulated typing / direct input** (`PasteMethod::Direct`) — implemented by `paste_direct` in `clipboard.rs`, which calls `input::paste_text_direct` (`enigo.text(text)`) in `Handy/src-tauri/src/input.rs`. This types the text in rather than touching the clipboard at all. It does not require a paste keystroke and leaves the clipboard untouched.

Two additional methods exist:

- `PasteMethod::None` — skips pasting entirely (text still flows to history and can be copied to clipboard depending on the clipboard-handling setting).
- `PasteMethod::ExternalScript` (Linux only) — `paste_via_external_script` invokes a user-supplied script with the text as its single argument.

After pasting, if `settings.auto_submit` is enabled and the method isn't `None` (`should_send_auto_submit`), `paste` simulates a Return key (`send_return_key`, configurable as Enter / Ctrl+Enter / Cmd+Enter via `AutoSubmitKey`). If `settings.append_trailing_space` is set, a trailing space is appended to the text first.

### Linux native tooling

On Linux, both clipboard paste and direct typing first try external CLI tools before falling back to enigo (`try_send_key_combo_linux` and `try_direct_typing_linux` in `Handy/src-tauri/src/clipboard.rs`):

- **Wayland**: prefers `wtype` (skipped on KDE), then `dotool`, then `ydotool`; `kwtype` is preferred for direct typing on KDE Wayland. Clipboard writes prefer `wl-copy`.
- **X11**: prefers `xdotool`, then `ydotool`.

If no native tool handles the operation, the code falls back to enigo.

### User-facing options

- **Paste method** — `Handy/src/components/settings/PasteMethod.tsx` exposes a dropdown (Clipboard {Cmd/Ctrl}+V, Direct typing, None) plus Windows/Linux-only Ctrl+Shift+V and Shift+Insert, and a Linux-only External Script option with a path input. It calls `change_paste_method_setting` in `Handy/src-tauri/src/shortcut/mod.rs`. The default is `CtrlV` on macOS/Windows and `Direct` on Linux.
- **Clipboard handling** — `Handy/src/components/settings/ClipboardHandling.tsx` chooses between `dont_modify` and `copy_to_clipboard`. When `CopyToClipboard` is selected, `clipboard::paste` writes the final text to the clipboard after pasting (the clipboard-paste flow otherwise restores the previous clipboard contents). Backed by `change_clipboard_handling_setting`.
- **Typing tool** — `Handy/src/components/settings/TypingTool.tsx` is Linux-only and only shown when the paste method is `Direct`. It lists tools returned by the `get_available_typing_tools` command (`auto`, `wtype`, `kwtype`, `dotool`, `ydotool`, `xdotool`) and pins direct typing to a specific tool. Backed by `change_typing_tool_setting`.
- **Paste delay** — `Handy/src/components/settings/debug/PasteDelay.tsx` (debug section) is a slider (10–200 ms, default 60 ms) for `paste_delay_ms`. This is the wait between writing to the clipboard and sending the paste keystroke in `paste_via_clipboard`, giving the clipboard time to settle. Backed by `change_paste_delay_ms_setting`.

## Actions Pipeline (paste step)

The end-to-end flow tying shortcuts to paste:

1. A global shortcut fires in either backend (`tauri_impl.rs` or `handy_keys.rs`).
2. The backend calls the shared `handle_shortcut_event` (`handler.rs`), which forwards transcribe bindings to the `TranscriptionCoordinator`.
3. The coordinator (`transcription_coordinator.rs`) applies push-to-talk vs toggle semantics and calls `TranscribeAction::start` / `::stop` (`actions.rs`).
4. `TranscribeAction::stop` records, transcribes (Whisper/Parakeet via the transcription manager), optionally post-processes/converts, saves to history, and then on the main thread calls `utils::paste(final_text, ...)`.
5. `clipboard::paste` (`clipboard.rs`) selects the `PasteMethod` and delivers the text via simulated typing (`input.rs` `paste_text_direct`), clipboard + paste keystroke (`input.rs` `send_paste_*`), an external script, or not at all, optionally followed by an auto-submit Return key.
