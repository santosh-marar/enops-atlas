"use client";

import { getNodesBounds, getViewportForBounds, type Node } from "@xyflow/react";
import { toJpeg, toPng, toSvg } from "html-to-image";

export type ImageFormat = "png" | "jpg" | "svg";

interface ExportImageOptions {
  fileName?: string;
  format: ImageFormat;
  nodes: Node[];
  padding?: number;
}

// React Flow UI chrome — not part of the actual diagram, skip in exports.
const EXCLUDED_CLASSES = [
  "react-flow__minimap",
  "react-flow__controls",
  "react-flow__panel",
  "react-flow__attribution",
];

function shouldExcludeNode(node: HTMLElement): boolean {
  if (!node.classList) return true;
  return !EXCLUDED_CLASSES.some((cls) => node.classList.contains(cls));
}

function getCanvasBackgroundColor(): string {
  if (typeof document === "undefined") return "#ffffff";
  const flowEl = document.querySelector(".react-flow") as HTMLElement | null;
  const bg = flowEl ? getComputedStyle(flowEl).backgroundColor : "";
  if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
    return bg;
  }
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  return bodyBg && bodyBg !== "rgba(0, 0, 0, 0)" ? bodyBg : "#ffffff";
}

export async function exportFlowAsImage({
  nodes,
  format,
  fileName = "diagram",
  padding = 0.15,
}: ExportImageOptions) {
  if (nodes.length === 0) {
    throw new Error("No nodes to export");
  }

  const bounds = getNodesBounds(nodes);
  const imageWidth = Math.max(bounds.width * (1 + padding * 2), 400);
  const imageHeight = Math.max(bounds.height * (1 + padding * 2), 300);

  const viewport = getViewportForBounds(
    bounds,
    imageWidth,
    imageHeight,
    0.5,
    2,
    padding
  );

  const viewportEl = document.querySelector(
    ".react-flow__viewport"
  ) as HTMLElement | null;
  if (!viewportEl) {
    throw new Error("Could not find flow viewport element");
  }

  const backgroundColor = getCanvasBackgroundColor();

  const captureOptions = {
    backgroundColor,
    filter: shouldExcludeNode,
    height: imageHeight,
    pixelRatio: 2, // crisp export, not blurry on retina displays
    style: {
      height: `${imageHeight}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
      width: `${imageWidth}px`,
    },
    width: imageWidth,
  };

  let dataUrl: string;
  switch (format) {
    case "png":
      dataUrl = await toPng(viewportEl, captureOptions);
      break;
    case "jpg":
      dataUrl = await toJpeg(viewportEl, { ...captureOptions, quality: 0.95 });
      break;
    case "svg":
      dataUrl = await toSvg(viewportEl, captureOptions);
      break;
  }

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `${fileName}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
