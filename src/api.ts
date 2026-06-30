import { invoke } from "@tauri-apps/api/core";
import type { Channel } from "@tauri-apps/api/core";
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

  // ── Overview ──────────────────────────────────────────────────
  async getOverview(clusterId: string, namespace: string | null = null) {
    return tauriInvoke<T.ClusterOverview>("get_overview", { clusterId, namespace });
  },

  // ── Node ──────────────────────────────────────────────────
  async listNodes(clusterId: string) {
    return tauriInvoke<T.NodeInfo[]>("list_nodes", { clusterId });
  },

  // ── Namespace ─────────────────────────────────────────────
  async listNamespaces(clusterId: string) {
    return tauriInvoke<T.NamespaceInfo[]>("list_namespaces", { clusterId });
  },

  async setNamespaceOverride(clusterId: string, namespaces: string[]) {
    return tauriInvoke<{ ok?: boolean; count?: number }>("set_namespace_override", {
      clusterId,
      namespaces,
    });
  },

  async updateNamespaceMetadata(
    clusterId: string,
    name: string,
    labels: Record<string, string>,
    annotations: Record<string, string>,
  ) {
    return tauriInvoke<{ ok?: boolean }>("update_namespace_metadata", {
      clusterId,
      name,
      labels,
      annotations,
    });
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

  async execStart(args: {
    clusterId: string;
    namespace: string;
    pod: string;
    container: string | null;
    command: string[] | null;
    sessionId: string;
    channel: Channel<T.ExecEvent>;
  }) {
    return tauriInvoke<void>("exec_start", args as unknown as UnknownRecord);
  },

  async execWrite(sessionId: string, data: string) {
    return tauriInvoke<void>("exec_write", { sessionId, data });
  },

  async execResize(sessionId: string, cols: number, rows: number) {
    return tauriInvoke<void>("exec_resize", { sessionId, cols, rows });
  },

  async execStop(sessionId: string) {
    return tauriInvoke<void>("exec_stop", { sessionId });
  },

  async logStreamStart(args: {
    clusterId: string;
    namespace: string;
    pod: string;
    container: string | null;
    tailLines: number | null;
    follow: boolean;
    sessionId: string;
    channel: Channel<T.LogEvent>;
  }) {
    return tauriInvoke<void>("log_stream_start", args as unknown as UnknownRecord);
  },

  async logStreamStop(sessionId: string) {
    return tauriInvoke<void>("log_stream_stop", { sessionId });
  },

  async fileDownloadStart(args: {
    clusterId: string;
    namespace: string;
    pod: string;
    container: string | null;
    sourcePath: string;
    isDirectory: boolean;
    savePath: string;
    sessionId: string;
    channel: Channel<T.FileDownloadEvent>;
  }) {
    return tauriInvoke<void>("file_download_start", args as unknown as UnknownRecord);
  },

  async fileDownloadStop(sessionId: string) {
    return tauriInvoke<void>("file_download_stop", { sessionId });
  },

  async listPodFiles(
    clusterId: string,
    namespace: string,
    pod: string,
    container: string | null,
    path: string,
  ) {
    return tauriInvoke<T.FileEntry[]>("list_pod_files", { clusterId, namespace, pod, container, path });
  },

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

  async updateResourceMetadata(
    clusterId: string,
    apiVersion: string,
    kind: string,
    namespace: string | null,
    name: string,
    labels: Record<string, string>,
    annotations: Record<string, string>,
  ) {
    return tauriInvoke<void>("update_resource_metadata", {
      clusterId, apiVersion, kind, namespace, name, labels, annotations,
    });
  },

  async updateCronJobSpec(
    clusterId: string,
    namespace: string,
    name: string,
    schedule: string,
    suspend: boolean,
    concurrencyPolicy: string,
    successfulJobsHistoryLimit: number,
    failedJobsHistoryLimit: number,
  ) {
    return tauriInvoke<void>("update_cronjob_spec", {
      clusterId, namespace, name, schedule, suspend, concurrencyPolicy,
      successfulJobsHistoryLimit, failedJobsHistoryLimit,
    });
  },

  async updateCronJobMetadata(
    clusterId: string,
    namespace: string,
    name: string,
    labels: Record<string, string>,
    annotations: Record<string, string>,
  ) {
    return tauriInvoke<void>("update_cronjob_metadata", { clusterId, namespace, name, labels, annotations });
  },

  async updateSecretData(
    clusterId: string,
    namespace: string,
    name: string,
    data: Record<string, string>,
  ) {
    return tauriInvoke<void>("update_secret_data", { clusterId, namespace, name, data });
  },

  async updateConfigMapData(
    clusterId: string,
    namespace: string,
    name: string,
    data: Record<string, string>,
  ) {
    return tauriInvoke<void>("update_configmap_data", { clusterId, namespace, name, data });
  },

  async listSecrets(clusterId: string, namespace: string | null) {
    return tauriInvoke<T.SecretInfo[]>("list_secrets", { clusterId, namespace });
  },

  async getSecretValues(clusterId: string, namespace: string, name: string) {
    return tauriInvoke<Record<string, string>>("get_secret_values", { clusterId, namespace, name });
  },

  async listCronJobs(clusterId: string, namespace: string | null) {
    return tauriInvoke<T.CronJobInfo[]>("list_cronjobs", { clusterId, namespace });
  },

  async listJobs(clusterId: string, namespace: string | null) {
    return tauriInvoke<T.JobInfo[]>("list_jobs", { clusterId, namespace });
  },

  async listIngresses(clusterId: string, namespace: string | null) {
    return tauriInvoke<T.IngressInfo[]>("list_ingresses", { clusterId, namespace });
  },

  async updateIngressRules(
    clusterId: string,
    namespace: string,
    name: string,
    rules: unknown,
  ) {
    return tauriInvoke<void>("update_ingress_rules", { clusterId, namespace, name, rules });
  },

  async updateIngressMetadata(
    clusterId: string,
    namespace: string,
    name: string,
    labels: Record<string, string>,
    annotations: Record<string, string>,
  ) {
    return tauriInvoke<void>("update_ingress_metadata", { clusterId, namespace, name, labels, annotations });
  },

  async updateDeploymentLabels(
    clusterId: string,
    namespace: string,
    name: string,
    labels: Record<string, string>,
  ) {
    return tauriInvoke<void>("update_deployment_labels", { clusterId, namespace, name, labels });
  },

  async updateDeploymentImage(
    clusterId: string,
    namespace: string,
    name: string,
    containerName: string,
    image: string,
  ) {
    return tauriInvoke<void>("update_deployment_image", { clusterId, namespace, name, containerName, image });
  },

  async updateDeploymentStrategy(
    clusterId: string,
    namespace: string,
    name: string,
    strategyType: string,
    maxSurge: string | null,
    maxUnavailable: string | null,
  ) {
    return tauriInvoke<void>("update_deployment_strategy", {
      clusterId,
      namespace,
      name,
      strategyType,
      maxSurge,
      maxUnavailable,
    });
  },

  // ── Event ─────────────────────────────────────────────────
  async listEvents(clusterId: string, namespace: string | null) {
    return tauriInvoke<T.EventInfo[]>("list_events", { clusterId, namespace });
  },

  async getResourceYaml(
    clusterId: string,
    apiVersion: string,
    kind: string,
    namespace: string | null,
    name: string,
  ) {
    return tauriInvoke<string>("get_resource_yaml", {
      clusterId,
      apiVersion,
      kind,
      namespace,
      name,
    });
  },

  async applyResourceYaml(clusterId: string, yaml: string) {
    return tauriInvoke<{ ok?: boolean; name?: string }>("apply_resource_yaml", {
      clusterId,
      yaml,
    });
  },

  async getResourceJson(
    clusterId: string,
    apiVersion: string,
    kind: string,
    namespace: string | null,
    name: string,
  ) {
    return tauriInvoke<Record<string, unknown>>("get_resource_json", {
      clusterId,
      apiVersion,
      kind,
      namespace,
      name,
    });
  },

  async deleteResource(
    clusterId: string,
    apiVersion: string,
    kind: string,
    namespace: string | null,
    name: string,
  ) {
    return tauriInvoke<{ ok?: boolean }>("delete_resource", {
      clusterId,
      apiVersion,
      kind,
      namespace,
      name,
    });
  },

  async cordonNode(clusterId: string, name: string, on: boolean) {
    return tauriInvoke<{ ok?: boolean }>("cordon_node", { clusterId, name, on });
  },

  async listNodePods(clusterId: string, nodeName: string, namespace: string | null = null) {
    return tauriInvoke<T.PodInfo[]>("list_node_pods", { clusterId, nodeName, namespace });
  },

  async listDeploymentPods(clusterId: string, namespace: string, name: string) {
    return tauriInvoke<T.PodInfo[]>("list_deployment_pods", { clusterId, namespace, name });
  },

  async listServiceEndpoints(clusterId: string, namespace: string, name: string) {
    return tauriInvoke<T.EndpointInfo[]>("list_service_endpoints", { clusterId, namespace, name });
  },

  async getAppConfig() {
    const raw = await tauriInvoke<T.AppConfig>("get_app_config");
    return normalizeAppConfig(raw);
  },

  async saveAppConfig(config: T.AppConfig) {
    const r = await tauriInvoke<{ ok?: boolean }>("save_app_config", { config });
    return { ok: r.ok ?? true };
  },

  checkUpdate(): Promise<{ latestVersion: string; releaseUrl: string }> {
    return tauriInvoke("check_update");
  },
};
