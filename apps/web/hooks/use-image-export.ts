import { useState, useRef } from "react";
import { toast } from "sonner";

const loadImageExport = () => import("html-to-image");

interface UseImageExportProps {
  flowContainerRef?: React.RefObject<HTMLDivElement | null>;
  projectName: string;
}

export function useImageExport({
  flowContainerRef,
  projectName,
}: UseImageExportProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const exportCancelRef = useRef(false);

  const handleExportImage = async (format: "png" | "jpeg" | "svg") => {
    if (!flowContainerRef?.current) {
      toast.error("Flow diagram not found");
      return;
    }

    if (isExporting) return;

    exportCancelRef.current = false;
    setIsExporting(true);
    setIsCancelling(false);

    setTimeout(async () => {
      try {
        if (exportCancelRef.current) {
          toast.info("Export cancelled");
          setIsExporting(false);
          setIsCancelling(false);
          return;
        }

        const imageLib = await loadImageExport();

        if (exportCancelRef.current) {
          toast.info("Export cancelled");
          setIsExporting(false);
          setIsCancelling(false);
          return;
        }

        const { toPng, toJpeg, toSvg } = imageLib;
        const element = flowContainerRef.current;
        if (!element) {
          setIsExporting(false);
          setIsCancelling(false);
          return;
        }

        let dataUrl: string;

        if (format === "png") {
          dataUrl = await toPng(element, {
            quality: 0.95,
            pixelRatio: 1.5,
            cacheBust: false,
          });
        } else if (format === "jpeg") {
          dataUrl = await toJpeg(element, {
            quality: 0.9,
            pixelRatio: 1.5,
            cacheBust: false,
          });
        } else {
          dataUrl = await toSvg(element, { cacheBust: false });
        }

        if (exportCancelRef.current) {
          toast.info("Export cancelled");
          setIsExporting(false);
          setIsCancelling(false);
          return;
        }

        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `${projectName.replace(/\s+/g, "_")}_diagram.${format}`;
        a.click();
        toast.success("Diagram exported successfully!");
      } catch (error) {
        if (!exportCancelRef.current) {
          toast.error("Failed to export image. Please try again.");
        }
      } finally {
        setIsExporting(false);
        setIsCancelling(false);
        exportCancelRef.current = false;
      }
    }, 50);
  };

  const handleCancelExport = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (isCancelling) return;

    setIsCancelling(true);
    exportCancelRef.current = true;
  };

  return {
    isExporting,
    isCancelling,
    handleExportImage,
    handleCancelExport,
  };
}
