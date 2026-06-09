import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { api } from "../api";
import type { ClusterConfig, ClusterSummary } from "../types";

interface ClusterStoreValue {
  clusters: ClusterConfig[];
  loadingClusters: boolean;
  refreshClusters: () => Promise<void>;
  currentClusterId: string | null;
  setCurrentClusterId: (id: string | null) => void;
  currentCluster: ClusterConfig | null;
  currentSummary: ClusterSummary | null;
  refreshCurrentSummary: () => Promise<void>;
  connecting: boolean;
  namespaces: string[];
  currentNamespace: string;
  setCurrentNamespace: (ns: string) => void;
  refreshNamespaces: () => Promise<void>;
  /** Counter that bumps when external callers want to open the Add Cluster modal on the Cluster page. */
  addClusterRequestId: number;
  requestAddCluster: () => void;
}

const ClusterStoreContext = createContext<ClusterStoreValue | null>(null);

const LS_KEY = "super-k8s:current-cluster-id";
const NS_KEY = "super-k8s:current-namespace";

export function ClusterStoreProvider({ children }: { children: React.ReactNode }) {
  const [clusters, setClusters] = useState<ClusterConfig[]>([]);
  const clustersRef = useRef<ClusterConfig[]>([]);
  const [loadingClusters, setLoadingClusters] = useState<boolean>(false);
  const [currentClusterId, setCurrentClusterIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LS_KEY);
    } catch {
      return null;
    }
  });
  const [currentSummary, setCurrentSummary] = useState<ClusterSummary | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [currentNamespace, setCurrentNamespaceState] = useState<string>(() => {
    try {
      return localStorage.getItem(NS_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [addClusterRequestId, setAddClusterRequestId] = useState(0);

  const requestAddCluster = useCallback(() => {
    setAddClusterRequestId((n) => n + 1);
  }, []);

  const setCurrentClusterId = useCallback((id: string | null) => {
    setCurrentClusterIdState(id);
    try {
      if (id) localStorage.setItem(LS_KEY, id);
      else localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const setCurrentNamespace = useCallback((ns: string) => {
    setCurrentNamespaceState(ns);
    try {
      if (ns) localStorage.setItem(NS_KEY, ns);
      else localStorage.removeItem(NS_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshClusters = useCallback(async () => {
    setLoadingClusters(true);
    try {
      const list = await api.listClusters();
      setClusters(list);
      clustersRef.current = list;
      // Auto-select first cluster if none selected or stored id is gone
      setCurrentClusterIdState((cur) => {
        if (cur && list.some((c) => c.id === cur)) return cur;
        const next = list[0]?.id ?? null;
        try {
          if (next) localStorage.setItem(LS_KEY, next);
          else localStorage.removeItem(LS_KEY);
        } catch { /* ignore */ }
        return next;
      });
    } finally {
      setLoadingClusters(false);
    }
  }, []);

  const refreshCurrentSummary = useCallback(async () => {
    if (!currentClusterId) {
      setCurrentSummary(null);
      setConnecting(false);
      return;
    }
    setCurrentSummary(null);
    setConnecting(true);
    try {
      const s = await api.getClusterSummary(currentClusterId);
      setCurrentSummary(s);
    } catch (e) {
      const c = clustersRef.current.find((c) => c.id === currentClusterId);
      setCurrentSummary({
        id: currentClusterId,
        name: c?.name ?? currentClusterId,
        server: c?.server ?? "",
        status: "error",
        server_version: null,
        node_count: null,
        namespace_count: null,
        error_message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setConnecting(false);
    }
  }, [currentClusterId]);

  const refreshNamespaces = useCallback(async () => {
    if (!currentClusterId) {
      setNamespaces([]);
      return;
    }
    try {
      const list = await api.listNamespaces(currentClusterId);
      const names = list.map((n) => n.name);
      setNamespaces(names);
      // If the selected namespace no longer exists, reset to All.
      setCurrentNamespaceState((cur) => {
        if (cur && !names.includes(cur)) {
          try { localStorage.removeItem(NS_KEY); } catch { /* ignore */ }
          return "";
        }
        return cur;
      });
    } catch {
      setNamespaces([]);
    }
  }, [currentClusterId]);

  useEffect(() => {
    void refreshClusters();
  }, [refreshClusters]);

  useEffect(() => {
    void refreshCurrentSummary();
  }, [refreshCurrentSummary]);

  useEffect(() => {
    void refreshNamespaces();
  }, [refreshNamespaces]);

  // Background heartbeat — lightweight ping, no connecting animation, preserves server_version
  useEffect(() => {
    if (!currentClusterId) return;
    const id = setInterval(async () => {
      try {
        const ping = await api.pingCluster(currentClusterId);
        setCurrentSummary((prev) => ({
          ...ping,
          // keep the server_version from the last full summary
          server_version: prev?.server_version ?? ping.server_version,
        }));
      } catch (e) {
        setCurrentSummary((prev) => prev ? {
          ...prev,
          status: "error",
          error_message: e instanceof Error ? e.message : String(e),
        } : null);
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [currentClusterId]);

  const currentCluster = useMemo(
    () => clusters.find((c) => c.id === currentClusterId) ?? null,
    [clusters, currentClusterId],
  );

  const value: ClusterStoreValue = {
    clusters,
    loadingClusters,
    refreshClusters,
    currentClusterId,
    setCurrentClusterId,
    currentCluster,
    currentSummary,
    refreshCurrentSummary,
    connecting,
    namespaces,
    currentNamespace,
    setCurrentNamespace,
    refreshNamespaces,
    addClusterRequestId,
    requestAddCluster,
  };

  return (
    <ClusterStoreContext.Provider value={value}>
      {children}
    </ClusterStoreContext.Provider>
  );
}

export function useClusterStore(): ClusterStoreValue {
  const ctx = useContext(ClusterStoreContext);
  if (!ctx) throw new Error("useClusterStore must be used inside ClusterStoreProvider");
  return ctx;
}
