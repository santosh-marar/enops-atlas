import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface SaveVersionModalProps {
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (changeDescription: string) => Promise<void>;
}

export function SaveVersionModal({
  isOpen,
  isSaving,
  onClose,
  onSave,
}: SaveVersionModalProps) {
  const [message, setMessage] = useState("");

  const handleSave = async () => {
    await onSave(message.trim());
    setMessage("");
    onClose();
  };

  return (
    <Dialog onOpenChange={onClose} open={isOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Version</DialogTitle>
        </DialogHeader>
        <Textarea
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe what changed (optional)"
          rows={3}
          value={message}
        />
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={isSaving} onClick={handleSave}>
            {isSaving ? "Saving..." : "Save Version"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
