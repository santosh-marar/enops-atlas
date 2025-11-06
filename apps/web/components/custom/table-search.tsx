"use client";

import { Panel } from "@xyflow/react";
import { Search, X } from "lucide-react";

interface TableSearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  resultCount: number;
  totalCount: number;
}

export function TableSearch({
  searchQuery,
  onSearchChange,
  resultCount,
  totalCount,
}: TableSearchProps) {
  return (
    <Panel
      position="top-center"
      className="rounded-lg border border-border/60 bg-card/95 shadow-lg backdrop-blur-sm"
    >
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search tables, schemas, columns..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-[320px] rounded-lg border-0 bg-transparent py-2 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-3 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {searchQuery && (
        <div className="mt-1 border-t border-border/60 px-3 py-1.5 text-[10px] text-muted-foreground">
          {resultCount === 0 ? (
            <span className="text-destructive">No results found</span>
          ) : (
            <span>
              Found {resultCount} table{resultCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}
    </Panel>
  );
}
