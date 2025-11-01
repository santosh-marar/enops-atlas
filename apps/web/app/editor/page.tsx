"use client";

import DBMLEditor from "@/components/custom/dbml-editor";

export default function EditorPage() {
  return (
    <div className="h-screen flex w-full">
      <div className="min-w-2xl h-full">
        <DBMLEditor />
      </div>
    </div>
  );
}
