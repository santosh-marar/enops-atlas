"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportProblems } from "@/lib/code-export";
import { useSchemaStore } from "@/store/use-schema-store";
import { AIDialog } from "./ai-dialog";
import { exportFlowAsImage, type ImageFormat } from "./image";
import { exportCanonicalDBML, exportDBML, exportSchemaJSON } from "./schema";
import { type SQLDialect, sqlDatabases } from "./sql-databases";
import { ExportSQLDialog } from "./sql-dialog";

export function Export() {
  const [open, setOpen] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [sqlDialogOpen, setSqlDialogOpen] = useState(false);
  const [sqlDialect, setSqlDialect] = useState<SQLDialect>("postgres");
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  const { nodes, edges, dbml } = useSchemaStore();

  // Why an SQL export would be refused, per database, shown next to the item.
  const sqlProblems = useMemo(
    () =>
      Object.fromEntries(
        sqlDatabases.map((d) => [d.value, exportProblems(dbml, "sql", d.value)])
      ),
    [dbml]
  );

  const handleOpen = () => {
    clearTimeout(closeTimeoutRef.current);
    setOpen(true);
  };

  const handleClose = () => {
    closeTimeoutRef.current = setTimeout(() => setOpen(false), 100);
  };

  const handleImageExport = async (format: ImageFormat) => {
    try {
      await exportFlowAsImage({ format, nodes });
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to export image");
    }
  };

  const handleSchemaJSONExport = () => {
    if (!dbml) {
      toast.error("No schema to export. Please create a schema first.");
      return;
    }
    try {
      exportSchemaJSON(dbml);
      toast.success("Schema JSON exported");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    }
  };

  const handleCanonicalDBMLExport = () => {
    if (!dbml) {
      toast.error("No schema to export. Please create a schema first.");
      return;
    }
    try {
      exportCanonicalDBML(dbml);
      toast.success("Canonical DBML exported");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    }
  };

  const handleDBMLExport = () => {
    if (!dbml) {
      toast.error("No schema to export. Please create a schema first.");
      return;
    }
    exportDBML(dbml);
    toast.success("DBML exported");
  };

  const handleSqlDatabaseSelect = (dialect: SQLDialect) => {
    setSqlDialect(dialect);
    setSqlDialogOpen(true);
  };

  return (
    <>
      <DropdownMenu modal={false} onOpenChange={setOpen} open={open}>
        <DropdownMenuTrigger
          onMouseEnter={handleOpen}
          onMouseLeave={handleClose}
          render={
            <Button size="sm" variant="ghost">
              Export
            </Button>
          }
        />

        <DropdownMenuContent
          align="start"
          className="mt-1.5 w-48"
          onMouseEnter={handleOpen}
          onMouseLeave={handleClose}
        >
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Export image</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-36">
                <DropdownMenuItem onClick={() => handleImageExport("png")}>
                  as PNG
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleImageExport("jpg")}>
                  as JPG
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleImageExport("svg")}>
                  as SVG
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Export as</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-36">
                <DropdownMenuItem onClick={handleSchemaJSONExport}>
                  Schema (.json)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDBMLExport}>
                  .dbml
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCanonicalDBMLExport}>
                  .dbml (canonical)
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Export as SQL</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-44">
                {sqlDatabases.map((d) => (
                  <DropdownMenuItem
                    key={d.value}
                    onClick={() => handleSqlDatabaseSelect(d.value)}
                  >
                    {d.label}
                    {sqlProblems[d.value]?.length ? (
                      <span
                        className="ml-auto text-yellow-600"
                        title={sqlProblems[d.value]?.join("\n")}
                      >
                        !
                      </span>
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuItem onClick={() => setAiDialogOpen(true)}>
            Export as ORM
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AIDialog onOpenChange={setAiDialogOpen} open={aiDialogOpen} />
      <ExportSQLDialog
        dialect={sqlDialect}
        onDialectChange={setSqlDialect}
        onOpenChange={setSqlDialogOpen}
        open={sqlDialogOpen}
      />
    </>
  );
}
