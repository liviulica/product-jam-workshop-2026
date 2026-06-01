# Audio Pipeline

This section traces a single utterance from the microphone to inserted text. Handy's audio path runs entirely on-device: capture (`cpal`), resampling to 16 kHz (`rubato`), Voice Activity Detection (Silero VAD), a spectrum visualizer that drives the overlay, a transcription engine (Whisper via `whisper-rs`/`whisper-cpp`, or Parakeet and other ONNX models via `transcribe-rs`), and a text post-step (custom-word correction and filler-word filtering).

## Data Flow

```
 ┌──────────┐   native rate,    ┌──────────────┐  16 kHz, 30 ms    ┌──────────────┐
 │   Mic    │   any format,     │  cpal input  │  mono f32 frames  │ FrameResampler│
 │ (device) ├──────────────────▶│  stream      ├──────────────────▶│  (rubato FFT) │
 └──────────┘   N channels      └──────┬───────┘                   └──────┬───────┘
                                       │ raw f32 (mono-downmixed)         │
                                       ▼                                  │
                                ┌──────────────┐                         │
                                │ AudioVisualiser│  16 bucket levels      │
                                │  (FFT, rustfft)│───────┐                │
                                └──────────────┘        │ level_cb        │
                                                        ▼                 ▼
                                                ┌───────────────┐  ┌──────────────────┐
                                                │  Overlay UI   │  │ SmoothedVad ->   │
                                                │ (emit_levels) │  │ SileroVad        │
                                                └───────────────┘  │ (speech / noise) │
                                                                   └────────┬─────────┘
                                                                            │ kept speech samples
                                                                            ▼
                                                                   ┌──────────────────┐
                                                                   │ TranscriptionMgr │
                                                                   │ Whisper /Parakeet│
                                                                   │ /Moonshine/...   │
                                                                   └────────┬─────────┘
                                                                            │ raw text
                                                                            ▼
                                                                   ┌──────────────────┐
                                                                   │ apply_custom_words│
                                                                   │ filter_transcription
                                                                   │   _output (text.rs)│
                                                                   └────────┬─────────┘
                                                                            ▼
                                                                       final text
```

The recorder runs a dedicated worker thread. The `cpal` callback is the producer; a `run_consumer` loop on the worker thread is the consumer, and they communicate over an `mpsc` channel (`Handy/src-tauri/src/audio_toolkit/audio/recorder.rs`).

## Audio Capture (cpal)

Capture is implemented in `Handy/src-tauri/src/audio_toolkit/audio/recorder.rs` and device enumeration in `Handy/src-tauri/src/audio_toolkit/audio/device.rs`.

### Host and device selection

The `cpal` host is chosen per platform in `Handy/src-tauri/src/audio_toolkit/utils.rs`: Linux forces the ALSA host (`cpal::HostId::Alsa`, falling back to the default host), all other platforms use `cpal::default_host()`.

`list_input_devices()` / `list_output_devices()` (`device.rs`) enumerate devices and flag the one whose name matches the host default. The recording manager resolves the effective device by name from settings (`AudioRecordingManager::get_effective_microphone_device` in `Handy/src-tauri/src/managers/audio.rs`), with a clamshell-mode override that swaps in `settings.clamshell_microphone` when the lid is closed. If no device is configured, `AudioRecorder::open` falls back to `host.default_input_device()`.

### Sample format and channels

`AudioRecorder::get_preferred_config` (`recorder.rs`) deliberately uses the device's **native/default sample rate** rather than forcing 16 kHz on the hardware. The comment is explicit: forcing a non-native rate "can cause issues on some devices (Bluetooth codecs, certain ALSA drivers, etc.)", so downsampling is done in software instead. Among configs that support the default rate it prefers sample formats in the order `F32 > I16 > I32 > others`.

The input stream is built generically over the sample type via `build_stream::<T>` and a match on `cpal::SampleFormat` covering `U8`, `I8`, `I16`, `I32`, and `F32`; anything else is rejected as "Unsupported sample format". Each sample is converted to `f32` with `to_sample::<f32>()`. **Multi-channel input is downmixed to mono** in the callback by averaging the channels of each frame (`mono_sample = sum(frame) / channels`).

The stream is started on a worker thread; if `cpal` fails, the error string is inspected by `is_microphone_access_denied` (matches "access is denied", "permission denied", `0x80070005`) and `is_no_input_device_error` (matches "no input device found", or a CoreAudio config failure) so the UI can show a precise message. These map to `microphone_permission_denied` / `no_input_device` / `unknown` events in `Handy/src-tauri/src/actions.rs`.

