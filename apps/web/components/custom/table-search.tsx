"use client";

import { Panel } from "@xyflow/react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
        <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
        <Input
          type="text"
          placeholder="Search tables, schemas, columns..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-[320px] border-0 bg-transparent pl-10 pr-10 focus-visible:ring-2 focus-visible:ring-primary/50"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onSearchChange("")}
            className="absolute right-1 h-6 w-6 rounded-full"
          >
            <X className="h-3 w-3" />
          </Button>
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
