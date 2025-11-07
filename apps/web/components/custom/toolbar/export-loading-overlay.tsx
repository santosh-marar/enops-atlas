import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExportLoadingOverlayProps {
  isExporting: boolean;
  isCancelling: boolean;
  onCancel: (e: React.MouseEvent) => void;
}

export function ExportLoadingOverlay({
  isExporting,
  isCancelling,
  onCancel,
}: ExportLoadingOverlayProps) {
  if (!isExporting) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="rounded-lg border border-border bg-card p-6 shadow-lg">
        <div className="flex flex-col items-center gap-4">
          {!isCancelling && (
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          )}
          <div className="text-center">
            <div className="font-semibold">Exporting Diagram...</div>
            <div className="text-sm text-muted-foreground">
              This may take a few seconds
            </div>
          </div>
          <Button
            onClick={onCancel}
            disabled={isCancelling}
            variant="destructive"
          >
            {isCancelling ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Cancelling...
              </>
            ) : (
              <>
                <X className="h-4 w-4" />
                Cancel
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
