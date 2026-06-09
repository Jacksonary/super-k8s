import { invoke } from "@tauri-apps/api/core";
import type * as T from "./types";

type UnknownRecord = Record<string, unknown>;

function normalizeError(err: unknown): Error {
  if (err instanceof Error) return err;
  if (typeof err === "string") return new Error(err);
  try {
    return new Error(JSON.stringify(err));
  } catch {
    return new Error(String(err));
  }
}

async function tauriInvoke<R>(command: string, args?: UnknownRecord): Promise<R> {
  try {
    return await invoke<R>(command, args);
  } catch (err) {
    throw normalizeError(err);
  }
}

function normalizeAppConfig(cfg: T.AppConfig): T.AppConfig {
  const raw = cfg as unknown as UnknownRecord;
  const themeRaw = String(raw.theme ?? "dark").toLowerCase();
  const languageRaw = String(raw.language ?? "zh").toLowerCase();
  return {
    theme: themeRaw === "light" ? "light" : "dark",
    language: languageRaw.startsWith("en") ? "en" : "zh",
    log_tail_lines_default: Number(raw.log_tail_lines_default ?? 500),
    check_updates_on_startup:
      raw.check_updates_on_startup === undefined ? true : Boolean(raw.check_updates_on_startup),
    allow_multiple_instances: Boolean(raw.allow_multiple_instances ?? false),
  };
}

export const api = {
  // ── 集群 ──────────────────────────────────────────────────
  async listClusters() {
    return tauriInvoke<T.ClusterConfig[]>("list_clusters");
  },

  async importKubeconfig(yaml: string) {
    return tauriInvoke<{ ok?: boolean; added?: number }>("import_kubeconfig", { yaml });
  },

  async deleteCluster(clusterId: string) {
    return tauriInvoke<{ ok?: boolean }>("delete_cluster", { clusterId });
  },

  async reloadDefaultKubeconfig() {
    return tauriInvoke<{ ok?: boolean; added?: number }>("reload_default_kubeconfig");
  },

  async testConnection(clusterId: string) {
    return tauriInvoke<T.TestConnectionResult>("test_connection", { clusterId });
  },

  async getClusterSummary(clusterId: string) {
    return tauriInvoke<T.ClusterSummary>("get_cluster_summary", { clusterId });
  },

  async pingCluster(clusterId: string) {
    return tauriInvoke<T.ClusterSummary>("ping_cluster", { clusterId });
  },

  // ── 概览 ──────────────────────────────────────────────────
  async getOverview(clusterId: string) {
    return tauriInvoke<T.ClusterOverview>("get_overview", { clusterId });
  },

  // ── Node ──────────────────────────────────────────────────
  async listNodes(clusterId: string) {
    return tauriInvoke<T.NodeInfo[]>("list_nodes", { clusterId });
  },

  // ── Namespace ─────────────────────────────────────────────
  async listNamespaces(clusterId: string) {
    return tauriInvoke<T.NamespaceInfo[]>("list_namespaces", { clusterId });
  },

  // ── Pod ───────────────────────────────────────────────────
  async listPods(clusterId: string, namespace: string | null) {
    return tauriInvoke<T.PodInfo[]>("list_pods", { clusterId, namespace });
  },

  async getPodLogs(
    clusterId: string,
    namespace: string,
    pod: string,
    container: string | null,
    tailLines: number,
  ) {
    return tauriInvoke<string>("get_pod_logs", { clusterId, namespace, pod, container, tailLines });
  },

  async deletePod(clusterId: string, namespace: string, pod: string) {
    return tauriInvoke<{ ok?: boolean }>("delete_pod", { clusterId, namespace, pod });
  },

  // ── 工作负载 ──────────────────────────────────────────────
  async listDeployments(clusterId: string, namespace: string | null) {
    return tauriInvoke<T.DeploymentInfo[]>("list_deployments", { clusterId, namespace });
  },

  async scaleDeployment(clusterId: string, namespace: string, name: string, replicas: number) {
    return tauriInvoke<{ ok?: boolean }>("scale_deployment", { clusterId, namespace, name, replicas });
  },

  async restartDeployment(clusterId: string, namespace: string, name: string) {
    return tauriInvoke<{ ok?: boolean }>("restart_deployment", { clusterId, namespace, name });
  },

  async listServices(clusterId: string, namespace: string | null) {
    return tauriInvoke<T.ServiceInfo[]>("list_services", { clusterId, namespace });
  },

  async listConfigmaps(clusterId: string, namespace: string | null) {
    return tauriInvoke<T.ConfigMapInfo[]>("list_configmaps", { clusterId, namespace });
  },

  // ── Event ─────────────────────────────────────────────────
  async listEvents(clusterId: string, namespace: string | null) {
    return tauriInvoke<T.EventInfo[]>("list_events", { clusterId, namespace });
  },

  // ── 设置 ──────────────────────────────────────────────────
  async getAppConfig() {
    const raw = await tauriInvoke<T.AppConfig>("get_app_config");
    return normalizeAppConfig(raw);
  },

  async saveAppConfig(config: T.AppConfig) {
    const r = await tauriInvoke<{ ok?: boolean }>("save_app_config", { config });
    return { ok: r.ok ?? true };
  },
};
