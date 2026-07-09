"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  isPending?: boolean;
  /**
   * Focus the Confirm button on open so Enter completes immediately.
   * Opt-in ONLY for non-destructive confirms (e.g. "Discard unsaved changes?").
   * Default is Cancel-focused: this dialog's confirm button is destructive
   * (Delete / Deactivate), so it must fail safe — an accidental Enter can never destroy.
   */
  focusConfirm?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title = "Delete record?",
  description = "This action cannot be undone.",
  confirmLabel = "Delete",
  onConfirm,
  isPending,
  focusConfirm = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" confirmNav confirmNavFocus={focusConfirm ? "last" : "first"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? "Please wait…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
