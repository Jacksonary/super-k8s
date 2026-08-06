# Agent Instructions

Super K8S is a Tauri 2 desktop Kubernetes manager with a Rust backend and a React 18 + TypeScript + Ant Design 5 frontend. Use the product docs as the source of truth for user-facing behavior: [README.md](README.md) and [README.zh-CN.md](README.zh-CN.md).

## Commands

- Install dependencies with `npm install` for local work; CI uses `npm ci`.
- Start the desktop app with `npm run tauri dev`. Tauri runs Vite through `src-tauri/tauri.conf.json` on `http://localhost:1420`.
- Build the frontend only with `npm run build` (`tsc && vite build`).
- Build the desktop bundle with `npm run tauri build`.
- For Rust-only validation, use `cargo check --manifest-path src-tauri/Cargo.toml` and `cargo fmt --manifest-path src-tauri/Cargo.toml`.
- There are currently no dedicated npm lint or test scripts; do not invent one in status reports.

## Architecture

- Frontend source lives in [src](src); Tauri/Rust source lives in [src-tauri/src](src-tauri/src).
- Keep all frontend-to-backend calls in [src/api.ts](src/api.ts). It normalizes Tauri errors and wraps `invoke`; page components should call `api`, not `invoke` directly.
- Frontend DTOs in [src/types.ts](src/types.ts) mirror Rust DTOs in [src-tauri/src/types.rs](src-tauri/src/types.rs). The app intentionally keeps snake_case field names across the boundary.
- Cluster selection, namespace selection, summaries, and refresh helpers are centralized in [src/store/clusterStore.tsx](src/store/clusterStore.tsx). App settings are in [src/store/settingsStore.tsx](src/store/settingsStore.tsx).
- Page-level resource views live in [src/pages](src/pages). Shared resource drilldowns and drawers live under [src/components/Detail](src/components/Detail); pod logs/exec UI lives under [src/components/Pod](src/components/Pod).
- Rust Tauri commands are grouped in [src-tauri/src/commands](src-tauri/src/commands) and registered in the `invoke_handler` in [src-tauri/src/lib.rs](src-tauri/src/lib.rs).
- Kubernetes client reuse is handled by [src-tauri/src/cluster_pool.rs](src-tauri/src/cluster_pool.rs). Kubeconfig and app config persistence are handled by [src-tauri/src/config.rs](src-tauri/src/config.rs).

## Change Patterns

- When adding or renaming a Tauri command, update all of these together: the Rust command module, [src-tauri/src/commands/mod.rs](src-tauri/src/commands/mod.rs), the `generate_handler!` list in [src-tauri/src/lib.rs](src-tauri/src/lib.rs), the wrapper in [src/api.ts](src/api.ts), and shared DTOs in [src/types.ts](src/types.ts) / [src-tauri/src/types.rs](src-tauri/src/types.rs) when the payload changes.
- Tauri command arguments are snake_case in Rust and camelCase in TypeScript call sites; Tauri maps them across the IPC boundary. Keep command names themselves snake_case strings.
- Return `Result<T, String>` from Rust commands and format Kubernetes failures with a useful prefix such as `[KUBE]` when following existing command style.
- Use `scope::list_scoped` for namespace-aware Kubernetes list commands so the selected namespace and cluster namespace override behavior stays consistent.
- For frontend resource pages, follow the existing Ant Design pattern: local `loading` state, `useCallback` load function, `message.error(String(err))`, `useEffect(() => { void load(); }, [load])`, and table columns with explicit widths for dense Kubernetes data.
- Use `@ant-design/icons` for button icons in this codebase.
- If plugin permissions or window capabilities change, update [src-tauri/capabilities/default.json](src-tauri/capabilities/default.json) alongside Tauri config and code.

## Release Notes For Agents

- Release builds are driven by [.github/workflows/release.yml](.github/workflows/release.yml) on `v*` tags and publish Tauri updater artifacts.
- Before changing updater behavior, check `plugins.updater` in [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json) and the README release section.
- The updater public key in local config is a placeholder; do not replace it unless the user provides the real minisign key material or explicitly asks for release setup.
