# Frontend

Handy's frontend is a React single-page app rendered inside a Tauri v2 webview. It owns the entire UI surface: onboarding, the settings window, the model selector, and a separate always-on-top recording overlay. All persistent state and heavy work (audio capture, transcription, model downloads) live in the Rust backend; the frontend talks to it through auto-generated Tauri command bindings and Tauri events.

## Tech stack

From `Handy/package.json`:

- **React 18** (`react`, `react-dom` `^18.3.1`) with functional components and hooks.
- **TypeScript** (`~5.6.3`, strict), path alias `@/` -> `./src/`.
- **Vite 6** (`^6.4.1`) as the dev server and bundler (`bun run dev` / `bun run build`).
- **Tailwind CSS 4** (`tailwindcss` + `@tailwindcss/vite` `^4.1.16`) for styling, applied as utility classes directly in JSX.
- **Zustand 5** (`^5.0.8`) for state management, with `immer` (`^11.1.3`) for ergonomic immutable updates in the model store.
- **react-i18next 16** + **i18next 25** for translations.
- **sonner** for toast notifications, **react-select** for some dropdowns, **lucide-react** for icons.
- **@tauri-apps/api** plus a set of Tauri plugins (`plugin-os`, `plugin-store`, `plugin-global-shortcut`, `plugin-autostart`, etc.) and `tauri-plugin-macos-permissions-api` for the permission onboarding.

There are two webview entry points, each with its own `main.tsx`:

- `Handy/src/main.tsx` — the main settings window. It sets `document.documentElement.dataset.platform` from `platform()` (so CSS can scope per-OS), imports `./i18n` to initialize translations, calls `useModelStore.getState().initialize()` to load models and register download event listeners, then mounts `<App />`.
- `Handy/src/overlay/main.tsx` — the recording overlay window. It imports `@/i18n` and mounts only `<RecordingOverlay />`.

## App shell and routing

`Handy/src/App.tsx` is the root of the settings window. It does not use a router; "navigation" is a phase machine plus a sidebar:

- An `onboardingStep` state of `"accessibility" | "model" | "done"` (or `null` while checking). On mount, `checkOnboardingStatus()` calls `commands.hasAnyModelsAvailable()`. New users go through `<AccessibilityOnboarding>` then `<Onboarding>`; returning users skip straight to `"done"` unless macOS/Windows permissions are missing.
- Once `onboardingStep === "done"`, it renders the main layout: `<Sidebar>` on the left and the active settings section on the right via `renderSettingsContent(currentSection)`, plus a `<Footer>` and a sonner `<Toaster>`.
- It wires several backend events to toasts: `recording-error`, `paste-error`, and `model-state-changed` (for `loading_failed`). These are typed with `RecordingErrorEvent` / `ModelStateEvent` from `Handy/src/lib/types/events.ts`.
- It sets the document `dir` from `getLanguageDirection(i18n.language)` and re-runs `initializeRTL` whenever the language changes.
- After onboarding completes it calls `commands.initializeEnigo()` and `commands.initializeShortcuts()`, then refreshes audio and output devices (deferred until now so macOS permission dialogs do not fire prematurely).

### Sidebar and sections

`Handy/src/components/Sidebar.tsx` defines `SECTIONS_CONFIG`, a record mapping each section id to a label translation key, an icon, the component to render, and an `enabled(settings)` predicate:

```ts
export const SECTIONS_CONFIG = {
  general:        { labelKey: "sidebar.general", icon: HandyHand, component: GeneralSettings, enabled: () => true },
  models:         { ..., component: ModelsSettings, enabled: () => true },
  advanced:       { ..., component: AdvancedSettings, enabled: () => true },
  history:        { ..., component: HistorySettings, enabled: () => true },
  postprocessing: { ..., component: PostProcessingSettings, enabled: (s) => s?.post_process_enabled ?? false },
  debug:          { ..., component: DebugSettings, enabled: (s) => s?.debug_mode ?? false },
  about:          { ..., component: AboutSettings, enabled: () => true },
} as const;
```

The sidebar reads `settings` via `useSettings()` and only renders sections whose `enabled` predicate passes, so the Post-processing and Debug tabs appear only when their corresponding settings are on. `SidebarSection` is derived as `keyof typeof SECTIONS_CONFIG`. Debug mode itself can be toggled from anywhere with `Cmd/Ctrl+Shift+D`, handled by a `keydown` listener in `Handy/src/App.tsx`.

