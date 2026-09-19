"use client";

import { Panel } from "@xyflow/react";
import { Search, X } from "lucide-react";
import { forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TableSearchProps {
  onSearchChange: (query: string) => void;
  resultCount: number;
  searchQuery: string;
  totalCount: number;
}

export const TableSearch = forwardRef<HTMLInputElement, TableSearchProps>(
  ({ searchQuery, onSearchChange, resultCount, totalCount }, ref) => (
    <Panel
      className="rounded-lg border border-border/60 bg-card/95 shadow-lg backdrop-blur-sm"
      position="top-center"
    >
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 z-10 h-4 w-4 text-muted-foreground" />
        <Input
          className="w-[320px] border-0 bg-transparent pr-10 pl-10 focus-visible:ring-2 focus-visible:ring-primary/50"
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search tables, schemas, columns..."
          ref={ref}
          type="text"
          value={searchQuery}
        />
        {searchQuery && (
          <Button
            className="absolute right-1 h-6 w-6 rounded-full"
            onClick={() => onSearchChange("")}
            size="icon"
            variant="ghost"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      {searchQuery && (
        <div className="mt-1 border-border/60 border-t px-3 py-1.5 text-[10px] text-muted-foreground">
          {resultCount === 0 ? (
            <span className="text-destructive">No results found</span>
          ) : (
            <span>
              Found {resultCount} table{resultCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
      )}
    </Panel>
  )
);

TableSearch.displayName = "TableSearch";
