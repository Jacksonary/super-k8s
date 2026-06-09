import dayjs from "dayjs";

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "-";
  return n.toLocaleString();
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return "-";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

export function uuidv4(): string {
  return crypto.randomUUID();
}

export function formatTimestamp(ms: number | null | undefined): string {
  if (ms == null) return "-";
  return dayjs(ms).format("YYYY-MM-DD HH:mm:ss");
}

/**
 * Render a Kubernetes-style relative age from an epoch-ms timestamp.
 * Mirrors `kubectl` output: the largest one or two units (e.g. "5d3h", "12m", "8s").
 * A non-positive / missing timestamp renders as "-".
 */
export function formatAge(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return "-";
  let secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 0) secs = 0;
  if (secs < 60) return `${secs}s`;

  const mins = Math.floor(secs / 60);
  if (mins < 60) {
    const s = secs % 60;
    return s > 0 && mins < 10 ? `${mins}m${s}s` : `${mins}m`;
  }

  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const m = mins % 60;
    return m > 0 ? `${hours}h${m}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  if (days < 365) {
    const h = hours % 24;
    return h > 0 && days < 10 ? `${days}d${h}h` : `${days}d`;
  }

  const years = Math.floor(days / 365);
  const d = days % 365;
  return d > 0 ? `${years}y${d}d` : `${years}y`;
}

export function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}
