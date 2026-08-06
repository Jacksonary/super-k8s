# Super K8s

一款跨平台的桌面 Kubernetes 集群管理工具，基于 Tauri 2（Rust 后端）+ React 18 + TypeScript + Ant Design 5 构建。可以把它看作轻量版的 Lens / Rancher Desktop。

[English](./README.md) | 简体中文

## 功能

- **多集群管理** —— 自动从标准的 `~/.kube/config` 读取集群，并支持粘贴额外的 kubeconfig YAML 合并更多集群。一个集群对应一个 kubeconfig context。
- **概览** —— 集群 server 版本及各类资源数量一览。
- **节点（Nodes）** —— 状态、角色、版本、内网 IP、CPU/内存容量。
- **命名空间（Namespaces）** —— 列出并管理命名空间。
- **Pods** —— 阶段、就绪数、重启次数、所在节点、Pod IP，以及实时 **日志** 查看。
- **部署（Deployments）** —— 就绪副本数，支持 **扩缩容** 与 **滚动重启**。
- **服务（Services）** —— 类型、Cluster IP、端口、外部 IP。
- **配置字典（ConfigMaps）** —— 浏览键与数据。
- **事件（Events）** —— 类型、原因、消息、关联对象。

## 下载安装

前往 [GitHub Releases](https://github.com/Jacksonary/super-k8s/releases) 页面下载对应平台的安装包：

| 平台 | 格式 |
|---|---|
| Windows 64-bit | `.exe` (NSIS) / `.msi` |
| Linux | `.deb` / `.rpm` / `.AppImage` |
| macOS（仅 Apple Silicon） | `.dmg` |

> Linux AppImage 无需安装，赋予执行权限后直接运行：
> `chmod +x Super\ K8s_*.AppImage && ./Super\ K8s_*.AppImage`

> **macOS**：目前仅提供 Apple Silicon（M 系列）版本，不支持 Intel Mac。由于应用未经代码签名和公证，首次打开时 Gatekeeper 会提示"已损坏"。在终端执行以下命令移除隔离属性即可：
> ```bash
> xattr -cr "/Applications/Super K8S.app"
> ```

## 开发

```bash
npm install
npm run tauri dev
```

## 构建

```bash
npm install
npm run tauri build
```

## 发布 / 自动更新

应用内置了 Tauri 更新器。在发布制品之前，你需要配置 minisign 签名密钥：

- 在 CI（GitHub Actions）中设置 `TAURI_SIGNING_PRIVATE_KEY` secret。
- 将 `src-tauri/tauri.conf.json` 中 `plugins.updater.pubkey` 的占位符替换为你的 minisign 公钥。

推送 `v*` 标签会触发发布流程，自动为 Linux、Windows 和 macOS 构建并发布 GitHub Release。
