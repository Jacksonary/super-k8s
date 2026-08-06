# Super K8s

A cross-platform desktop Kubernetes cluster manager built with Tauri 2 (Rust backend) and React 18 + TypeScript + Ant Design 5. Think of it as a lightweight Lens / Rancher Desktop alternative.

English | [简体中文](./README.zh-CN.md)

## Features

- **Multi-cluster management** — seeds clusters from your standard `~/.kube/config`, and lets you paste an additional kubeconfig YAML to merge in more clusters. A cluster maps 1:1 to a kubeconfig context.
- **Overview** — cluster server version and at-a-glance resource counts.
- **Nodes** — status, roles, version, internal IP, CPU/memory capacity.
- **Namespaces** — list and manage namespaces.
- **Pods** — phase, ready count, restarts, node, pod IP, and live **logs** viewer.
- **Deployments** — ready replicas, **scale** and **rollout restart**.
- **Services** — type, cluster IP, ports, external IP.
- **ConfigMaps** — browse keys and data.
- **Events** — type, reason, message, involved object.

## Download

Head to [GitHub Releases](https://github.com/Jacksonary/super-k8s/releases) to grab the installer for your platform:

| Platform | Format |
|---|---|
| Windows 64-bit | `.exe` (NSIS) / `.msi` |
| Linux | `.deb` / `.rpm` / `.AppImage` |
| macOS (Apple Silicon only) | `.dmg` |

> For Linux AppImage, no installation is required — just make it executable and run:
> `chmod +x Super\ K8s_*.AppImage && ./Super\ K8s_*.AppImage`

> **macOS**: only Apple Silicon (M-series) Macs are supported; Intel Macs are not built. The app isn't code-signed/notarized, so Gatekeeper will report it as "damaged" on first launch. Remove the quarantine attribute to fix it:
> ```bash
> xattr -cr "/Applications/Super K8S.app"
> ```

## Development

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm install
npm run tauri build
```

## Releasing / Auto-update

The app ships with the Tauri updater. Before publishing release artifacts you must configure minisign signing keys:

- Set the `TAURI_SIGNING_PRIVATE_KEY` secret in CI (GitHub Actions).
- Replace the `plugins.updater.pubkey` placeholder in `src-tauri/tauri.conf.json` with your minisign public key.

Pushing a `v*` tag triggers the release workflow, which builds for Linux, Windows and macOS and publishes a GitHub Release.