## State management with Zustand

State lives in two stores under `Handy/src/stores`. Both use `create()` wrapped in `subscribeWithSelector`. The pattern throughout is: the store is the single client-side cache, and **the Rust backend is the source of truth** — most actions call a Tauri command, then either optimistically update or re-fetch.

### settingsStore

`Handy/src/stores/settingsStore.ts` holds all user settings and audio device lists:

- `settings: AppSettings | null` and `defaultSettings: AppSettings | null` (both the live and default values come from Rust).
- `isLoading`, `isUpdating: Record<string, boolean>` (per-key updating flags for spinners), `audioDevices` / `outputDevices: AudioDevice[]`, `customSounds`, and `postProcessModelOptions`.

Key behaviors:

- `refreshSettings()` calls `commands.getAppSettings()`, normalizes a few nullable fields (e.g. defaulting `selected_microphone` to `"Default"`), and stores the result.
- `loadDefaultSettings()` calls `commands.getDefaultSettings()` so platform-specific defaults (overlay position, shortcuts, paste method) come from Rust rather than being hardcoded in TS.
- `updateSetting(key, value)` does an **optimistic update** (writes the new value into `settings` immediately), then dispatches to the matching backend command and rolls back on failure. The dispatch table is `settingUpdaters`, a map from each `AppSettings` key to the specific command it calls, e.g.:

  ```ts
  const settingUpdaters = {
    push_to_talk:        (v) => commands.changePttSetting(v),
    selected_microphone: (v) => commands.setSelectedMicrophone(...),
    app_language:        (v) => commands.changeAppLanguageSetting(v),
    whisper_accelerator: (v) => commands.changeWhisperAcceleratorSetting(v),
    // ...one entry per setting
  };
  ```

  This keeps each setting mapped to its own typed Rust command instead of one generic "save settings" call.
- `resetSetting(key)` looks up `defaultSettings[key]` and re-applies it through `updateSetting`.
- `updateBinding(id, binding)` / `resetBinding(id)` manage keyboard shortcuts. `updateBinding` optimistically patches `settings.bindings[id].current_binding`, calls `commands.changeBinding(id, binding)`, checks both the command result status and `result.data.success`, and rolls back on error.
- `refreshAudioDevices()` / `refreshOutputDevices()` call `commands.getAvailableMicrophones()` / `getAvailableOutputDevices()` and prepend a synthetic `"Default"` device.
- Post-processing helpers (`setPostProcessProvider`, `updatePostProcessBaseUrl`, `updatePostProcessApiKey`, `updatePostProcessModel`, `fetchPostProcessModels`) wrap the corresponding backend commands and manage the cached `postProcessModelOptions` per provider.
- `initialize()` runs `loadDefaultSettings`, `refreshSettings`, and `checkCustomSounds` in parallel, then subscribes to the `model-state-changed` event to re-fetch settings (the backend can reset settings such as language during a model switch).

### modelStore

`Handy/src/stores/modelStore.ts` manages the speech-to-text model catalog and download lifecycle. Because it tracks several concurrent per-model flags it uses `immer`'s `produce` for updates, and stores collections as `Record<string, true>` (Immer-friendly) instead of `Set`/`Map`:

- `models: ModelInfo[]`, `currentModel: string`, and progress maps: `downloadingModels`, `verifyingModels`, `extractingModels`, `downloadProgress`, `downloadStats`.
- `hasAnyModels` / `isFirstRun` drive onboarding gating; `initialized` guards one-time setup.

Actions wrap commands: `loadModels()` -> `commands.getAvailableModels()`, `loadCurrentModel()` -> `commands.getCurrentModel()`, `selectModel(id)` -> `commands.setActiveModel(id)`, `downloadModel(id)` -> `commands.downloadModel(id)`, `cancelDownload`, `deleteModel`, and `checkFirstRun()` -> `commands.hasAnyModelsAvailable()`.

`initialize()` does the initial parallel load, then registers `listen(...)` handlers for the full download lifecycle — `model-download-progress` (it also computes a smoothed MB/s speed), `model-download-complete`, `model-download-failed` (which also fires a sonner toast), `model-download-cancelled`, `model-verification-started/completed`, `model-extraction-started/completed/failed`, `model-deleted`, and `model-state-changed`. These events let the backend push real-time download status into the store without polling.

