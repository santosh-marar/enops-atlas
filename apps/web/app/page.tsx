"use client";

import { useRef } from "react";
import DBMLEditor from "@/components/custom/dbml-editor";
import XYFlows from "@/components/custom/xyflows";
import { TopToolbar } from "@/components/custom/top-toolbar";

export default function Home() {
  const flowContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex h-screen w-full flex-col">
      <TopToolbar flowContainerRef={flowContainerRef} />
      <div className="flex h-[calc(100vh-3rem)] w-full">
        <div className="h-full min-w-2xl">
          <DBMLEditor />
        </div>
        <div className="w-full" ref={flowContainerRef}>
          <XYFlows />
        </div>
      </div>
    </div>
  );
}