### Start / stop and trailing audio

`run_consumer` keeps a `recording` flag. On `Cmd::Start` it clears buffers and resets the visualizer and VAD; on `Cmd::Stop` it flips a `stop_flag`, then drains every remaining chunk until the `cpal` callback emits an `EndOfStream` sentinel (so no captured sample is lost), flushes the resampler with `finish()`, and returns the accumulated `Vec<f32>` to the caller. After stopping it resets `stop_flag` to `false` so the consumer can keep receiving chunks (important for always-on microphone mode).

The manager layer (`Handy/src-tauri/src/managers/audio.rs`) adds two related behaviors: an `extra_recording_buffer_ms` sleep before stopping to capture trailing speech, and short-recording padding (if the result is shorter than 1 second / 16000 samples but non-empty, it is zero-padded to `WHISPER_SAMPLE_RATE * 5 / 4` samples). It also supports always-on vs on-demand microphone modes, lazy stream close after `STREAM_IDLE_TIMEOUT` (30 s), and optional system-output muting while recording (`set_mute`).

## Resampling (rubato)

`FrameResampler` (`Handy/src-tauri/src/audio_toolkit/audio/resampler.rs`) converts the device's native rate to the model rate. The target is `constants::WHISPER_SAMPLE_RATE = 16000` (`Handy/src-tauri/src/audio_toolkit/constants.rs`), and `run_consumer` constructs the resampler with a 30 ms frame duration (`Duration::from_millis(30)`).

Implementation details:

- Uses `rubato::FftFixedIn::<f32>` with a fixed input chunk size of `1024` samples (`RESAMPLER_CHUNK_SIZE`). If `in_hz == out_hz` no resampler is created and samples pass through unchanged.
- Output is re-chunked into fixed-size frames of `frame_samples = round(out_hz * frame_dur)` = `16000 * 0.030 = 480` samples (the exact frame size Silero VAD expects, see below).
- `finish()` zero-pads any remaining partial input chunk and emits a final padded frame so trailing audio is not dropped.

`rubato` is pinned at `rubato = "0.16.2"` in `Handy/src-tauri/Cargo.toml`.

## Voice Activity Detection (Silero VAD)

VAD gates which resampled frames are kept. The trait and types are in `Handy/src-tauri/src/audio_toolkit/vad/mod.rs`: `VoiceActivityDetector::push_frame` takes one 30 ms frame and returns `VadFrame::Speech(&[f32])` or `VadFrame::Noise`.

### Silero core

`SileroVad` (`Handy/src-tauri/src/audio_toolkit/vad/silero.rs`) wraps `vad_rs::Vad` running the bundled ONNX model `resources/models/silero_vad_v4.onnx` (resolved in `Handy/src-tauri/src/managers/audio.rs`). It runs at 16 kHz and expects exactly `SILERO_FRAME_SAMPLES = 16000 * 30 / 1000 = 480` samples per frame, which is why the resampler emits 480-sample frames. The model returns a speech probability; a frame counts as `Speech` when `prob > threshold`, otherwise `Noise`. The dependency is `vad-rs` from `git = "https://github.com/cjpais/vad-rs"` (`Cargo.toml`).

### Smoothing (hysteresis + pre-roll)

Raw per-frame decisions are noisy, so `SileroVad` is wrapped in `SmoothedVad` (`Handy/src-tauri/src/audio_toolkit/vad/smoothed.rs`) before use. It adds:

- **Onset confirmation**: speech only starts after `onset_frames` consecutive voiced frames (debounces spurious blips).
- **Pre-roll / prefill**: it keeps a ring buffer of the last `prefill_frames` frames and prepends them when speech begins, so the leading edge of a word is not clipped.
- **Hangover**: after speech stops, it keeps emitting frames for `hangover_frames` more frames before declaring silence, so short pauses inside a sentence do not cut off audio.

The concrete wiring is in `create_audio_recorder` (`Handy/src-tauri/src/managers/audio.rs`):

```rust
let silero = SileroVad::new(vad_path, 0.3)?;            // threshold 0.3
let smoothed_vad = SmoothedVad::new(Box::new(silero), 15, 15, 2);
//                                          prefill=15, hangover=15, onset=2
```

At 30 ms per frame, prefill/hangover of 15 frames each is ~450 ms of pre-roll and ~450 ms of trailing hold; onset of 2 frames is ~60 ms of confirmation.

### How VAD gates recording

