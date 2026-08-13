import { useCallback } from "react";
import type { ClusterConfig } from "../types";
import { api } from "../api";

export function useClusterOrder() {
  const saveOrder = useCallback(async (ids: string[]) => {
    await api.reorderClusters(ids);
  }, []);

  return { saveOrder };
}
