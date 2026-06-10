# Build & Release

How Handy is built, tested, packaged, and shipped. Handy is a Tauri v2 desktop app: a React/TypeScript frontend (Vite) embedded in a Rust backend, bundled into native installers for macOS, Windows, and Linux. This page documents the real toolchain, scripts, Tauri configuration, GitHub Actions CI/CD, the Nix flake, and the release/auto-update flow, all grounded in the source.

## Toolchain overview

| Tool | Role | Where it is configured |
| --- | --- | --- |
| **Bun** | Package manager + script runner for the frontend; also runs maintenance scripts | `Handy/package.json`, lockfile `Handy/bun.lock` |
| **Vite 6** | Frontend bundler (dev server + production build) | `Handy/vite.config.ts` |
| **TypeScript** | Type-checks the frontend before bundling (`tsc && vite build`) | `Handy/tsconfig.json`, `Handy/package.json` |
| **Tauri CLI v2** | Orchestrates dev/build, wraps the frontend in a Rust webview app, produces native bundles | `Handy/src-tauri/tauri.conf.json` (`@tauri-apps/cli` in `Handy/package.json` devDeps) |
| **Rust / Cargo** | Compiles the backend binary `handy` and the `handy_app_lib` library | `Handy/src-tauri/Cargo.toml` |
| **Playwright** | Frontend end-to-end tests (Chromium) | `Handy/playwright.config.ts`, `Handy/tests/` |
| **Nix flake** | Reproducible package build + dev shell (Linux) | `Handy/flake.nix`, `Handy/nix/` |

Note on Bun: `Handy/package.json` does **not** declare a `packageManager` field. Bun is the required package manager per `Handy/BUILD.md` ("[Bun](https://bun.sh/) package manager"), and the committed `Handy/bun.lock` is the source of truth for dependency versions (CI installs with `bun install --frozen-lockfile`).

### npm scripts (from `Handy/package.json`)

```jsonc
"dev":               "vite",                     // Vite dev server (frontend only)
"build":             "tsc && vite build",        // type-check, then production frontend build
"preview":           "vite preview",             // preview the built frontend
"tauri":             "tauri",                     // pass-through to the Tauri CLI
"lint":              "eslint src",
"lint:fix":          "eslint src --fix",
"format":            "prettier --write . && cd src-tauri && cargo fmt",
"format:check":      "prettier --check . && cd src-tauri && cargo fmt -- --check",
"format:frontend":   "prettier --write .",
"format:backend":    "cd src-tauri && cargo fmt",
"test:playwright":   "playwright test",
"test:playwright:ui":"playwright test --ui",
"check:translations":"bun scripts/check-translations.ts",
"postinstall":       "bun scripts/check-nix-deps.ts"   // regenerates .nix/bun.nix after install
```

The `postinstall` hook runs `Handy/scripts/check-nix-deps.ts` on every `bun install`, keeping the Nix bun lockfile (`Handy/.nix/bun.nix`) in sync with `Handy/bun.lock`. (`Handy/scripts/check-translations.ts` powers `check:translations`.)

## Building and running locally

