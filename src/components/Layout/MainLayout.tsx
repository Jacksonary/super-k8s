import { useEffect, useMemo, useRef, useState } from "react";
import logoUrl from "../../assets/logo.png";
import { Alert, Button, Layout, Menu, Modal, Progress, Select, Tooltip, Typography, message as antMessage } from "antd";
import {
  CloudServerOutlined,
  PartitionOutlined,
  AppstoreOutlined,
  DeploymentUnitOutlined,
  ApiOutlined,
  FileTextOutlined,
  BellOutlined,
  ClusterOutlined,
  GithubOutlined,
  ReloadOutlined,
  SettingOutlined,
  PlusOutlined,
  FieldTimeOutlined,
  LockOutlined,
  GlobalOutlined,
  DatabaseOutlined,
  ShareAltOutlined,
  ApartmentOutlined,
  RocketOutlined,
  ContainerOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useUpdateCheck } from "../../useUpdateCheck";
import { useSettings } from "../../store/settingsStore";
import { theme } from "antd";
import { Routes, Route, useLocation, useNavigate, Navigate } from "react-router-dom";
import { useClusterStore } from "../../store/clusterStore";
import Nodes from "../../pages/Nodes";
import Namespaces from "../../pages/Namespaces";
import Pods from "../../pages/Pods";
import Deployments from "../../pages/Deployments";
import Services from "../../pages/Services";
import ConfigMaps from "../../pages/ConfigMaps";
import Secrets from "../../pages/Secrets";
import CronJobs from "../../pages/CronJobs";
import Jobs from "../../pages/Jobs";
import Ingresses from "../../pages/Ingresses";
import Events from "../../pages/Events";
import Cluster from "../../pages/Cluster";
import ClusterDetail from "../../pages/ClusterDetail";
import Settings from "../../pages/Settings";

const { Sider, Content, Header } = Layout;
const { Text } = Typography;

const NAV_ITEMS = [
  {
    key: "group-cluster",
    label: "Cluster",
    icon: <ApartmentOutlined />,
    children: [
      { key: "/cluster", label: "Clusters", icon: <ClusterOutlined /> },
      { key: "/namespaces", label: "Namespaces", icon: <PartitionOutlined /> },
      { key: "/nodes", label: "Nodes", icon: <CloudServerOutlined /> },
      { key: "/events", label: "Events", icon: <BellOutlined /> },
    ],
  },
  {
    key: "group-workloads",
    label: "Workloads",
    icon: <RocketOutlined />,
    children: [
      { key: "/deployments", label: "Deployments", icon: <DeploymentUnitOutlined /> },
      { key: "/cronjobs", label: "CronJobs", icon: <FieldTimeOutlined /> },
      { key: "/pods", label: "Pods", icon: <ContainerOutlined /> },
      { key: "/jobs", label: "Jobs", icon: <ThunderboltOutlined /> },
    ],
  },
  {
    key: "group-network",
    label: "Network",
    icon: <ShareAltOutlined />,
    children: [
      { key: "/services", label: "Services", icon: <ApiOutlined /> },
      { key: "/ingresses", label: "Ingress", icon: <GlobalOutlined /> },
    ],
  },
  {
    key: "group-config",
    label: "Config",
    icon: <DatabaseOutlined />,
    children: [
      { key: "/configmaps", label: "ConfigMaps", icon: <FileTextOutlined /> },
      { key: "/secrets", label: "Secrets", icon: <LockOutlined /> },
    ],
  },
  { key: "/settings", label: "Settings", icon: <SettingOutlined /> },
];

// Flatten NAV_ITEMS to leaf items only (no groups)
const NAV_LEAF_ITEMS: { key: string; label: string }[] = NAV_ITEMS.flatMap((item) =>
  "children" in item && item.children ? item.children : [item],
);

const SIDEBAR_WIDTH = 240;
// Set when the user clicks "Later" on a downloaded update; on next launch the app
// silently re-downloads and installs before showing the UI.
const PENDING_UPDATE_KEY = "super-k8s:install-update-on-launch";

const GITHUB_URL = "https://github.com/Jacksonary/super-k8s";
const GITEE_URL = "https://gitee.com/weiguoliu/super-k8s";

function GiteeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
      <path d="M11.984 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.016 0zm6.09 5.333c.328 0 .593.26.593.593v1.482a.594.594 0 0 1-.593.592H9.777c-.982 0-1.778.796-1.778 1.778v5.63c0 .327.26.593.593.593h5.63c.982 0 1.778-.796 1.778-1.778v-.296a.593.593 0 0 0-.592-.593h-4.15a.592.592 0 0 1-.592-.592v-1.482a.593.593 0 0 1 .593-.592h6.815c.327 0 .593.265.593.592v3.408a4 4 0 0 1-4 4H5.926a.593.593 0 0 1-.593-.593V9.778a4.444 4.444 0 0 1 4.445-4.444h8.296Z" />
    </svg>
  );
}

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    clusters,
    currentClusterId,
    setCurrentClusterId,
    currentSummary,
    connecting,
    refreshCurrentSummary,
    requestAddCluster,
    namespaces,
    currentNamespace,
    setCurrentNamespace,
  } = useClusterStore();
  const { token } = theme.useToken();
  const { config: appConfig } = useSettings();
  const isDark = appConfig.theme !== "light";
  const { state: updateState, setState: setUpdateState, fallback, checking, recheck } = useUpdateCheck(__APP_VERSION__, appConfig.check_updates_on_startup);

  const readyVersionRef = useRef<string>("");
  const pendingUpdateRef = useRef<Update | null>(null);
  const downloadingRef = useRef(false);
  const modalOpenRef = useRef(false);


  function showRestartModal(version: string) {
    if (modalOpenRef.current) return;
    modalOpenRef.current = true;
    Modal.confirm({
      title: "Update ready",
      content: version
        ? `Version ${version} has been downloaded. Restart now to apply the update, or continue working and restart later.`
        : `An update has been downloaded. Restart now to apply it, or continue working and restart later.`,
      okText: "Restart now",
      cancelText: "Later",
      onOk: async () => {
        modalOpenRef.current = false;
        if (pendingUpdateRef.current) {
          try {
            await pendingUpdateRef.current.install();
          } catch (e) {
            void antMessage.error(`Install failed: ${String(e)}`);
            return;
          }
        }
        try { localStorage.removeItem(PENDING_UPDATE_KEY); } catch { /* ignore */ }
        void relaunch();
      },
      onCancel: () => {
        modalOpenRef.current = false;
        // Defer the install to next launch instead of discarding the download.
        try { localStorage.setItem(PENDING_UPDATE_KEY, "1"); } catch { /* ignore */ }
      },
    });
  }

  const handleUpdate = async () => {
    if (updateState.status !== "available" || downloadingRef.current) return;
    downloadingRef.current = true;
    const upd = updateState.update;
    const version = updateState.version;
    pendingUpdateRef.current = upd;
    let total = 0;
    let downloaded = 0;
    setUpdateState({ status: "downloading", progress: 0 });
    try {
      await upd.download((evt) => {
        if (evt.event === "Started" && evt.data.contentLength) {
          total = evt.data.contentLength;
        } else if (evt.event === "Progress") {
          downloaded += evt.data.chunkLength;
          if (total > 0) setUpdateState({ status: "downloading", progress: Math.round((downloaded / total) * 100) });
        }
      });
      readyVersionRef.current = version;
      setUpdateState({ status: "ready" });
      showRestartModal(version);
    } catch (e) {
      setUpdateState({ status: "error", message: String(e) });
    } finally {
      downloadingRef.current = false;
    }
  };

  // On launch, if the user previously chose "Later", finish the deferred install
  // now (silently) before they start working. The in-memory Update handle does not
  // survive a restart, so we re-check to obtain a fresh one, then download+install.
  const launchInstallRan = useRef(false);
  useEffect(() => {
    if (launchInstallRan.current) return;
    launchInstallRan.current = true;
    let pending = false;
    try { pending = localStorage.getItem(PENDING_UPDATE_KEY) === "1"; } catch { /* ignore */ }
    if (!pending) return;

    void (async () => {
      try {
        const upd = await check();
        if (!upd) {
          // Already up to date (e.g. installed elsewhere) — clear and move on.
          try { localStorage.removeItem(PENDING_UPDATE_KEY); } catch { /* ignore */ }
          return;
        }
        setUpdateState({ status: "downloading", progress: 0 });
        let total = 0;
        let downloaded = 0;
        await upd.download((evt) => {
          if (evt.event === "Started" && evt.data.contentLength) {
            total = evt.data.contentLength;
          } else if (evt.event === "Progress") {
            downloaded += evt.data.chunkLength;
            if (total > 0) setUpdateState({ status: "downloading", progress: Math.round((downloaded / total) * 100) });
          }
        });
        await upd.install();
        try { localStorage.removeItem(PENDING_UPDATE_KEY); } catch { /* ignore */ }
        void relaunch();
      } catch (e) {
        // Don't trap the user in a failing upgrade loop — clear the flag and
        // fall back to the normal in-app update prompt.
        try { localStorage.removeItem(PENDING_UPDATE_KEY); } catch { /* ignore */ }
        setUpdateState({ status: "error", message: String(e) });
      }
    })();
  }, [setUpdateState]);

  const selectedKey = useMemo(() => {
    // Match the longest leaf nav prefix so /cluster/:id still highlights Cluster.
    const matches = NAV_LEAF_ITEMS.filter((item) => location.pathname.startsWith(item.key));
    matches.sort((a, b) => b.key.length - a.key.length);
    return matches[0]?.key ?? "/cluster";
  }, [location.pathname]);

  const [openKeys, setOpenKeys] = useState<string[]>([]);

  return (
    <Layout style={{ height: "100vh", overflow: "hidden" }}>
      <Sider
        width={SIDEBAR_WIDTH}
        style={{
          height: "100vh",
          overflow: "hidden",
          borderRight: `1px solid ${token.colorBorder}`,
          flexShrink: 0,
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 12px 0 16px",
            borderBottom: `1px solid ${token.colorBorder}`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
            <img
              src={logoUrl}
              alt="logo"
              style={{ width: 32, height: 32, flexShrink: 0, display: "block" }}
            />
            <Text strong style={{ color: token.colorPrimary, fontSize: 16, whiteSpace: "nowrap" }}>
                Super K8s
              </Text>
          </div>


        </div>

        {/* ── Cluster + Namespace selectors ── */}
          <div style={{ padding: 12, borderBottom: `1px solid ${token.colorBorder}`, flexShrink: 0 }}>
            <Select
              value={currentClusterId ?? undefined}
              onChange={(v) => { setCurrentClusterId(v); navigate(selectedKey); }}
              placeholder="Select a cluster"
              style={{ width: "100%" }}
              options={clusters.map((c) => ({ value: c.id, label: c.name }))}
              notFoundContent={
                <span style={{ color: token.colorTextTertiary }}>No clusters configured.</span>
              }
              dropdownRender={(menu) => (
                <>
                  {menu}
                  <div
                    style={{
                      borderTop: `1px solid ${token.colorBorderSecondary}`,
                      padding: "6px 8px",
                    }}
                  >
                    <Button
                      type="link"
                      size="small"
                      block
                      icon={<PlusOutlined />}
                      style={{ textAlign: "left", paddingLeft: 4 }}
                      onClick={() => {
                        navigate("/cluster");
                        requestAddCluster();
                      }}
                    >
                      Add / Import Cluster
                    </Button>
                  </div>
                </>
              )}
              labelRender={({ label }) => (
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    display: "block",
                  }}
                >
                  {label}
                </Text>
              )}
            />

            {/* Namespace filter — "" means All namespaces */}
            <Select
              value={currentNamespace}
              onChange={(v) => setCurrentNamespace(v)}
              style={{ width: "100%", marginTop: 8 }}
              showSearch
              optionFilterProp="label"
              options={[
                { value: "", label: "All namespaces" },
                ...namespaces.map((ns) => ({ value: ns, label: ns })),
              ]}
              labelRender={({ label }) => (
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    display: "block",
                  }}
                >
                  {label}
                </Text>
              )}
            />

            {/* Error and connecting states shown below the selectors, not inside them */}
            {!connecting && currentSummary?.status === "error" && currentSummary.error_message && (
              <Tooltip title={currentSummary.error_message}>
                <Text
                  style={{
                    display: "block",
                    marginTop: 4,
                    fontSize: 11,
                    color: "#ff4d4f",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {currentSummary.error_message}
                </Text>
              </Tooltip>
            )}
            {connecting && (
              <Text style={{ display: "block", marginTop: 4, fontSize: 11, color: "#faad14" }}>
                Connecting...
              </Text>
            )}
          </div>

        {/* ── Navigation ── */}
        <Menu
          mode="inline"
          theme={isDark ? "dark" : "light"}
          selectedKeys={[selectedKey]}
          openKeys={openKeys}
          onOpenChange={setOpenKeys}
          onClick={(e) => { if (!e.key.startsWith("group-")) navigate(e.key); }}
          style={{ borderRight: 0, flex: 1, overflow: "auto" }}
          items={NAV_ITEMS}
        />

        {/* ── Footer: version + links ── */}
        <div
          style={{
            padding: "8px 12px",
            borderTop: `1px solid ${token.colorBorder}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 4,
            flexShrink: 0,
            minWidth: 0,
          }}
        >
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              {updateState.status === "available" ? (
                <Tooltip title={`${updateState.version} available — click to update`}>
                  <a href="#" onClick={(e) => { e.preventDefault(); handleUpdate(); }} style={{ cursor: "pointer", textDecoration: "none" }}>
                    <Text style={{ fontSize: 11, color: token.colorWarningText }} ellipsis>
                      v{__APP_VERSION__} → {updateState.version}
                    </Text>
                  </a>
                </Tooltip>
              ) : updateState.status === "downloading" ? (
                <div>
                  <Text style={{ fontSize: 11, color: token.colorWarningText }}>
                    Downloading... {updateState.progress}%
                  </Text>
                  <Progress percent={updateState.progress} size="small" showInfo={false} strokeColor={token.colorWarning} />
                </div>
              ) : updateState.status === "ready" ? (
                <a href="#" onClick={(e) => { e.preventDefault(); showRestartModal(readyVersionRef.current); }} style={{ cursor: "pointer", textDecoration: "none" }}>
                  <Text style={{ fontSize: 11, color: token.colorSuccessText }}>
                    Update ready — restart
                  </Text>
                </a>
              ) : updateState.status === "error" ? (
                <Tooltip title={updateState.message}>
                  <a href="#" onClick={(e) => { e.preventDefault(); recheck(); }} style={{ cursor: "pointer", textDecoration: "none" }}>
                    <Text style={{ fontSize: 11, color: token.colorErrorText }}>Update failed — retry</Text>
                  </a>
                </Tooltip>
              ) : fallback ? (
                <Tooltip title={`v${fallback.latestVersion} available — click to open release`}>
                  <a href="#" onClick={(e) => { e.preventDefault(); openUrl(fallback.releaseUrl); }} style={{ cursor: "pointer", textDecoration: "none" }}>
                    <Text style={{ fontSize: 11, color: token.colorWarningText }} ellipsis>
                      v{__APP_VERSION__} → v{fallback.latestVersion}
                    </Text>
                  </a>
                </Tooltip>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Text style={{ fontSize: 11, color: token.colorTextQuaternary }}>
                    v{__APP_VERSION__}
                  </Text>
                  <Tooltip title="Check for updates">
                    <ReloadOutlined
                      spin={checking}
                      style={{ fontSize: 11, color: token.colorTextQuaternary, cursor: "pointer" }}
                      onClick={async () => {
                        if (checking) return;
                        const result = await recheck();
                        if (result === "up-to-date") antMessage.info("Already up to date");
                        else if (result === "error") antMessage.error("Failed to check for updates");
                      }}
                    />
                  </Tooltip>
                </div>
              )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <Tooltip title="GitHub">
              <a
                href={GITHUB_URL}
                onClick={(e) => { e.preventDefault(); openUrl(GITHUB_URL); }}
                style={{ color: token.colorTextQuaternary, cursor: "pointer", display: "flex" }}
                aria-label="GitHub repository"
              >
                <GithubOutlined style={{ fontSize: 14 }} />
              </a>
            </Tooltip>
            <Tooltip title="Gitee">
              <a
                href={GITEE_URL}
                onClick={(e) => { e.preventDefault(); openUrl(GITEE_URL); }}
                style={{ color: token.colorTextQuaternary, cursor: "pointer", display: "flex", fontSize: 14 }}
                aria-label="Gitee repository"
              >
                <GiteeIcon />
              </a>
            </Tooltip>
          </div>
        </div>
      </Sider>

      <Layout style={{ overflow: "hidden" }}>
        <Header
          style={{
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorder}`,
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            height: 48,
            flexShrink: 0,
          }}
        >
          <Text strong style={{ fontSize: 14 }}>
            {NAV_LEAF_ITEMS.find((i) => i.key === selectedKey)?.label}
          </Text>
        </Header>
        {currentSummary?.status === "error" && !connecting && (
          <Alert
            banner
            type="error"
            showIcon
            message={currentSummary.error_message ?? "Cannot connect to cluster"}
            action={
              <Button size="small" type="link" onClick={() => void refreshCurrentSummary()}>
                Reconnect
              </Button>
            }
          />
        )}
        <Content style={{ padding: 24, background: token.colorBgLayout, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
          <Routes>
            <Route index element={<Navigate to="/cluster" replace />} />
            <Route path="/nodes" element={<Nodes />} />
            <Route path="/namespaces" element={<Namespaces />} />
            <Route path="/pods" element={<Pods />} />
            <Route path="/deployments" element={<Deployments />} />
            <Route path="/services" element={<Services />} />
            <Route path="/configmaps" element={<ConfigMaps />} />
            <Route path="/secrets" element={<Secrets />} />
            <Route path="/cronjobs" element={<CronJobs />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/ingresses" element={<Ingresses />} />
            <Route path="/events" element={<Events />} />
            <Route path="/cluster" element={<Cluster />} />
            <Route path="/cluster/:id" element={<ClusterDetail />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/cluster" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
