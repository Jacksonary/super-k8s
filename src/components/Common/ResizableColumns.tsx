import { useCallback, useMemo, useState } from "react";
import type { ColumnsType, ColumnType } from "antd/es/table";

type AnyColumn<T> = ColumnType<T> & { key?: React.Key };

const MIN_COL_WIDTH = 60;

interface CellProps {
  width?: number;
  onResize?: (nextWidth: number) => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  [key: string]: unknown;
}

/**
 * A table header cell with a native drag-to-resize handle.
 *
 * We deliberately do NOT use `react-resizable` here: its handle/ref + cloneElement
 * plumbing did not reliably attach drag listeners inside antd's
 * `components.header.cell` under React 18. This hand-rolled version owns the whole
 * interaction (mousedown on the handle → document mousemove/mouseup), so there is
 * no third-party ref indirection that can silently fail.
 */
export function ResizableHeaderCell(props: CellProps) {
  const { width, onResize, children, style, ...rest } = props;

  // Columns without a tracked numeric width render as a plain (flexible) cell.
  if (typeof width !== "number" || !onResize) {
    return (
      <th {...rest} style={style}>
        {children}
      </th>
    );
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    // Don't let the press bubble to the <th> (would trigger column sort).
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = width;

    const onMove = (ev: MouseEvent) => {
      const next = Math.max(MIN_COL_WIDTH, startWidth + (ev.clientX - startX));
      onResize(next);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <th {...rest} style={{ ...style, position: "relative" }}>
      {children}
      <span
        className="sk-col-resizer"
        onMouseDown={handleMouseDown}
        onClick={(e) => e.stopPropagation()}
      />
    </th>
  );
}

function lsKey(page: string): string {
  return `super-k8s:colw:${page}`;
}

function loadWidths(page: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(lsKey(page));
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/**
 * Make an antd Table's fixed-width columns drag-resizable, persisting per-column
 * widths to localStorage under the given page key.
 *
 * Only columns that already declare a numeric `width` get a handle; columns with
 * no width (e.g. Name / Message) stay flexible and absorb remaining space, so the
 * table always fills its container — no horizontal scrollbar needed.
 */
export function useResizableColumns<T>(
  page: string,
  columns: ColumnsType<T>,
): { columns: ColumnsType<T>; components: NonNullable<import("antd").TableProps<T>["components"]> } {
  const [widths, setWidths] = useState<Record<string, number>>(() => loadWidths(page));

  const colKey = useCallback((col: AnyColumn<T>, index: number): string => {
    return String(col.key ?? (col as { dataIndex?: React.Key }).dataIndex ?? index);
  }, []);

  const setWidth = useCallback(
    (key: string, nextWidth: number) => {
      setWidths((prev) => {
        const next = { ...prev, [key]: nextWidth };
        try {
          localStorage.setItem(lsKey(page), JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [page],
  );

  const wrapped = useMemo<ColumnsType<T>>(() => {
    return (columns as AnyColumn<T>[]).map((col, index) => {
      const key = colKey(col, index);
      const isActions = col.key === "actions";
      const declared = typeof col.width === "number" ? col.width : undefined;
      if (isActions || declared === undefined) {
        return col;
      }
      const width = widths[key] ?? declared;
      return {
        ...col,
        width,
        onHeaderCell: () =>
          ({
            width,
            onResize: (nextWidth: number) => setWidth(key, nextWidth),
          }) as React.HTMLAttributes<HTMLElement>,
      } as AnyColumn<T>;
    });
  }, [columns, widths, colKey, setWidth]);

  return {
    columns: wrapped,
    components: { header: { cell: ResizableHeaderCell as never } },
  };
}
