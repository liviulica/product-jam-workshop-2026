# Post-Processing

Handy can optionally run a freshly transcribed utterance through a large language model (LLM) to clean it up before it is pasted. This is the **only** step in Handy that may send your text off-device: every other stage (audio capture, voice-activity detection, Whisper/Parakeet transcription) runs locally. Post-processing is opt-in, off by default, and can itself be kept fully local by choosing Apple Intelligence (on-device) or pointing Handy at a local OpenAI-compatible endpoint.

This page covers the LLM client, the supported providers, the Apple Intelligence on-device path, the prompt system, the configuration UI, and exactly where post-processing sits in the pipeline.

## Where it sits in the pipeline

Post-processing runs **after transcription and before paste**. The orchestration lives in `Handy/src-tauri/src/actions.rs`.

When the user triggers the `transcribe_with_post_process` action (a separate shortcut from plain `transcribe`), the recorded audio is transcribed as usual, then `process_transcription_output(app, transcription, post_process)` is called with `post_process = true`. That function:

1. Optionally converts Chinese variants via OpenCC (`maybe_convert_chinese_variant`).
2. If `post_process` is set, calls `post_process_transcription(&settings, &final_text)`. On success the LLM output replaces `final_text`; on any failure it logs and falls back to the original transcription (post-processing never blocks output).
3. Returns a `ProcessedTranscription { final_text, post_processed_text, post_process_prompt }`.

Only afterward does the caller paste `processed.final_text` into the active app (via `utils::paste` on the main thread) and save a history entry that records both the raw transcription and the post-processed text. While post-processing runs, a "processing" overlay is shown (`show_processing_overlay`). See `Handy/src-tauri/src/actions.rs`.

The two actions are registered in the same file: `"transcribe"` maps to `TranscribeAction { post_process: false }` and `"transcribe_with_post_process"` to `TranscribeAction { post_process: true }`. The shared check in `Handy/src-tauri/src/transcription_coordinator.rs` treats both IDs as transcription bindings.

## The LLM client

All cloud/HTTP providers go through `Handy/src-tauri/src/llm_client.rs`, which speaks the OpenAI Chat Completions wire format (`POST {base_url}/chat/completions`).

### How requests are built

`send_chat_completion_with_schema(...)` is the main entry point (the simpler `send_chat_completion(...)` delegates to it with no system prompt and no schema). It builds a `ChatCompletionRequest` with:

- `model` — the configured model ID for the active provider.
- `messages` — an optional `system` message followed by the `user` message (the transcription).
- `response_format` — only set when a JSON schema is supplied. It uses OpenAI structured-outputs mode (`type: "json_schema"`, `strict: true`, schema name `transcription_output`).
- `reasoning_effort` — OpenAI-style top-level field (e.g. `"none"`, `"low"`, `"medium"`, `"high"`).
- `reasoning` — OpenRouter-style nested `ReasoningConfig { effort, exclude }`.

In `actions.rs`, reasoning is deliberately disabled for the providers where it adds latency without benefit: `custom` sends top-level `reasoning_effort: "none"`, and `openrouter` sends the nested `reasoning { effort: "none", exclude: true }` (the `exclude` flag also keeps reasoning tokens out of the response so they cannot corrupt structured-output JSON parsing). All other providers send neither.

### Headers and authentication

`build_headers(provider, api_key)` in `Handy/src-tauri/src/llm_client.rs` always sets `Content-Type: application/json`, a `Referer` and `User-Agent` pointing at the Handy GitHub repo, and `X-Title: Handy`. Auth is provider-aware:

- **Anthropic** (`provider.id == "anthropic"`): sends `x-api-key: <key>` plus `anthropic-version: 2023-06-01`.
- **All other providers**: sends `Authorization: Bearer <key>`.

If the API key is empty, no auth header is added (useful for local servers that need none).

### Structured output vs. legacy mode

`post_process_transcription` in `Handy/src-tauri/src/actions.rs` branches on `provider.supports_structured_output`:

- **Structured output**: the prompt template becomes the `system` message (with the `${output}` placeholder stripped by `build_system_prompt`), the transcription is the `user` message, and a JSON schema requiring a single `transcription` string field is enforced. The response JSON is parsed and the `transcription` field is extracted. If the structured-output request fails, it logs a warning and **falls back to legacy mode**.
- **Legacy mode**: the `${output}` placeholder in the prompt is replaced inline with the transcription text and sent as a single user message.

In both modes the result is passed through `strip_invisible_chars` before being returned.

### Fetching available models

`fetch_models(provider, api_key)` issues `GET {base_url}/models` and parses either the OpenAI `{ "data": [ { "id": ... } ] }` shape or a bare string array. This feeds the model dropdown in the UI.

## Supported providers