## The settings UI architecture

Settings components live under `Handy/src/components/settings/*`, with section containers grouped into subfolders (`general/`, `advanced/`, `debug/`, `history/`, `models/`, `post-processing/`, `about/`) and many small per-setting controls at the top level. The section components are re-exported from `Handy/src/components/settings/index.ts`.

### Composition primitives

The reusable UI primitives live in `Handy/src/components/ui/*`:

- **`SettingContainer`** (`Handy/src/components/ui/SettingContainer.tsx`) — the layout shell for one setting row. Props: `title`, `description`, `descriptionMode` (`"inline"` shows the description text, `"tooltip"` shows a help icon with a `Tooltip` popover), `layout` (`"horizontal"` or `"stacked"`), `grouped` (drops the per-row border when inside a group), and `disabled`. It renders the title/description on one side and `children` (the control) on the other.
- **`ToggleSwitch`** (`Handy/src/components/ui/ToggleSwitch.tsx`) — a styled checkbox switch that wraps `SettingContainer`, forwarding `label`/`description`/`grouped`. It shows a spinner overlay when `isUpdating` is true and is RTL-aware (`rtl:peer-checked:after:-translate-x-full`).
- **`SettingsGroup`** (`Handy/src/components/ui/SettingsGroup.tsx`) — a titled card that renders an optional uppercase heading and wraps its children in a bordered, `divide-y` container so grouped rows get separators.
- Other shared controls referenced by settings include `Dropdown`, `ResetButton`, and `Tooltip` (same folder).

### How a section composes

`Handy/src/components/settings/general/GeneralSettings.tsx` is representative. It arranges several `SettingsGroup`s, each containing per-setting components rendered with `grouped={true}`:

```tsx
<SettingsGroup title={t("settings.general.title")}>
  <ShortcutInput shortcutId="transcribe" grouped />
  <PushToTalk descriptionMode="tooltip" grouped />
  {!isLinux && !pushToTalk && <ShortcutInput shortcutId="cancel" grouped />}
</SettingsGroup>
<ModelSettingsCard />
<SettingsGroup title={t("settings.sound.title")}>
  <MicrophoneSelector grouped />
  <MuteWhileRecording grouped />
  <AudioFeedback grouped />
  <OutputDeviceSelector grouped disabled={!audioFeedbackEnabled} />
  <VolumeSlider disabled={!audioFeedbackEnabled} />
</SettingsGroup>
```

Each leaf control is a thin component bound to one setting via `useSettings()`. For example `Handy/src/components/settings/PushToTalk.tsx` reads `getSetting("push_to_talk")` and renders a `ToggleSwitch` whose `onChange` calls `updateSetting("push_to_talk", enabled)` and passes `isUpdating("push_to_talk")` for the spinner. `Handy/src/components/settings/MicrophoneSelector.tsx` reads `selected_microphone` plus the `audioDevices` list, renders a `Dropdown` + `ResetButton` inside a `SettingContainer`, and calls `updateSetting`/`resetSetting` and `refreshAudioDevices` on interaction. This keeps each control self-contained: read one key, render one primitive, write back through the store.

### useSettings hook

`Handy/src/hooks/useSettings.ts` is the bridge most components use instead of touching the store directly. It selects the whole `useSettingsStore`, triggers `store.initialize()` on first mount (when `isLoading`), and returns a flat, typed surface: `settings`, `isLoading`, `isUpdating(key)`, `audioDevices`, `outputDevices`, `audioFeedbackEnabled`, plus actions (`updateSetting`, `resetSetting`, `refreshSettings`, `updateBinding`, `resetBinding`, `getSetting`) and the post-processing helpers. Because `updateSetting` is generic over `keyof AppSettings`, callers get full type-checking on both the key and the value.

`Handy/src/hooks/useOsType.ts` is a small synchronous wrapper over Tauri's `plugin-os` `type()`, normalizing the result to `"macos" | "windows" | "linux" | "unknown"` for keyboard handling.

## Onboarding flow

Onboarding lives in `Handy/src/components/onboarding/*` and is driven by the `onboardingStep` machine in `App.tsx`. It has two screens:

