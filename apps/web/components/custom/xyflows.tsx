"use client";

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useSchemaStore } from "@/store/use-schema-store";
import {TableNode} from "./table-node";
import { useTheme } from "next-themes";

const nodeTypes = {
  table: TableNode,
};

export default function XYFlows() {

  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  const { nodes, edges } = useSchemaStore();

  return (
    <div className="h-full w-full bg-neutral-800">
      <div className="bg-background text-primary px-4 py-3 font-semibold">
        Visual ERD
      </div>
      <div className="h-[calc(100%-40px)] bg-background font-mono text-sm">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-right"
          minZoom={0.2}
          maxZoom={2}
          className="dark:bg-background bg-background"
        >
          <Background color={isDark ? "#000" : "#fff"} gap={16} />
          <Controls
            style={{
              backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#fff",
              color: isDark ? "#000" : "#000",
            }}
          />
          {/* <MiniMap nodeColor={"#fff"} nodeBorderRadius={2} /> */}
          <Panel
            position="top-left"
            className="border-transparent bg-neutral-800 rounded shadow-lg"
          >
            <div className=" text-sm font-medium">
              📊 {nodes.length} Tables • 🔗 {edges.length} Relations
            </div>
          </Panel>
        </ReactFlow>
      </div>
    </div>
  );
}