Inside `run_consumer` (`recorder.rs`), each resampled frame is passed to `handle_frame`. When recording and a VAD is present, the frame is pushed into the detector; only `VadFrame::Speech(buf)` content is appended to `processed_samples` (which becomes the audio sent to transcription), and `VadFrame::Noise` is dropped. If no VAD is attached, all frames are kept. The result is that long silences and noise never reach the transcription engine.

## Audio Visualizer (overlay)

`AudioVisualiser` (`Handy/src-tauri/src/audio_toolkit/audio/visualizer.rs`) computes the level bars shown in the recording overlay. It runs on the **raw** (pre-resample, mono-downmixed) samples in `run_consumer`, independent of the VAD/transcription branch.

- It buffers samples into 512-sample windows (`WINDOW_SIZE`), applies a Hann window, removes the DC component, and runs a forward FFT via `rustfft` (`FftPlanner::plan_fft_forward`).
- The power spectrum is grouped into `BUCKETS = 16` logarithmically spaced buckets between `400 Hz` and `4000 Hz` (the vocal range; bounds passed from `run_consumer`).
- Each bucket is converted to dB, normalized against a slowly adapting per-bucket noise floor, gain/curve-shaped (`GAIN = 1.3`, `CURVE_POWER = 0.7`, dB range -55..-8), and lightly smoothed across neighbors.

When `feed()` returns a fresh bucket vector, the recorder invokes the registered `level_cb`. In `create_audio_recorder` that callback is `utils::emit_levels(&app_handle, &levels)`, which forwards the 16 levels to the frontend overlay as a Tauri event. `reset()` is called on `Cmd::Start` so the noise floor and buffer start fresh each recording.

## Transcription Engines

Engine selection and loading live in `Handy/src-tauri/src/managers/transcription.rs`; the lifecycle is serialized by `Handy/src-tauri/src/transcription_coordinator.rs`.

### Engine types

`EngineType` (`Handy/src-tauri/src/managers/model.rs`) has eight variants: `Whisper`, `Parakeet`, `Moonshine`, `MoonshineStreaming`, `SenseVoice`, `GigaAM`, `Canary`, `Cohere`. Whisper runs through `transcribe_rs::whisper_cpp::WhisperEngine` (the `whisper-cpp` / `whisper-rs` path); all the others are ONNX models under `transcribe_rs::onnx::*`. Both Whisper and the ONNX engines are provided by the single `transcribe-rs` crate (`Cargo.toml`: `transcribe-rs = { version = "0.3.8", features = ["whisper-cpp", "onnx"] }`).

### Loading and selection

`TranscriptionManager::load_model(model_id)` looks up the model's `engine_type` via `ModelManager` and constructs the matching `LoadedEngine` variant:

- `Whisper` -> `WhisperEngine::load(path)`
- `Parakeet` -> `ParakeetModel::load(path, Quantization::Int8)`
- `Moonshine` -> `MoonshineModel::load(path, MoonshineVariant::Base, ...)`
- `MoonshineStreaming`, `SenseVoice` (`Int8`), `GigaAM` (`Int8`), `Canary` (`Int8`), `Cohere` (`Int8`) load similarly.

A model must be downloaded first (`model_info.is_downloaded`), or loading fails with "Model not downloaded". Loading runs in a background thread (`initiate_model_load`), guarded by an `is_loading` flag + `Condvar` so concurrent transcribe requests wait rather than double-load. An idle watcher thread unloads the model after `model_unload_timeout` (or immediately, depending on the setting) to free memory/VRAM. Load/unload state is broadcast to the frontend via `model-state-changed` events.

### Transcribing

`transcribe(audio: Vec<f32>)` waits for any in-progress load, then dispatches per engine. Each engine call is wrapped in `catch_unwind`: on a normal result the engine is put back; on a panic the engine is **not** restored (effectively unloaded) and the model id is cleared so it reloads next time, which prevents a poisoned mutex from hanging the app. Key per-engine behavior:

- **Whisper**: builds `WhisperInferenceParams` with the validated language (`auto` -> `None`; `zh-Hans`/`zh-Hant` normalized to `zh`), `translate = settings.translate_to_english`, and passes the user's custom words as `initial_prompt` (joined by ", ").
- **Parakeet**: `ParakeetParams` with `TimestampGranularity::Segment`.
- **SenseVoice / Canary / Cohere**: map the selected language to the engine's supported set; `translate` is honored where the engine supports it (Whisper and Canary).

Language is first validated against the model's `supported_languages` in `transcribe()`; unsupported selections fall back to `auto`.

### Orchestration