1. **`AccessibilityOnboarding`** (`Handy/src/components/onboarding/AccessibilityOnboarding.tsx`) — a permissions gate. It detects the platform, then on macOS requests Accessibility and Microphone permissions via `tauri-plugin-macos-permissions-api` (`checkAccessibilityPermission`, `requestAccessibilityPermission`, etc.), and on Windows checks `commands.getWindowsMicrophonePermissionStatus()` / opens privacy settings via `commands.openMicrophonePrivacySettings()`. After the user clicks "Grant", it **polls** every second until permissions flip to granted, calls `commands.initializeEnigo()` + `commands.initializeShortcuts()` once accessibility is granted, refreshes audio devices, then calls `onComplete()`. On unsupported platforms (Linux) it completes immediately.
2. **`Onboarding`** (`Handy/src/components/onboarding/Onboarding.tsx`) — first-run model selection. It reads the model catalog and download flags from `useModelStore`, renders recommended models (`is_recommended`) as `featured` `ModelCard`s and the rest sorted by `size_mb`. When the user picks one it calls `downloadModel(id)` and watches the store; once the model is downloaded, verified, and extracted it calls `selectModel(id)` and transitions the app to `"done"`.

## Recording overlay

The overlay is a **separate Tauri window** with its own React tree, under `Handy/src/overlay/*`. Its `main.tsx` mounts only `<RecordingOverlay />` (`Handy/src/overlay/RecordingOverlay.tsx`).

The overlay is purely event-driven from Rust. On mount it registers listeners:

- `show-overlay` — payload is an `OverlayState` (`"recording" | "transcribing" | "processing"`). It also calls `syncLanguageFromSettings()` each time so the overlay matches the app language, then makes itself visible.
- `hide-overlay` — hides the overlay.
- `mic-level` — a `number[]` of audio levels. The component smooths them (`prev * 0.7 + target * 0.3`) and renders animated bars; the bar heights/opacity are derived from the level values.

While recording it shows a mic icon and the level bars plus a cancel button that calls `commands.cancelOperation()`; while transcribing/processing it shows localized status text. It is RTL-aware via `getLanguageDirection(i18n.language)`. Styling is in `Handy/src/overlay/RecordingOverlay.css`.

## Model selector UI

`Handy/src/components/model-selector/*` is the in-app model switcher (distinct from the first-run onboarding screen). `ModelSelector.tsx` composes three children: `ModelStatusButton` (the current status pill), `ModelDropdown` (the list of models with select handlers), and `DownloadProgressDisplay`.

It reads `models`, `currentModel`, and the progress maps from `useModelStore`, and derives a display `ModelStatus` (`ready | loading | downloading | verifying | extracting | error | unloaded | none`) by combining the store's per-model flags with local state. It listens to `model-state-changed` (to track `loading_started/completed/failed/unloaded`) and to `model-download-complete` (to auto-select a just-downloaded model when not recording). Selecting a model sets an optimistic `pendingModelId` and calls `selectModel(id)` from the store. Display names are localized through `getTranslatedModelName`.

## Internationalization (i18n)

i18n is set up in `Handy/src/i18n/index.ts` using `i18next` + `initReactI18next`:

- Translation files are **auto-discovered** with Vite's glob import: `import.meta.glob("./locales/*/translation.json", { eager: true })`. The locale code is parsed from the path and used to build the `resources` object, so adding a new `locales/{code}/translation.json` is enough to register it.
- `SUPPORTED_LANGUAGES` merges discovered locales with metadata from `Handy/src/i18n/languages.ts` and sorts by `priority` then name. `languages.ts` is a `LANGUAGE_METADATA` record giving each code its English `name`, `nativeName`, optional `priority` (ordering in the dropdown), and optional `direction: "rtl"`. There are 20 bundled locales (`Handy/src/i18n/locales/`): `en, zh, zh-TW, es, fr, de, ja, ko, vi, pl, it, ru, uk, pt, cs, tr, ar, he, sv, bg` — `ar` and `he` are marked `rtl`.
- i18next initializes with `lng: "en"` / `fallbackLng: "en"`, then `syncLanguageFromSettings()` reads `commands.getAppSettings().app_language`; if unset it falls back to the system locale via `plugin-os` `locale()`. `getSupportedLanguage` does an exact then prefix (`xx-YY` -> `xx`) match.
- Components consume translations with `const { t } = useTranslation()` and `t("some.key")`. ESLint (`eslint-plugin-i18next`) forbids hardcoded JSX strings, so all user-facing text is keyed.
- Language can be changed from the UI by `Handy/src/components/settings/AppLanguageSelector.tsx`, which calls `i18n.changeLanguage(code)` and `updateSetting("app_language", code)` so the choice persists in the backend.

