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
  /** When true, pressing Enter anywhere in the dialog triggers Confirm (dialog has no text inputs). */
  confirmOnEnter?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title = "Delete record?",
  description = "This action cannot be undone.",
  confirmLabel = "Delete",
  onConfirm,
  isPending,
  confirmOnEnter = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm"
        onKeyDown={
          confirmOnEnter
            ? (e) => {
                if (e.key === "Enter" && !isPending) {
                  e.preventDefault();
                  e.stopPropagation();
                  onConfirm();
                }
              }
            : undefined
        }
      >
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