`TranscriptionCoordinator` (`transcription_coordinator.rs`) runs a single thread that serializes start/stop/cancel through a `Stage` state machine (`Idle` -> `Recording` -> `Processing`) with a 30 ms debounce, eliminating races between hotkeys, CLI signals, and the async transcribe/paste task. The actual start/stop work is the `TranscribeAction` in `Handy/src-tauri/src/actions.rs`: `start` kicks off model load and VAD pre-load in parallel and begins recording; `stop` retrieves the samples (`AudioRecordingManager::stop_recording`), calls `tm.transcribe(samples)`, saves a WAV to history concurrently, then runs the text post-step and pastes.

## GPU / Hardware Acceleration

Acceleration is selected at **compile time** by `transcribe-rs` feature flags, per target, in `Handy/src-tauri/Cargo.toml`:

| Platform | Whisper backend | ONNX (ORT) backend |
| --- | --- | --- |
| macOS | `whisper-metal` (Metal) | CoreML / CPU via ORT (no extra ORT feature flag) |
| Windows | `whisper-vulkan` (Vulkan) | `ort-directml` (DirectML) |
| Linux | `whisper-vulkan` (Vulkan) | ORT default |

At **runtime**, the user's preference is applied via `apply_accelerator_settings` (`transcription.rs`), which pushes settings into `transcribe-rs`'s global `accel` atomics:

- **Whisper accelerator**: `Auto` / `CpuOnly` / `Gpu` (`set_whisper_accelerator`), plus a GPU device index (`set_whisper_gpu_device`, `GPU_DEVICE_AUTO` = auto).
- **ORT accelerator**: `Auto` / `CpuOnly` / `Cuda` / `DirectMl` / `Rocm` (`set_ort_accelerator`).

`get_available_accelerators()` reports which options the current build actually supports: Whisper is always `["auto", "cpu", "gpu"]`, ORT options come from `OrtAccelerator::available()`, and `cached_gpu_devices()` enumerates GPUs via `whisper_cpp::gpu::list_gpu_devices` (with VRAM in MB). Notably, on x86_64 CPUs lacking FMA3 it skips GPU enumeration entirely, because ggml's Vulkan backend uses FMA3 internally and would SIGILL on such CPUs.

### User-facing options

`Handy/src/components/settings/AccelerationSelector.tsx` renders two dropdowns from `commands.getAvailableAccelerators()`:

- **Whisper**: a combined "Auto", per-GPU-device entries (label shows device name + VRAM), and "CPU". The dropdown encodes accelerator + device in one value: `"auto"`, `"cpu"`, or `"gpu:<id>"` (decoded to `whisper_accelerator` + `whisper_gpu_device`).
- **ORT**: shown only when more than two options are available (`auto`, `cpu`, `cuda`, `directml`, `rocm`), so it appears only on builds with a real GPU ORT backend (for example Windows DirectML).

## Text Post-Processing

After the engine returns text, two local steps run in `transcribe()` before the result leaves the manager, both defined in `Handy/src-tauri/src/audio_toolkit/text.rs`:

### Custom-word correction (`apply_custom_words`)

Corrects transcribed words toward a user-defined vocabulary using fuzzy matching:

- Combines **Levenshtein distance** (`strsim`) with **Soundex phonetic matching** (`natural`); phonetic matches get a strong score boost (`levenshtein_score * 0.3`).
- Uses greedy **n-gram matching** from 3 words down to 1, so split artifacts like "Charge B" map to "ChargeBee" and "Chat G P T" to "ChatGPT".
- Preserves the original case pattern and surrounding punctuation, and skips candidates whose length differs by more than ~25%.
- Controlled by `settings.word_correction_threshold`.

Important: this step is **skipped for Whisper** models, because Whisper already receives the custom words as its `initial_prompt`. It runs only for the non-Whisper (ONNX) engines, and only when `settings.custom_words` is non-empty.

### Filler / stutter filtering (`filter_transcription_output`)

Always runs (for every engine). It removes language-aware filler words and collapses stutters:

- Filler words are language-specific (e.g. English "um/uh/hmm"); the language is taken from `settings.app_language`, and the base code is split from region (so `pt-BR` -> `pt`). The list is deliberately conservative for languages where a filler is a real word (Portuguese "um" = a/an, Spanish "ha" = has). A user-supplied `custom_filler_words` list overrides the defaults; an empty custom list disables filtering.
- `collapse_stutters` reduces 3+ consecutive repetitions of the same word to one ("wh wh wh wh" -> "wh"), and excess whitespace is collapsed.

Note: not all post-processing is in `text.rs`. Chinese Simplified/Traditional conversion (OpenCC) and optional LLM post-processing happen later in `process_transcription_output` (`Handy/src-tauri/src/actions.rs`), after the audio pipeline proper.