### RTL handling

`Handy/src/lib/utils/rtl.ts` centralizes direction logic:

- `isRTLLanguage(code)` / `getLanguageDirection(code)` look up `LANGUAGE_METADATA[code].direction` (stripping any region suffix).
- `updateDocumentDirection(dir)` and `updateDocumentLanguage(lang)` set the `dir` and `lang` attributes on `<html>`.
- `initializeRTL(code)` applies both at once.

`i18n/index.ts` subscribes to `i18n.on("languageChanged", ...)` to call `updateDocumentDirection` + `updateDocumentLanguage`, and `App.tsx` / `RecordingOverlay.tsx` also set `dir={direction}` on their root element. Tailwind's `rtl:` variants (e.g. in `ToggleSwitch`) then flip layout where needed.

## The Tauri command bridge

### bindings.ts (auto-generated)

`Handy/src/bindings.ts` is generated by **tauri-specta** ("Do not edit this file manually") and is the typed contract between TS and Rust. It exports:

- **`commands`** — an object of async functions, one per Rust command. Each wraps `TAURI_INVOKE("snake_case_name", args)` in a try/catch and returns a tagged `Result<T, E>`:

  ```ts
  export const commands = {
    async changePttSetting(enabled: boolean): Promise<Result<null, string>> {
      try { return { status: "ok", data: await TAURI_INVOKE("change_ptt_setting", { enabled }) }; }
      catch (e) { if (e instanceof Error) throw e; else return { status: "error", error: e as any }; }
    },
    // ...one method per backend command
  };

  export type Result<T, E> =
    | { status: "ok"; data: T }
    | { status: "error"; error: E };
  ```

  This is why store code consistently checks `result.status === "ok"` before reading `result.data`. The file also exports all shared Rust types as TS types — notably `AppSettings`, `AudioDevice`, `ModelInfo`, `ShortcutBinding`, `EngineType`, `OverlayPosition`, `PasteMethod`, `WhisperAcceleratorSetting`, and many enums — so the frontend's `settings` object is structurally typed against the Rust struct.

- **`events`** — a tauri-specta event proxy (`__makeEvents__`) for events specta knows about (currently `historyUpdatePayload` -> `history-update-payload`). Most runtime events, however, are subscribed to directly with `listen("event-name", ...)` from `@tauri-apps/api/event` (see the model store and overlay), and their payload shapes are described in `Handy/src/lib/types/events.ts`.

### How hooks/stores call into Rust

The data flow is: **component -> `useSettings()` -> `settingsStore` action -> `commands.xxx()` -> `TAURI_INVOKE` -> Rust command -> persisted via tauri-plugin-store**, with the store applying optimistic updates and rolling back on a non-`ok` result. For example, toggling push-to-talk runs `updateSetting("push_to_talk", v)` -> `settingUpdaters.push_to_talk(v)` -> `commands.changePttSetting(v)` -> Rust `change_ptt_setting`.

### Events (backend -> frontend)

`Handy/src/lib/types/events.ts` defines the payload interfaces the frontend listens for:

```ts
export interface ModelStateEvent {
  event_type: string;   // "loading_started" | "loading_completed" | "loading_failed" | "unloaded"
  model_id?: string;
  model_name?: string;
  error?: string;
}
export interface RecordingErrorEvent {
  error_type: string;   // e.g. "microphone_permission_denied" | "no_input_device"
  detail?: string;
}
```

These are used with typed `listen<ModelStateEvent>(...)` / `listen<RecordingErrorEvent>(...)` calls in `App.tsx` and `ModelSelector.tsx`. Other backend-emitted events consumed by the frontend (string or inline-typed payloads) include the model download lifecycle events handled in `modelStore.ts`, the overlay's `show-overlay` / `hide-overlay` / `mic-level`, and `paste-error`. Together with the command bridge this realizes the project's command/event architecture: frontend -> backend via commands, backend -> frontend via events.
