"use client";

import DBMLEditor from "@/components/custom/dbml-editor";
import XYFlows from "@/components/custom/xyflows";

export default function EditorPage() {
  return (
    <div className="h-screen flex w-full">
      <div className="min-w-2xl h-full">
        <DBMLEditor />
      </div>
      <div className="w-full">
        <XYFlows />
      </div>
    </div>
  );
}