Providers are defined in `default_post_process_providers()` in `Handy/src-tauri/src/settings.rs` as `PostProcessProvider` records (`id`, `label`, `base_url`, `allow_base_url_edit`, `models_endpoint`, `supports_structured_output`). The default selected provider is `openai` (`default_post_process_provider_id`).

| ID | Label | Base URL | Editable URL | Structured output |
| --- | --- | --- | --- | --- |
| `openai` | OpenAI | `https://api.openai.com/v1` | no | yes |
| `zai` | Z.AI | `https://api.z.ai/api/paas/v4` | no | yes |
| `openrouter` | OpenRouter | `https://openrouter.ai/api/v1` | no | yes |
| `anthropic` | Anthropic | `https://api.anthropic.com/v1` | no | no |
| `groq` | Groq | `https://api.groq.com/openai/v1` | no | no |
| `cerebras` | Cerebras | `https://api.cerebras.ai/v1` | no | yes |
| `apple_intelligence` | Apple Intelligence | `apple-intelligence://local` | no | yes (on-device, macOS ARM64 only) |
| `bedrock_mantle` | AWS Bedrock (Mantle) | `https://bedrock-mantle.us-east-1.api.aws/v1` | no | yes |
| `custom` | Custom | `http://localhost:11434/v1` | **yes** | no |

Notes:

- **Anthropic** uses the Anthropic base URL and `x-api-key`/`anthropic-version` auth (see headers above), but is still driven through the same chat-completions code path.
- **AWS Bedrock** is exposed as `bedrock_mantle`, labeled "AWS Bedrock (Mantle)", reached through an OpenAI-compatible Mantle endpoint rather than the native Bedrock API.
- **Custom** is the only provider with `allow_base_url_edit: true`. Its default base URL is `http://localhost:11434/v1` (Ollama's OpenAI-compatible endpoint), so a fully local LLM works out of the box without sending text to any cloud.
- **Apple Intelligence** is only injected into the provider list when compiled for macOS ARM64 (`#[cfg(all(target_os = "macos", target_arch = "aarch64"))]`). On other platforms it is absent.

`ensure_post_process_defaults` in `Handy/src-tauri/src/settings.rs` migrates older settings: it adds any missing default providers, seeds empty API-key entries, and syncs the `supports_structured_output` flag so upgrades pick up changed defaults.

## Apple Intelligence (on-device)

`Handy/src-tauri/src/apple_intelligence.rs` is an FFI bridge to native Swift functions and does not make any network request. It exposes:

- `check_apple_intelligence_availability()` — wraps the Swift `is_apple_intelligence_available()` and returns a bool.
- `process_text_with_system_prompt(system_prompt, user_content, max_tokens)` — calls the Swift `process_text_with_system_prompt_apple(...)`, marshalling strings across the C boundary and freeing the returned `AppleLLMResponse`.

Platform gating happens in two places:

- In `settings.rs`, the `apple_intelligence` provider is only added on macOS ARM64. The comment notes availability is **not** checked at startup (to avoid a SIGABRT on macOS 26.x betas when touching `SystemLanguageModel.default` during early init); the check is deferred to first use.
- In `actions.rs`, when the active provider is `apple_intelligence`, the code is guarded by `#[cfg(all(target_os = "macos", target_arch = "aarch64"))]`. It first calls `check_apple_intelligence_availability()`; if unavailable it returns `None`. Otherwise it parses the configured "model" string as an integer token limit and calls `process_text_with_system_prompt`. On any non-macOS-ARM64 build the provider simply returns `None`.

For Apple Intelligence the configured "model" value is actually a max-token limit. The default model ID seeded for the provider is the constant `APPLE_INTELLIGENCE_DEFAULT_MODEL_ID = "Apple Intelligence"` (`default_model_for_provider`), which parses to `0` tokens until the user sets a numeric limit.

## Prompts

### The default prompt

Defined in `default_post_process_prompts()` in `Handy/src-tauri/src/settings.rs` as a single `LLMPrompt` with id `default_improve_transcriptions`, name "Improve Transcriptions":

```
Clean this transcript:
1. Fix spelling, capitalization, and punctuation errors
2. Convert number words to digits (twenty-five → 25, ten percent → 10%, five dollars → $5)
3. Replace spoken punctuation with symbols (period → ., comma → ,, question mark → ?)
4. Remove filler words (um, uh, like as filler)
5. Keep the language in the original version (if it was french, keep it in french for example)

Preserve exact meaning and word order. Do not paraphrase or reorder content.

Return only the cleaned transcript.

Transcript:
${output}
```

### The `${output}` placeholder

`${output}` marks where the transcription goes:

- In **legacy mode** the placeholder is replaced inline with the transcription (`prompt.replace("${output}", transcription)`), and the whole string is sent as one user message.
- In **structured-output mode** `build_system_prompt` strips `${output}` and trims the rest to form the `system` message, while the transcription is sent separately as the `user` message.

### Customizing prompts

Users manage prompts in the UI re-exported by `Handy/src/components/settings/PostProcessingSettingsPrompts.tsx` (the implementation lives in `Handy/src/components/settings/post-processing/PostProcessingSettings.tsx`). Prompts are a named list; one is selected as active. The component supports create / edit / delete through Tauri commands `addPostProcessPrompt`, `updatePostProcessPrompt`, and `deletePostProcessPrompt`, with the active prompt tracked by the `post_process_selected_prompt_id` setting. Deleting the last remaining prompt is blocked (`disabled={... prompts.length <= 1}`). A tip in the UI reminds users to include the `${output}` placeholder.

At runtime `post_process_transcription` looks up `post_process_selected_prompt_id`, finds the matching prompt, and skips post-processing entirely (returning `None`) if no prompt is selected or the prompt body is empty.

## Configuration UI

The settings screen is assembled by `PostProcessingSettings` in `Handy/src/components/settings/post-processing/PostProcessingSettings.tsx`, which renders three groups: the `transcribe_with_post_process` hotkey (`ShortcutInput`), the API/provider config (`PostProcessingSettingsApi`), and the prompt manager (`PostProcessingSettingsPrompts`).

### Enabling post-processing

`Handy/src/components/settings/PostProcessingToggle.tsx` is a simple toggle bound to the `post_process_enabled` setting via `useSettings`. It is off by default (`default_post_process_enabled() => false` in `settings.rs`).

### Provider / model / key fields

The API section (`PostProcessingSettingsApi`) is driven by the `Handy/src/components/settings/PostProcessingSettingsApi/` directory:

- **`usePostProcessProviderState.ts`** — the central hook. It reads providers from `settings.post_process_providers`, resolves the selected provider (`post_process_provider_id`, defaulting to the first provider or `"openai"`), and exposes the current `baseUrl`, `apiKey` (from `post_process_api_keys[providerId]`), and `model` (from `post_process_models[providerId]`). It wires up handlers that call the `useSettings` actions `setPostProcessProvider`, `updatePostProcessBaseUrl`, `updatePostProcessApiKey`, `updatePostProcessModel`, and `fetchPostProcessModels`. Switching provider auto-fetches models when the provider is configured (has an API key, or for `custom`, a base URL), and special-cases Apple Intelligence by calling `commands.checkAppleIntelligenceAvailable()` and surfacing an unavailable state.
- **`ProviderSelect.tsx`** — dropdown over `providerOptions` (each provider's `id`/`label`).
- **`BaseUrlField.tsx`** — text input, rendered **only** for the `custom` provider (it is the only one with `allow_base_url_edit`); commits on blur.
- **`ApiKeyField.tsx`** — password input; commits on blur. Hidden for Apple Intelligence (which needs no key).
- **`ModelSelect.tsx`** — a creatable select. It lists models fetched from the provider's `/models` endpoint and lets the user type a custom model ID; the active model is always kept in the option list. A refresh button re-runs `fetchPostProcessModels`. Hidden for Apple Intelligence.
- **`types.ts`** — the `ModelOption { value, label }` type used by the select.
- **`index.tsx`** — re-exports `PostProcessingSettingsApi`.

The UI hides the base-URL, API-key, and model controls for Apple Intelligence and instead shows an "unavailable" alert when the device cannot run it.

## Settings reference

The persisted post-processing settings (defined on `AppSettings` in `Handy/src-tauri/src/settings.rs`) are:

| Setting | Type | Default |
| --- | --- | --- |
| `post_process_enabled` | bool | `false` |
| `post_process_provider_id` | string | `"openai"` |
| `post_process_providers` | `Vec<PostProcessProvider>` | the table above |
| `post_process_api_keys` | secret map (per provider) | empty strings |
| `post_process_models` | map (per provider) | empty, except Apple Intelligence |
| `post_process_prompts` | `Vec<LLMPrompt>` | the single default prompt |
| `post_process_selected_prompt_id` | optional string | `None` |

Helpers `active_post_process_provider()`, `post_process_provider(id)`, and `post_process_provider_mut(id)` resolve providers from this list.

## Privacy

Post-processing is the single optional step that can transmit transcribed text to a third party. With a cloud provider (OpenAI, Z.AI, OpenRouter, Anthropic, Groq, Cerebras, AWS Bedrock) the transcription is sent over HTTPS to that provider's API. To stay fully local you can either select **Apple Intelligence** (on-device, macOS Apple-silicon, no network call) or use the **Custom** provider pointed at a local OpenAI-compatible server such as Ollama (`http://localhost:11434/v1`). Everything else in Handy stays on your machine.
