import { useState } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";

export interface Column {
  name: string;
  type: string;
  primaryKey?: boolean;
  nullable?: boolean;
  foreignKey?: boolean;
}

export interface TableNodeData {
  label: string;
  columns: Column[];
}

export function TableNode({ data, id }: NodeProps) {
  const [hoveredField, setHoveredField] = useState<string | null>(null);

  return (
    <div className="bg-card border border-border rounded  min-w-[200px] shadow-lg">
      <div className="bg-primary text-foreground px-4 py-2 text-sm font-semibold border-b border-border rounded-t-md">
        {data.label as string}
      </div>

      <div className="">
        {/*@ts-ignore*/}
        {data.columns?.map((col: any, idx: number) => (
          <div
            key={idx}
            className="relative px-2 py-1 text-sm border-b last:border-b-0 flex items-center hover:bg-accent transition-colors group"
            onMouseEnter={() => setHoveredField(col.name)}
            onMouseLeave={() => setHoveredField(null)}
          >
            {col.foreignKey && (
              <Handle
                type="target"
                position={Position.Left}
                id={`${id}-${col.name}-target`}
                style={{
                  left: -4,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 8,
                  height: 8,
                  background: col.isForeignKey ? "#f59e0b" : "#22c55e",
                  border: "1px solid rgba(15,23,42,0.9)",
                  borderRadius: "50%",
                  cursor: "crosshair",
                  boxShadow: col.isForeignKey
                    ? "0 0 0 4px rgba(245,158,11,0.2)"
                    : "0 0 0 4px rgba(34,197,94,0.2)",
                }}
                className="!opacity-50 group-hover:!opacity-100 group-hover:!scale-110 transition-all duration-200"
                title={`Connect to ${col.name}`}
              />
            )}

            <div className="flex items-center gap-2 flex-1">
              {col.primaryKey && (
                <span className="text-yellow-600 font-bold">🔑</span>
              )}
              {col.foreignKey && !col.primaryKey && (
                <span className="text-orange-500 font-bold">🔗</span>
              )}
              <span className="font-semibold text-foreground">{col.name}</span>
              <span className="text-muted-foreground text-xs font-mono">
                {col.type}
              </span>
            </div>

            {col.primaryKey && (
              <Handle
                type="source"
                position={Position.Right}
                id={`${id}-${col.name}-source`}
                style={{
                  right: -4,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 8,
                  height: 8,
                  background: col.isPrimaryKey ? "#3b82f6" : "#22d3ee",
                  border: "2px solid rgba(15,23,42,0.9)",
                  borderRadius: "50%",
                  cursor: "crosshair",
                  boxShadow: col.isPrimaryKey
                    ? "0 0 0 4px rgba(59,130,246,0.2)"
                    : "0 0 0 4px rgba(34,211,238,0.2)",
                }}
                className="!opacity-50 group-hover:!opacity-100 group-hover:!scale-110 transition-all duration-200"
                title={`Connect from $ col.name}`}
              />
            )}
          </div>
        ))}
      </div>

      <Handle type="target" position={Position.Top} style={{ opacity: 0.3 }} />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0.3 }}
      />
    </div>
  );
}

// USAGE IN PARENT:
/*
import { Node } from "@xyflow/react";
import { TableNode, TableNodeData } from "./TableNode";

const nodeTypes = {
  table: TableNode,
};

const nodes: Node<TableNodeData>[] = tables.map((table) => ({
  id: table.id,
  type: "table",
  position: table.position || { x: 0, y: 0 },
  data: {
    label: table.name,
    columns: table.columns,
  },
}));

<ReactFlow
  nodes={nodes}
  edges={edges}
  nodeTypes={nodeTypes}
/>
*/
