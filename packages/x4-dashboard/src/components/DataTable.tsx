import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

export interface ColumnDef<T> {
  key: string;
  label: React.ReactNode;
  sortKey?: string;
  groupId?: string;
  align?: "left" | "right";
  alwaysVisible?: boolean;
  render: (row: T) => React.ReactNode;
  className?: string;
}

export interface ColumnGroup {
  id: string;
  label: string;
  accentColor?: string;   // text-* class for group label text
  accentBgColor?: string; // bg-* class for the accent underline bar
}

export interface RowGroup<T> {
  key: string;
  label: React.ReactNode;
  rows: T[];
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  columnGroups?: ColumnGroup[];
  rows?: T[];
  rowGroups?: RowGroup<T>[];
  getRowKey: (row: T) => string;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSortChange?: (key: string) => void;
  visibleColumns?: Set<string>;
  onRowClick?: (row: T) => void;
  onRowHover?: (row: T) => void;
  emptyMessage?: string;
  emptyState?: React.ReactNode;
  rowPrefix?: (row: T) => React.ReactNode;
  prefixHeader?: React.ReactNode;
  rowSuffix?: (row: T) => React.ReactNode;
  suffixHeader?: React.ReactNode;
  rowClassName?: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  columnGroups,
  rows,
  rowGroups,
  getRowKey,
  sortKey,
  sortDir = "asc",
  onSortChange,
  visibleColumns,
  onRowClick,
  onRowHover,
  emptyMessage = "No results.",
  emptyState,
  rowPrefix,
  prefixHeader,
  rowSuffix,
  suffixHeader,
  rowClassName,
  className,
}: DataTableProps<T>) {
  const [collapsedRowGroups, setCollapsedRowGroups] = useState<Set<string>>(new Set());

  const effectiveCols = useMemo(() => {
    if (!visibleColumns) return columns;
    return columns.filter((c) => c.alwaysVisible || visibleColumns.has(c.key));
  }, [columns, visibleColumns]);

  const hasGroups =
    !!columnGroups?.length && effectiveCols.some((c) => c.groupId);

  const ungroupedCols = hasGroups
    ? effectiveCols.filter((c) => !c.groupId)
    : effectiveCols;
  const groupedCols = effectiveCols.filter((c) => c.groupId);

  const activeGroups = useMemo(() => {
    if (!columnGroups) return [];
    const visibleGroupIds = new Set(groupedCols.map((c) => c.groupId));
    return columnGroups.filter((g) => visibleGroupIds.has(g.id));
  }, [columnGroups, groupedCols]);

  // Keys of the first column in each group — used to render left-border separators.
  const firstInGroupKeys = useMemo(() => {
    if (!hasGroups) return new Set<string>();
    const keys = new Set<string>();
    let lastGroupId: string | undefined;
    for (const col of effectiveCols) {
      if (col.groupId && col.groupId !== lastGroupId) {
        keys.add(col.key);
        lastGroupId = col.groupId;
      }
    }
    return keys;
  }, [hasGroups, effectiveCols]);

  const allRows = rowGroups ? rowGroups.flatMap((g) => g.rows) : (rows ?? []);
  const isEmpty = allRows.length === 0;

  const totalColCount =
    (rowPrefix ? 1 : 0) + effectiveCols.length + (rowSuffix ? 1 : 0);

  function toggleRowGroup(key: string) {
    setCollapsedRowGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function sortIcon(colSortKey: string) {
    if (sortKey === colSortKey) {
      return sortDir === "asc" ? (
        <ArrowUp className="h-3 w-3 shrink-0" />
      ) : (
        <ArrowDown className="h-3 w-3 shrink-0" />
      );
    }
    return <ArrowUpDown className="h-3 w-3 shrink-0 opacity-20" />;
  }

  function renderColHeader(col: ColumnDef<T>, borderLeft = false) {
    const isRight = col.align === "right";
    return (
      <TableHead
        key={col.key}
        className={cn(col.className, isRight && "text-right", borderLeft && "border-l border-border/40")}
      >
        {col.sortKey ? (
          <button
            onClick={() => onSortChange?.(col.sortKey!)}
            className={cn(
              "inline-flex items-center gap-1 text-xs text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors",
              isRight && "flex-row-reverse w-full justify-end",
              sortKey === col.sortKey && "text-foreground"
            )}
          >
            {col.label}
            {sortIcon(col.sortKey)}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground uppercase tracking-wider">
            {col.label}
          </span>
        )}
      </TableHead>
    );
  }

  function renderUngroupedHeader(col: ColumnDef<T>) {
    const isRight = col.align === "right";
    return (
      <TableHead
        key={col.key}
        rowSpan={2}
        className={cn(col.className, isRight && "text-right")}
      >
        {col.sortKey ? (
          <button
            onClick={() => onSortChange?.(col.sortKey!)}
            className={cn(
              "inline-flex items-center gap-1 text-xs text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors",
              sortKey === col.sortKey && "text-foreground"
            )}
          >
            {col.label}
            {sortIcon(col.sortKey)}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground uppercase tracking-wider">
            {col.label}
          </span>
        )}
      </TableHead>
    );
  }

  function renderDataRow(row: T) {
    return (
      <TableRow
        key={getRowKey(row)}
        className={cn(
          "transition-colors group",
          onRowClick && "cursor-pointer hover:bg-muted/20",
          rowClassName
        )}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
        onMouseEnter={onRowHover ? () => onRowHover(row) : undefined}
      >
        {rowPrefix && <TableCell>{rowPrefix(row)}</TableCell>}
        {effectiveCols.map((col) => (
          <TableCell
            key={col.key}
            className={cn(
              col.className,
              col.align === "right" && "text-right",
              hasGroups && firstInGroupKeys.has(col.key) && "border-l border-border/40"
            )}
          >
            {col.render(row)}
          </TableCell>
        ))}
        {rowSuffix && <TableCell>{rowSuffix(row)}</TableCell>}
      </TableRow>
    );
  }

  return (
    <table className={cn("w-full caption-bottom text-xs", className)}>
      <TableHeader
        className="sticky top-0 z-20 bg-[var(--surface-2)] backdrop-blur-md"
      >
        {hasGroups ? (
          <>
            <TableRow>
              {rowPrefix && (
                <TableHead rowSpan={2} className="w-10">
                  {prefixHeader}
                </TableHead>
              )}
              {ungroupedCols.map((col) => renderUngroupedHeader(col))}
              {activeGroups.map((group) => {
                const gCols = groupedCols.filter((c) => c.groupId === group.id);
                return (
                  <TableHead
                    key={group.id}
                    colSpan={gCols.length}
                    className={cn(
                      "text-left align-bottom pb-1.5",
                      "border-l border-border/40"
                    )}
                  >
                    <span
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-widest",
                        group.accentColor ?? "text-sky-400/80"
                      )}
                    >
                      {group.label}
                    </span>
                    <div
                      className={cn(
                        "h-px mt-0.5",
                        group.accentBgColor ?? (group.accentColor ? group.accentColor.replace("text-", "bg-") : "bg-sky-400/30")
                      )}
                    />
                  </TableHead>
                );
              })}
              {rowSuffix && (
                <TableHead rowSpan={2} className="w-12">
                  {suffixHeader}
                </TableHead>
              )}
            </TableRow>
            <TableRow>
              {activeGroups.flatMap((group) =>
                groupedCols
                  .filter((c) => c.groupId === group.id)
                  .map((col, colIdx) => renderColHeader(col, colIdx === 0))
              )}
            </TableRow>
          </>
        ) : (
          <TableRow>
            {rowPrefix && (
              <TableHead className="w-10">{prefixHeader}</TableHead>
            )}
            {effectiveCols.map((col) => renderColHeader(col))}
            {rowSuffix && (
              <TableHead className="w-12">{suffixHeader}</TableHead>
            )}
          </TableRow>
        )}
      </TableHeader>
      <TableBody>
        {isEmpty ? (
          <tr>
            <td
              colSpan={totalColCount}
              className="py-8 text-center text-sm text-muted-foreground"
            >
              {emptyState ?? emptyMessage}
            </td>
          </tr>
        ) : rowGroups ? (
          rowGroups.map((group) => {
            const isCollapsed = collapsedRowGroups.has(group.key);
            return (
              <React.Fragment key={group.key}>
                <TableRow
                  className="bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => toggleRowGroup(group.key)}
                >
                  <TableCell colSpan={totalColCount} className="py-2.5 px-4">
                    <div className="flex items-center gap-2 select-none">
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                      {group.label}
                      <span className="ml-2 font-normal opacity-70 text-muted-foreground text-xs">
                        ({group.rows.length})
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
                {!isCollapsed && group.rows.map((row) => renderDataRow(row))}
              </React.Fragment>
            );
          })
        ) : (
          rows?.map((row) => renderDataRow(row))
        )}
      </TableBody>
    </table>
  );
}
