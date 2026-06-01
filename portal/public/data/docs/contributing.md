# Contributing & Extending

Handy is built to be the most forkable speech-to-text app: a "well-patterned, simple codebase that serves the community" (`Handy/CONTRIBUTING.md`). This page covers how to contribute changes back upstream, the rules AI coding assistants must follow, how to extend or fork Handy, and how to add translations. Every claim here is grounded in the repo's own docs and code.

> **Feature freeze (important).** Per `Handy/CONTRIBUTING.md`, Handy is under a feature freeze. New features the community has not asked for will be rejected. Bug fixes are the top priority. New features require demonstrated community support gathered in [GitHub Discussions](https://github.com/cjpais/Handy/discussions) *before* a PR is opened.

## How to Contribute

### Before you start

`Handy/CONTRIBUTING.md` is explicit that the first step is research, not code:

1. Search **open and closed** issues and PRs. Someone may have already done it, or there may be a reason it was closed.
2. To revisit a previously closed issue/PR, provide a strong argument, gather community feedback in Discussions first, and link that discussion in your PR.
3. For features, get community feedback. PRs with demonstrated interest are "much more likely to be merged."

Note the issue/discussion split: bugs go to **Issues** (use the bug report template), feature requests go to **Discussions** (`Handy/CONTRIBUTING.md`).

### Development setup

From `Handy/CONTRIBUTING.md` and `Handy/AGENTS.md`:

```bash
# Prerequisites: Rust (latest stable), Bun, platform build tools (see BUILD.md)
bun install

# Required VAD model for development
mkdir -p src-tauri/resources/models
curl -o src-tauri/resources/models/silero_vad_v4.onnx https://blob.handy.computer/silero_vad_v4.onnx

# Run the full app in dev mode
bun run tauri dev
# macOS, if you hit cmake errors:
CMAKE_POLICY_VERSION_MINIMUM=3.5 bun run tauri dev
```

### Workflow and branch/PR conventions

`Handy/CONTRIBUTING.md` describes the standard fork-and-PR flow:

1. Fork, clone, and add the upstream remote (`git remote add upstream git@github.com:cjpais/Handy.git`).
2. Create a feature branch: `feature/your-feature-name` or `fix/your-bug-fix`.
3. Make focused, atomic commits.
4. Keep your fork current with `git fetch upstream && git rebase upstream/main`.
5. Push to your fork and open a PR, filling out the PR template **completely** (description, linked issues/discussions, community feedback, how you tested, screenshots/videos, breaking changes).

### Commit message conventions (conventional commits — confirmed)

Both `Handy/CONTRIBUTING.md` and `Handy/AGENTS.md` require conventional-commit prefixes:

- `feat:` — new features
- `fix:` — bug fixes
- `docs:` — documentation changes
- `refactor:` — code refactoring
- `test:` — test additions/changes
- `chore:` — maintenance tasks

`Handy/AGENTS.md` adds: focus the commit message on *why*, not *what*.

### AI assistance disclosure

`Handy/CONTRIBUTING.md` states AI-assisted PRs are welcome, but you must disclose in the PR description: whether AI was used, which tools, and how extensively (e.g. "generated boilerplate", "wrote most of the code").

### Code style

From `Handy/CONTRIBUTING.md`, `Handy/AGENTS.md`, and `Handy/CRUSH.md`:

**Rust**
- Run `cargo fmt` and `cargo clippy` and address warnings before committing.
- Handle errors explicitly — avoid `unwrap` in production code. `Handy/CRUSH.md` recommends `anyhow::Error` with descriptive context and the `?` operator.
- Use descriptive names and doc comments for public APIs. `snake_case` functions/variables, `PascalCase` types.
- `Handy/CRUSH.md`: prefer `Arc<Mutex<T>>` for shared state in managers; builder pattern for init chains; separate logical sections with `/* ─────────── */` comment blocks.

**TypeScript / React**
- Strict TypeScript; avoid `any`.
- Functional components with hooks; keep components small and focused.
- Tailwind CSS for styling. Path alias `@/` → `./src/`.
- `Handy/CRUSH.md`: Zod schemas for validation, `useCallback` for stable references, named imports, `import type` for types.

### Required checks (CI)

`Handy/AGENTS.md` lists the pre-commit commands, and `.github/workflows/code-quality.yml` runs these on every PR touching `src/**`:

```bash
bun run check:translations   # translation key consistency vs. en (scripts/check-translations.ts)
bun run lint                 # ESLint (see eslint.config.js)
bun run format:check         # Prettier --check  (cargo fmt --check for backend via format:check)
```

Useful local helpers (`package.json`): `bun run lint:fix`, `bun run format` (Prettier + `cargo fmt`), `bunx tsc --noEmit` for type checking.

#### Linting: i18n enforcement

`Handy/eslint.config.js` is intentionally minimal. Its single rule is `i18next/no-literal-string` set to **error**, applied to `src/**/*.{ts,tsx}`. It runs in `markupOnly` mode (only JSX content is checked, not all strings) and ignores non-translatable attributes like `className`, `style`, `type`, `id`, `name`, `key`, `data-*`, and `aria-*`. In practice: **you cannot hardcode user-facing strings in JSX** — they must go through i18next (see Translations below). This is also stated in `Handy/AGENTS.md`.

## AI-Assistant / Agent Conventions

Handy ships explicit rules for AI coding assistants in `Handy/AGENTS.md`. `Handy/CLAUDE.md` is a one-line pointer that simply reads `Handy/AGENTS.md`, so the same rules apply to Claude. `Handy/CRUSH.md` is a complementary, condensed code-style and commands reference. Key rules from `Handy/AGENTS.md`:

- **Read templates before opening anything (MANDATORY).** Before opening any PR, issue, or discussion, read the relevant template and follow it strictly — including "ceremonial" sections (checklists, AI Assistance disclosure, "Human Written Description"). A generic Summary/Test-plan layout is **not acceptable**.
  - PRs: read `.github/PULL_REQUEST_TEMPLATE.md`; every section is mandatory. For human-voice sections like "Human Written Description", leave a clear TODO placeholder for the human contributor — **do not invent their voice**.
  - Issues: read `.github/ISSUE_TEMPLATE/`; blank issues are disabled; pick the right template (`bug_report.md` for bugs).
- **Features go through Discussions.** Respect the feature freeze; new features need community support gathered in Discussions before any PR.
- **Translations:** follow `Handy/CONTRIBUTING_TRANSLATIONS.md`.
- **Commits:** use conventional prefixes; explain *why*, not *what*.
- **i18n:** all user-facing strings must use i18next translations (ESLint enforces no hardcoded JSX strings).

`Handy/AGENTS.md` also documents the architecture an agent needs: the Manager pattern (Audio/Model/Transcription managers in `src-tauri/src/managers/`), the command-event architecture (frontend → backend via Tauri commands; backend → frontend via events), the pipeline (Audio → VAD → Whisper/Parakeet → text → clipboard/paste), and the state flow (Zustand → Tauri command → Rust state → `tauri-plugin-store`).

## Extending & Forking Handy

The backend lives in `src-tauri/src/` and the frontend in `src/` (see `Handy/AGENTS.md` for the full map). Below are concrete "to add X, edit Y" recipes grounded in the actual files.

### Add a new setting

1. **Backend schema** — add the field to `AppSettings` in `src-tauri/src/settings.rs`. Fields use `#[serde(default = "...")]` with a matching `default_*` function (follow the existing pattern, e.g. `default_post_process_enabled`, `default_model`).
2. **Type bindings** — the `Settings` type consumed by the frontend lives in `src/bindings.ts`, which is auto-generated from the Rust types via `tauri-specta` (`Handy/AGENTS.md`). Regenerate bindings rather than hand-editing.
3. **Frontend state** — wire it through the Zustand store in `src/stores/settingsStore.ts` and the `src/hooks/useSettings.ts` hook.
4. **UI** — add the control under `src/components/settings/` (general vs. advanced as appropriate).

### Add a new post-processing (LLM) provider

Post-processing lets an LLM clean up transcripts. Providers are data-driven, not hardcoded per file.

1. **Register the provider** — add a `PostProcessProvider` entry to `default_post_process_providers()` in `src-tauri/src/settings.rs`. Each entry has `id`, `label`, `base_url`, `allow_base_url_edit`, `models_endpoint`, and `supports_structured_output` (the `PostProcessProvider` struct is defined in the same file). Existing entries include `openai`, `zai`, `openrouter`, `anthropic`, and `groq`.
2. **Custom request/auth behavior** — if the provider needs non-standard auth or request shaping, extend `src-tauri/src/llm_client.rs`. It builds headers and the HTTP client per provider (`build_headers`, `create_client`); note the existing provider-specific branch (e.g. `if provider.id == "anthropic"` for auth headers). Most OpenAI-compatible providers need no code change here beyond the settings entry.
3. **UI** — the provider settings screen is `src/components/settings/PostProcessingSettingsApi/` (which re-exports `src/components/settings/post-processing/PostProcessingSettings.tsx`). The store actions in `src/stores/settingsStore.ts` (`setPostProcessProvider`, `updatePostProcessApiKey`, `updatePostProcessModel`, `fetchPostProcessModels`, etc.) drive it.

### Add a new transcription model or engine

Models are registered in `src-tauri/src/managers/model.rs` as `ModelInfo` entries inside `ModelManager`. Each `ModelInfo` carries `id`, `name`, `filename`, `url`, `sha256`, `size_mb`, an `engine_type`, accuracy/speed scores, language support, and flags like `is_recommended` and `is_custom`.

- **To add a new model that uses an existing engine:** add a `ModelInfo` entry in `src-tauri/src/managers/model.rs` with the appropriate `engine_type` (e.g. `EngineType::Whisper` or `EngineType::Parakeet`), download `url`, and `sha256`.
- **To add a new engine:** add a variant to the `EngineType` enum in `src-tauri/src/managers/model.rs` (existing variants: `Whisper`, `Parakeet`, `Moonshine`, `MoonshineStreaming`, `SenseVoice`, `GigaAM`, `Canary`, `Cohere`), then handle that variant in the `LoadedEngine` enum and the `match model_info.engine_type { ... }` load block in `src-tauri/src/managers/transcription.rs`. That match is where each engine is loaded and run.

### Add a new CLI flag

`Handy/AGENTS.md` documents the CLI layout: definitions in `src-tauri/src/cli.rs` (clap derive), parsing in `main.rs`, applying in `lib.rs`, and shared logic in `signal_handle.rs` (e.g. `send_transcription_input()`). CLI flags are runtime-only overrides and must **not** modify persisted settings.

## Translations

Translation contributions follow `Handy/CONTRIBUTING_TRANSLATIONS.md`. Locale files live in `src/i18n/locales/<code>/translation.json`, with `en` as the source of truth. The repo currently ships 20 locales (e.g. `en`, `zh`, `zh-TW`, `es`, `fr`, `de`, `ja`, `ko`, `vi`, `pl`, `it`, `ru`, `uk`, `pt`, `cs`, `tr`, `ar`, `he`, `sv`, `bg`).

### Add a new language

1. Create the folder using the [ISO 639-1 code](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes): `mkdir src/i18n/locales/<code>`.
2. Copy the English source: `cp src/i18n/locales/en/translation.json src/i18n/locales/<code>/translation.json`.
3. Translate **only the values**, never the keys. Preserve the JSON structure and any `{{variables}}` (e.g. `{{error}}`, `{{model}}`) exactly. Do not translate brand names (Handy, Whisper.cpp, OpenAI).
4. Register the language metadata in `src/i18n/languages.ts` by adding an entry to `LANGUAGE_METADATA` with `name`, `nativeName`, an optional `priority` (lower sorts higher in the dropdown), and `direction: "rtl"` for right-to-left languages (as `ar` and `he` do).
5. Test: `bun run tauri dev`, then Settings → General → App Language, and verify text renders correctly.
6. Open a PR with the language name in the title (e.g. "Add German translation").

### Add or change a translatable string in the UI

Per `Handy/AGENTS.md`: add the key to `src/i18n/locales/en/translation.json`, then use it via `const { t } = useTranslation(); t('key.path')`. Hardcoded JSX strings fail ESLint (`i18next/no-literal-string`), so this is mandatory, not optional.

### Keeping translations consistent

CI runs `bun run check:translations` (`scripts/check-translations.ts`), which compares every locale's keys against `en` and reports missing/extra keys. Run it locally before pushing so your PR passes `.github/workflows/code-quality.yml`.

## Where to get help

`Handy/CONTRIBUTING.md` points contributors to the [Discord](https://discord.com/invite/WVBeWsNXK4), [GitHub Discussions](https://github.com/cjpais/Handy/discussions), and `contact@handy.computer`. Contributions are licensed under the MIT License.