Prerequisites (per `Handy/BUILD.md`): the latest stable Rust toolchain, Bun, and the standard [Tauri prerequisites](https://tauri.app/start/prerequisites/) plus platform-specific system libraries (Xcode Command Line Tools on macOS; MSVC build tools on Windows; ALSA/GTK/WebKitGTK/Vulkan dev packages on Linux, full list in `Handy/BUILD.md`).

### Install dependencies

```bash
bun install
```

### Run the full app in development

This is the normal dev loop. The Tauri CLI starts the Vite dev server and the Rust app together:

```bash
bun run tauri dev
```

Under the hood, `Handy/src-tauri/tauri.conf.json` sets `build.beforeDevCommand` to `bun run dev` and `build.devUrl` to `http://localhost:1420`, so Tauri spawns Vite and loads the app from that port. `Handy/vite.config.ts` pins the dev server to port `1420` with `strictPort: true`.

On macOS, a cmake version error can be worked around with (per `Handy/AGENTS.md`):

```bash
CMAKE_POLICY_VERSION_MINIMUM=3.5 bun run tauri dev
```

#### Intel Macs (x86_64)

`ort-sys` ships no prebuilt ONNX Runtime binaries for `x86_64-apple-darwin`, so on an Intel Mac the build fails out of the box. Per `Handy/BUILD.md`, install ONNX Runtime via Homebrew and link against it dynamically by exporting `ORT_LIB_LOCATION` and `ORT_PREFER_DYNAMIC_LINK`:

```bash
brew install onnxruntime
ORT_LIB_LOCATION=$(brew --prefix onnxruntime)/lib ORT_PREFER_DYNAMIC_LINK=1 bun run tauri dev
```

The same environment variables apply to a production build:

```bash
ORT_LIB_LOCATION=$(brew --prefix onnxruntime)/lib ORT_PREFER_DYNAMIC_LINK=1 bun run tauri build
```

Apple Silicon Macs do not need this; their target (`aarch64-apple-darwin`) has prebuilt ONNX Runtime binaries. This mirrors what CI already does for the `x86_64-apple-darwin` matrix entry (ONNX Runtime download + bundling on x64 macOS — see the CI section below).

### Frontend-only development

```bash
bun run dev        # Vite dev server on :1420
bun run build      # tsc + vite build into ../dist
bun run preview    # serve the production build
```

`Handy/vite.config.ts` defines **two entry points** via Rollup input: `main` (`index.html`) and `overlay` (`src/overlay/index.html`), the recording overlay window. It also wires the `@vitejs/plugin-react` and `@tailwindcss/vite` plugins and a `@` path alias to `./src`.

### Build a production bundle

```bash
bun run tauri build
```

Tauri runs `build.beforeBuildCommand` (`bun run build`) first, takes the result from `build.frontendDist` (`../dist`), then compiles the release Rust binary and produces platform installers: deb/rpm/AppImage on Linux, dmg on macOS, msi/NSIS on Windows (see `Handy/BUILD.md`).

You can restrict bundle targets, e.g. to skip a failing AppImage step on rolling-release Linux distros (`Handy/BUILD.md`):

```bash
bun run tauri build -- --bundles deb
```

Note: a development model file is required at runtime. `Handy/AGENTS.md` instructs downloading the Silero VAD model into `src-tauri/resources/models/silero_vad_v4.onnx` before development.

### Rust backend specifics (`Handy/src-tauri/Cargo.toml`)

- Package `handy` with `default-run = "handy"`; library crate `handy_app_lib` (`crate-type = ["staticlib", "cdylib", "rlib"]`) — the `_lib` suffix avoids a Windows name clash.
- Release profile is size/perf-tuned: `lto = true`, `codegen-units = 1`, `strip = true`, `panic = "unwind"`.
- Transcription backend (`transcribe-rs`) is feature-gated per OS: `whisper-metal` on macOS, `whisper-vulkan` (plus `ort-directml` on Windows) elsewhere — see the `[target.'cfg(...)']` sections.
- Uses patched/forked crates via `[patch.crates-io]` pointing `tauri-runtime`, `tauri-runtime-wry`, and `tauri-utils` at `github:cjpais/tauri` (branch `handy-2.10.2`), plus several git dependencies (`rdev`, `vad-rs`, `rodio`, `tauri-nspanel`).
- TypeScript bindings for the frontend are generated from Rust via `tauri-specta` / `specta` (output consumed as `src/bindings.ts`).

## Tauri configuration (`Handy/src-tauri/tauri.conf.json`)

| Setting | Value | Notes |
| --- | --- | --- |
| `productName` | `Handy` | |
| `version` | `0.8.3` | Matches `Cargo.toml` package version |
| `identifier` | `com.pais.handy` | App bundle identifier |
| `app.macOSPrivateApi` | `true` | Enables private macOS APIs (panel/overlay) |
| `app.windows` | `[]` | No windows declared statically; windows are created at runtime in Rust |
| `app.security.assetProtocol` | enabled, scope `**` | Allows the webview to load local assets |
| `bundle.active` | `true` | |
| `bundle.targets` | `"all"` | Build every installer type the platform supports |
| `bundle.createUpdaterArtifacts` | `true` | Emits signed update artifacts + `latest.json` (see Updater below) |
| `bundle.resources` | `resources/**/*` | Bundles tray icons, sounds, VAD model |
| `bundle.license` | `MIT` | |

Platform bundle details:

- **macOS** (`bundle.macOS`): `hardenedRuntime: true`, `minimumSystemVersion: 10.15`, `signingIdentity: "-"` (adhoc by default; CI overrides with a real identity), `entitlements: "Entitlements.plist"`.
- **Linux**: deb declares a runtime dependency on `libgtk-layer-shell0`; rpm uses `compression.type: none`; AppImage sets `bundleMediaFramework: true`.
- **Windows**: NSIS installer from a custom template `nsis/installer.nsi`, and a `signCommand` invoking `trusted-signing-cli` against Azure Trusted Signing (`https://eus.codesigning.azure.net/`, account `CJ-Signing`, profile `cjpais-dev`).

### Plugins

The frontend pulls in a broad set of Tauri plugins (`Handy/package.json`): `autostart`, `clipboard-manager`, `dialog`, `fs`, `global-shortcut`, `opener`, `os`, `process`, `sql`, `store`, `updater`, and `tauri-plugin-macos-permissions-api`. The Rust side (`Handy/src-tauri/Cargo.toml`) adds `tauri-plugin-log`, `tauri-plugin-single-instance`, and the desktop-only `tauri-plugin-autostart`/`global-shortcut`/`updater` behind a `cfg(not(android/ios))` gate.

### Updater (`plugins.updater`)

Auto-update is configured directly in `tauri.conf.json`:

- **Public key** (`pubkey`): a base64 minisign public key embedded in the config; releases must be signed with the matching private key.
- **Endpoint**: `https://github.com/cjpais/Handy/releases/latest/download/latest.json` — the app fetches this manifest to discover new versions.

This pairs with `bundle.createUpdaterArtifacts: true`, which makes `tauri build` emit the signed update bundles and the `latest.json` manifest during release.

## Testing

- **Rust unit/integration tests** run in `Handy/.github/workflows/test.yml` via `cargo test`. To keep CI fast and avoid compiling whisper/Vulkan, that workflow swaps in a mock transcription manager (`cp src/managers/transcription_mock.rs src/managers/transcription.rs` and strips `transcribe-rs` from `Cargo.toml`).
- **Playwright e2e tests** (`Handy/playwright.config.ts`, spec in `Handy/tests/app.spec.ts`) run against Chromium. The config starts the frontend with `bunx vite dev` on `http://localhost:1420`, retries twice in CI, and emits an HTML report. Run locally with `bun run test:playwright` (or `:ui`).

## CI/CD (GitHub Actions, `Handy/.github/workflows/`)

The pipeline centers on one reusable build workflow (`build.yml`) called by several entry-point workflows, plus standalone quality/test/nix workflows.

| Workflow file | Trigger | What it does | Platforms |
| --- | --- | --- | --- |
| `build.yml` | `workflow_call` (reusable) | Core build: checks out, sets up Bun + Rust (with macOS targets), caches Cargo, installs OS deps + Vulkan SDK, optionally signs (Apple cert import / Azure Trusted Signing / Tauri minisign), runs `tauri-apps/tauri-action`, post-processes the AppImage (removes bundled `libwayland-client.so`), uploads artifacts and/or attaches to a release | Driven by caller inputs (`platform`, `target`, `build-args`, etc.) |
| `main-build.yml` | `push` to `main` | Full cross-platform signed build on every commit to main; uploads artifacts (30-day retention) so any main commit is downloadable/testable | macOS arm64 + x64, Ubuntu 22.04/24.04/24.04-arm, Windows x64 + arm64 |
| `release.yml` | `workflow_dispatch` | Creates a **draft** GitHub release (`v<version>` from `tauri.conf.json`, auto-generated notes), then runs the full signed matrix via `build.yml` attaching artifacts to that release | Full 7-target matrix |
| `pr-test-build.yml` | `workflow_dispatch` (input `pr_number`) | Builds a specific PR's merge ref across the full matrix (signed), uploads artifacts, and comments the download link on the PR | Full 7-target matrix |
| `build-test.yml` | `workflow_dispatch` | Manual full-matrix signed build (artifact prefix `handy-test`); smoke-test the build pipeline without releasing | Full 7-target matrix |
| `code-quality.yml` | `push`/`pull_request` on frontend paths | `bun install --frozen-lockfile`, then `check:translations`, ESLint (`bun run lint`), and Prettier (`bun run format:check`) | `ubuntu-latest` |
| `test.yml` | `push`/`pull_request` touching `src-tauri/**` | Rust tests via `cargo test` using the mock transcription manager | `ubuntu-24.04` |
| `playwright.yml` | `workflow_dispatch` / `pull_request` on frontend paths | Installs deps + Chromium, runs `bun run test:playwright`, uploads the report on failure | `ubuntu-latest` |
| `nix-check.yml` | `push`/`pull_request` on nix/source paths | Two tiers: always verifies `.nix/bun.nix` is in sync and `nix eval` succeeds; runs the full `nix build .#handy` (~25 min) only when nix packaging files change (or on push/dispatch) | `ubuntu-24.04` |

### Build matrix and platforms

`main-build.yml`, `release.yml`, `pr-test-build.yml`, and `build-test.yml` all share the same 7-target matrix:

- `macos-26` → `aarch64-apple-darwin` (Apple Silicon; macOS 26 for the Apple Intelligence SDK)
- `macos-latest` → `x86_64-apple-darwin` (Intel)
- `ubuntu-22.04` → `x86_64-unknown-linux-gnu`, bundles `deb`
- `ubuntu-24.04` → `x86_64-unknown-linux-gnu`, bundles `appimage,rpm`
- `ubuntu-24.04-arm` → `aarch64-unknown-linux-gnu`, bundles `appimage,deb,rpm`
- `windows-latest` → `x86_64-pc-windows-msvc`
- `windows-11-arm` → `aarch64-pc-windows-msvc`

`build.yml` contains substantial platform-specific handling: Vulkan SDK installation per OS/arch, ONNX Runtime download + bundling on x64 macOS and x64 Linux 22.04, Windows long-path/short-target-dir fixes for the whisper-rs cmake build, ARM64 Windows cmake configured to use Ninja + clang-cl, and `GGML_*` SIMD flags disabled on generic x86_64 to avoid SIGILL crashes on older CPUs.

### Signing in CI

When `sign-binaries: true` (set by `main-build.yml`, `release.yml`, `pr-test-build.yml`, `build-test.yml`), `build.yml`:

- **macOS**: imports an Apple Developer certificate from secrets into a temporary keychain and passes `APPLE_*` notarization secrets plus the resolved signing identity to `tauri-action`.
- **Windows**: installs `trusted-signing-cli` and provides `AZURE_*` secrets so the `signCommand` in `tauri.conf.json` can sign via Azure Trusted Signing.
- **Updater**: passes `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` so the updater artifacts are signed with the minisign key matching the `pubkey` in `tauri.conf.json`.

## Release artifacts & auto-update

Releasing is manual (`workflow_dispatch` on `Handy/.github/workflows/release.yml`):

1. `create-release` reads the version from `src-tauri/tauri.conf.json` and creates a **draft** GitHub release tagged `v<version>` with auto-generated notes.
2. `publish-tauri` runs the full signed matrix through `build.yml`, attaching each platform's installers to that release (`upload-artifacts: false`, `release-id` set so `tauri-action` uploads directly to the release).
3. Because `bundle.createUpdaterArtifacts` is `true`, the signed update bundles and a `latest.json` manifest are produced and uploaded alongside the installers.
4. Installed apps poll the updater endpoint `https://github.com/cjpais/Handy/releases/latest/download/latest.json`, verify the signature against the embedded `pubkey`, and self-update.

The draft is published manually after verification, at which point `.../releases/latest/...` resolves to the new version.

## Nix flake (`Handy/flake.nix`, `Handy/nix/`)

The flake targets `x86_64-linux` and `aarch64-linux` and uses [`bun2nix`](https://github.com/nix-community/bun2nix) (pinned `2.0.8`) to fetch Bun dependencies reproducibly per package from `Handy/.nix/bun.nix` (auto-generated from `bun.lock`; kept current by the `postinstall` hook / `bun scripts/check-nix-deps.ts`).

It provides:

- **`packages.<system>.handy`** (and `default`): a `rustPlatform.buildRustPackage` building from `src-tauri` with `tauriBundleType = "deb"`, `allowBuiltinFetchGit` for git Cargo deps, and `cargo-tauri.hook`. `postPatch` flips `createUpdaterArtifacts` to `false` (no signing key in the sandbox), strips the `postinstall` script, and patches `libappindicator-sys` / `ferrous-opencc` for the sandbox. `doCheck = false` because tests need audio devices, model files, and GPU/Vulkan. Native deps include WebKitGTK 4.1, GTK3, ALSA, onnxruntime, Vulkan loader/headers, shaderc, and GStreamer plugins.
- **`devShells.<system>.default`**: a `mkShell` with the Rust toolchain (`rustc`, `cargo`, `rust-analyzer`, `clippy`), `nodejs` + `bun`, `cargo-tauri`, `cmake`, and the shared native libraries/env (`ORT_LIB_LOCATION`, `GST_PLUGIN_SYSTEM_PATH_1_0`, `LD_LIBRARY_PATH`). Its `shellHook` runs `bun install` and prints "Run 'bun run tauri dev' to start".
- **`nixosModules.default`** (`Handy/nix/module.nix`): a NixOS module exposing `programs.handy.enable`; installs the package and adds a udev rule (`KERNEL=="uinput", GROUP="input", MODE="0660"`) so `rdev`'s `grab()` can create virtual input devices.
- **`homeManagerModules.default`** (`Handy/nix/hm-module.nix`): a home-manager module exposing `services.handy.enable`; defines a systemd user service that runs `${package}/bin/handy` (autostart, `Restart = "on-failure"`).

Build the package: `nix build .#handy`. Enter the dev shell: `nix develop`.
