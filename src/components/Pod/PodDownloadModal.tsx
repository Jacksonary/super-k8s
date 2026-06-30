import { useState, useRef, useEffect } from "react";
import { App, Button, Input, Modal, Progress, Typography, theme, Spin, List } from "antd";
import {
  FolderOpenOutlined,
  DownloadOutlined,
  FolderOutlined,
  FileOutlined,
  ArrowLeftOutlined,
  LoadingOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { Channel } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { api } from "../../api";
import type { FileDownloadEvent, FileEntry } from "../../types";

const { Text } = Typography;

interface Props {
  clusterId: string;
  namespace: string;
  pod: string;
  container: string | null;
  cwd: string;
  open: boolean;
  onCancel: () => void;
}

export default function PodDownloadModal({
  clusterId,
  namespace,
  pod,
  container,
  cwd,
  open,
  onCancel,
}: Props) {
  const { message: msg } = App.useApp();
  const { token } = theme.useToken();

  const [podPath, setPodPath] = useState(cwd);
  const [savePath, setSavePath] = useState<string>("");

  // Reset savePath when podPath changes (user typed or selected from browser)
  const handleSetPodPath = (path: string) => {
    setPodPath(path);
    // Update save path to match the new file name
    if (path) {
      const fileName = path.split("/").pop() || "download";
      setSavePath(prev => {
        const dir = prev ? prev.substring(0, prev.lastIndexOf("/")) : "";
        return dir ? `${dir}/${fileName}` : fileName;
      });
    }
  };

  // Download state (NOT modal-lifecycle-coupled)
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const fileSizeRef = useRef<number>(0);

  const sessionRef = useRef<string | null>(null);

  // File browser state
  const [browserOpen, setBrowserOpen] = useState(false);
  const [browserPath, setBrowserPath] = useState(cwd || "/");
  const [browserEntries, setBrowserEntries] = useState<FileEntry[]>([]);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setPodPath(cwd || "/");
      // Reset savePath so it updates when podPath changes
      setSavePath("");
    }
  }, [open, cwd]);

  useEffect(() => {
    if (browserOpen) {
      setSelectedFileName(null);
      // If podPath is a file (not a directory), navigate to its parent and select it
      if (podPath && !podPath.endsWith("/")) {
        const parentDir = podPath.substring(0, podPath.lastIndexOf("/")) || "/";
        const fileName = podPath.split("/").pop() || "";
        setSelectedFileName(fileName);
        setBrowserPath(parentDir);
        void loadDirectory(parentDir);
      } else {
        setBrowserPath(podPath || "/");
        void loadDirectory(podPath || "/");
      }
    }
  }, [browserOpen, podPath]);

  // Scroll to selected file after entries load
  useEffect(() => {
    if (selectedFileName && browserEntries.length > 0 && listRef.current) {
      const el = listRef.current.querySelector(`[data-filename="${selectedFileName}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [browserEntries, selectedFileName]);

  const loadDirectory = async (path: string) => {
    setBrowserLoading(true);
    setBrowserError(null);
    try {
      const entries = await api.listPodFiles(clusterId, namespace, pod, container, path);
      entries.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setBrowserEntries(entries);
    } catch (e) {
      setBrowserError((e as Error).message);
      setBrowserEntries([]);
    } finally {
      setBrowserLoading(false);
    }
  };

  const handleEntryClick = (entry: FileEntry) => {
    if (entry.isDir) {
      const newPath = browserPath === "/" ? `/${entry.name}` : `${browserPath}/${entry.name}`;
      setBrowserPath(newPath);
      void loadDirectory(newPath);
    } else {
      const fullPath = browserPath === "/" ? `/${entry.name}` : `${browserPath}/${entry.name}`;
      handleSetPodPath(fullPath);
      setBrowserOpen(false);
    }
  };

  const handleGoUp = () => {
    if (browserPath === "/") return;
    const parent = browserPath.substring(0, browserPath.lastIndexOf("/")) || "/";
    setBrowserPath(parent);
    void loadDirectory(parent);
  };

  const handlePickSavePath = async () => {
    try {
      const saved = await save({
        title: "Save File",
        defaultPath: podPath.split("/").pop() || "download",
      });
      if (saved) setSavePath(saved);
    } catch {
      // dialog cancelled
    }
  };

  const handleDownload = async () => {
    if (!podPath.trim()) {
      msg.error("Pod path is required");
      return;
    }
    if (!savePath) {
      msg.error("Save location is required");
      return;
    }

    setDownloading(true);
    setProgress(0);
    setTotalBytes(0);
    fileSizeRef.current = 0;

    const sessionId = crypto.randomUUID();
    sessionRef.current = sessionId;

    const ch = new Channel<FileDownloadEvent>();
    ch.onmessage = (ev) => {
      if (sessionRef.current !== sessionId) return;

      if (ev.kind === "fileSize") {
        fileSizeRef.current = ev.total;
      } else if (ev.kind === "progress") {
        setTotalBytes(ev.totalBytes);
        const fileSize = fileSizeRef.current;
        if (fileSize > 0) {
          setProgress(Math.min(Math.round(ev.totalBytes / fileSize * 100), 99));
        }
      } else if (ev.kind === "complete") {
        sessionRef.current = null;
        msg.success(`${podPath.split("/").pop()} downloaded (${formatBytes(ev.totalBytes)})`);
        setDownloading(false);
        onCancel();
      } else if (ev.kind === "error") {
        msg.error(`Download error: ${ev.message}`);
        setDownloading(false);
        sessionRef.current = null;
      }
    };

    try {
      const isDirectory = podPath.endsWith("/");

      await api.fileDownloadStart({
        clusterId,
        namespace,
        pod,
        container,
        sourcePath: podPath,
        isDirectory,
        savePath,
        sessionId,
        channel: ch,
      });
    } catch (e) {
      msg.error(`Failed to start download: ${(e as Error).message}`);
      setDownloading(false);
      sessionRef.current = null;
    }
  };

  const handleCancelDownload = async () => {
    const sid = sessionRef.current;
    if (sid) {
      await api.fileDownloadStop(sid);
      sessionRef.current = null;
    }
    setDownloading(false);
    setProgress(0);
  };

  if (!open) return null;

  // When downloading, show a floating progress indicator (modal stays open)
  if (downloading) {
    return (
      <Modal
        title="Download File from Pod"
        open={open}
        onCancel={onCancel}
        footer={[
          <Button key="cancel" onClick={onCancel}>
            Close
          </Button>,
        ]}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 0" }}>
          <div style={{
            background: token.colorFillAlter,
            borderRadius: token.borderRadius,
            padding: 16,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <Text strong style={{ fontSize: 13 }}>Downloading...</Text>
              <Button
                type="text"
                danger
                size="small"
                onClick={handleCancelDownload}
              >
                Cancel
              </Button>
            </div>
            <Progress
              percent={Math.round(progress)}
              strokeColor={token.colorPrimary}
              trailColor={token.colorFillTertiary}
              format={(percent) => `${percent}% · ${formatBytes(totalBytes)}`}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {podPath ? podPath.split("/").pop() : ""}
            </Text>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <>
      <Modal
        title="Download File from Pod"
        open={open}
        onCancel={onCancel}
        footer={[
          <Button key="cancel" onClick={onCancel}>
            Cancel
          </Button>,
          <Button
            key="download"
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleDownload}
          >
            Download
          </Button>,
        ]}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8 }}>
          <div>
            <Text strong style={{ display: "block", marginBottom: 4 }}>
              Pod Path
            </Text>
            <Input
              value={podPath}
              onChange={(e) => handleSetPodPath(e.target.value)}
              placeholder="/path/to/file"
              addonAfter={
                <FolderOpenOutlined
                  style={{ cursor: "pointer", color: token.colorPrimary }}
                  onClick={() => setBrowserOpen(true)}
                  title="Browse files in pod"
                />
              }
            />
            <Text type="secondary" style={{ fontSize: 11, marginTop: 2, display: "block" }}>
              Enter the full path of the file or directory inside the container
            </Text>
          </div>

          <div>
            <Text strong style={{ display: "block", marginBottom: 4 }}>
              Save to
            </Text>
            <Input
              value={savePath}
              onChange={(e) => setSavePath(e.target.value)}
              placeholder="/home/user/Downloads/filename"
              addonAfter={
                <FolderOpenOutlined
                  style={{ cursor: "pointer", color: token.colorPrimary }}
                  onClick={handlePickSavePath}
                />
              }
            />
          </div>
        </div>
      </Modal>

      {/* File browser modal */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {browserPath !== "/" && (
              <Button
                type="text"
                size="small"
                icon={<ArrowLeftOutlined />}
                onClick={handleGoUp}
                style={{ padding: "0 4px" }}
              />
            )}
            <Text strong>Browse: {browserPath}</Text>
          </div>
        }
        open={browserOpen}
        onCancel={() => setBrowserOpen(false)}
        footer={null}
        width={480}
      >
        <div style={{ maxHeight: 400, overflow: "auto" }}>
          {browserLoading && (
            <div style={{ textAlign: "center", padding: 24 }}>
              <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
            </div>
          )}
          {browserError && (
            <Text type="danger" style={{ display: "block", textAlign: "center", padding: 16 }}>
              {browserError}
            </Text>
          )}
          {!browserLoading && !browserError && browserEntries.length === 0 && (
            <Text type="secondary" style={{ display: "block", textAlign: "center", padding: 16 }}>
              Directory is empty
            </Text>
          )}
          <div ref={listRef}>
            <List
              dataSource={browserEntries}
              renderItem={(entry) => {
                const isSelected = selectedFileName === entry.name;
                return (
                  <List.Item
                    data-filename={entry.name}
                    style={{
                      cursor: "pointer",
                      padding: "6px 12px",
                      background: isSelected
                        ? token.controlItemBgActive
                        : entry.isDir
                          ? token.colorFillAlter
                          : "transparent",
                    }}
                    onClick={() => handleEntryClick(entry)}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        (e.currentTarget as HTMLElement).style.background = token.colorFillTertiary;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        (e.currentTarget as HTMLElement).style.background = entry.isDir ? token.colorFillAlter : "transparent";
                      }
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
                      {entry.isDir ? (
                        <>
                          <RightOutlined style={{ color: token.colorTextQuaternary, fontSize: 10 }} />
                          <FolderOutlined style={{ color: token.colorWarning, fontSize: 16 }} />
                          <Text strong style={{ flex: 1 }}>{entry.name}</Text>
                        </>
                      ) : (
                        <>
                          <span style={{ width: 12 }} />
                          <FileOutlined style={{ color: token.colorTextSecondary, fontSize: 14 }} />
                          <Text style={{ flex: 1, ...(isSelected ? { color: token.colorPrimary } : {}) }}>{entry.name}</Text>
                        </>
                      )}
                    </div>
                  </List.Item>
                );
              }}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes == null || isNaN(bytes) || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
